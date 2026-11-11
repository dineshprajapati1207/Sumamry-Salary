import { google } from 'googleapis';
import { parseMonthYear, parseYearFolder, monthLabel } from '../period.js';
import { AppError } from '../errors.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GSHEET = 'application/vnd.google-apps.spreadsheet';
const FOLDER = 'application/vnd.google-apps.folder';

export const driveConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.DRIVE_ROOT_FOLDER_ID);

export function serviceAccountInfo() {
  let raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw.startsWith('{')) {
    try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch { /* fall through to the JSON error */ }
  }
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new AppError('DRIVE_CONFIG', 'GOOGLE_SERVICE_ACCOUNT_JSON in Vercel is not valid JSON. Paste the entire downloaded key file as ONE line (starting with { and ending with }), then redeploy.', 500);
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new AppError('DRIVE_CONFIG', 'GOOGLE_SERVICE_ACCOUNT_JSON does not look like a service-account key (client_email / private_key missing). Create a JSON key for a service account and paste its full contents.', 500);
  }
  return credentials;
}

function client() {
  const credentials = serviceAccountInfo();
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return { drive: google.drive({ version: 'v3', auth }), email: credentials.client_email };
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
      corpora: 'allDrives',
    });
    out.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

const SHEET_MIMES = new Set([GSHEET, XLSX_MIME, 'application/vnd.ms-excel', 'application/vnd.ms-excel.sheet.macroEnabled.12']);
const isSheet = (f) => SHEET_MIMES.has(f.mimeType) || /\.(xls|xlsx|xlsm)$/i.test(f.name);

/** Lists every salary sheet under the root folder (year sub-folders, or loose files in the root). */
export async function listDrive() {
  const { drive, email } = client();
  const ROOT = String(process.env.DRIVE_ROOT_FOLDER_ID).trim();
  const warnings = [];
  const files = [];
  const ignored = [];

  // 1) Can the service account open the root folder at all? (A folder it cannot see simply lists as "empty".)
  let rootInfo;
  try {
    rootInfo = (await drive.files.get({ fileId: ROOT, fields: 'id, name, mimeType', supportsAllDrives: true })).data;
  } catch (e) {
    throw new AppError(
      'DRIVE_ACCESS',
      `The Google service account (${email}) cannot open the Drive folder ${ROOT}. In Google Drive, right-click the folder, choose Share, add ${email} as Viewer, then press Refresh. Also check DRIVE_ROOT_FOLDER_ID is the ID from the folder link (the part after /folders/). Google said: ${e?.message || 'unknown error'}`,
      502,
    );
  }
  if (rootInfo.mimeType !== FOLDER) {
    warnings.push(`DRIVE_ROOT_FOLDER_ID points to "${rootInfo.name}", which is a file, not a folder. Use the ID of the folder that contains the year folders.`);
  }

  let top;
  try {
    top = await children(drive, ROOT);
  } catch (e) {
    throw new AppError('DRIVE_ACCESS', `Google Drive could not be read (${e?.message || 'unknown error'}).`, 502);
  }
  if (!top.length) {
    warnings.push(`Google Drive folder "${rootInfo.name}" is reachable but empty. Put the year folder (for example "2026") with the monthly sheets inside it, or put the sheets directly in this folder.`);
  }

  const consider = (f, folderYear, folderName) => {
    if (!isSheet(f)) {
      if (f.mimeType !== FOLDER) ignored.push(`${f.name}${folderName ? ` (in ${folderName})` : ''}`);
      return;
    }
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
      if (!inner.length) warnings.push(`The folder "${item.name}" is empty (or not shared with ${email}).`);
      inner.forEach((f) => consider(f, y, item.name));
    } else {
      consider(item, null, null);
    }
  }
  if (ignored.length) {
    warnings.push(`Ignored ${ignored.length} item(s) that are not Excel / Google Sheets files: ${ignored.slice(0, 8).join('; ')}${ignored.length > 8 ? '; ...' : ''}.`);
  }
  if (!files.length && top.length) {
    warnings.push(`Google Drive folder "${rootInfo.name}" has ${top.length} item(s) (${top.slice(0, 6).map((x) => x.name).join(', ')}) but no usable salary sheet was found.`);
  }
  return { files, warnings };
}

export async function downloadDrive(file) {
  const { drive } = client();
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
