import { google } from 'googleapis';
import { parseMonthYear, parseYearFolder, monthLabel } from '../period.js';
import { AppError } from '../errors.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GSHEET = 'application/vnd.google-apps.spreadsheet';
const FOLDER = 'application/vnd.google-apps.folder';

export const driveConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.DRIVE_ROOT_FOLDER_ID);

function client() {
  let raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8'); // also accept base64
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new AppError('DRIVE_CONFIG', 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.', 500);
  }
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth });
}

async function children(drive, folderId) {
  const out = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    out.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

const isSheet = (f) => f.mimeType === GSHEET || /\.(xls|xlsx|xlsm)$/i.test(f.name);

/** Lists every salary sheet under the root folder (year sub-folders, or loose files in the root). */
export async function listDrive() {
  const drive = client();
  const warnings = [];
  const files = [];
  let top;
  try {
    top = await children(drive, process.env.DRIVE_ROOT_FOLDER_ID);
  } catch (e) {
    throw new AppError('DRIVE_ACCESS', `Google Drive could not be read (${e?.message || 'unknown error'}). Check that the folder is shared with the service account and DRIVE_ROOT_FOLDER_ID is correct.`, 502);
  }

  const consider = (f, folderYear, folderName) => {
    if (!isSheet(f)) return;
    const p = parseMonthYear(f.name);
    if (!p) {
      warnings.push(`Ignored "${f.name}"${folderName ? ` in folder "${folderName}"` : ''}: no month and year found in the file name (expected something like "Salary Sheet - Oct'26").`);
      return;
    }
    if (folderYear && folderYear !== p.year) {
      warnings.push(`"${f.name}" is in the ${folderYear} folder but its name says ${monthLabel(p.year, p.month)}. The file name is used.`);
    }
    files.push({ year: p.year, month: p.month, name: f.name, source: 'drive', ref: f.id, mime: f.mimeType, modified: f.modifiedTime });
  };

  for (const item of top) {
    if (item.mimeType === FOLDER) {
      const y = parseYearFolder(item.name);
      if (!y) {
        warnings.push(`Ignored folder "${item.name}": its name has no year (expected e.g. "2026").`);
        continue;
      }
      const inner = await children(drive, item.id);
      inner.forEach((f) => consider(f, y, item.name));
    } else {
      consider(item, null, null);
    }
  }
  return { files, warnings };
}

export async function downloadDrive(file) {
  const drive = client();
  try {
    const res =
      file.mime === GSHEET
        ? await drive.files.export({ fileId: file.ref, mimeType: XLSX_MIME }, { responseType: 'arraybuffer' })
        : await drive.files.get({ fileId: file.ref, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
  } catch (e) {
    throw new AppError('DRIVE_DOWNLOAD', `The file "${file.name}" could not be downloaded from Google Drive (${e?.message || 'unknown error'}).`, 502);
  }
}
