import { AppError } from '../errors.js';
import { monthLabel, periodKey, MONTH_ABBR } from '../period.js';
import { driveConfigured, listDrive, downloadDrive } from './drive.js';
import { supabaseAdmin, listStorage, downloadStorage } from './storage.js';

const LIST_TTL = 60 * 1000;
const state = (globalThis.__salarySrc ||= { list: null, listAt: 0, buffers: new Map() });

export const sourcesAvailable = () => ({ drive: driveConfigured(), upload: !!supabaseAdmin() });

/** Lists every available salary sheet (Drive + uploads), keyed by the month and year in its name. */
export async function listSalaryFiles({ refresh = false } = {}) {
  if (!refresh && state.list && Date.now() - state.listAt < LIST_TTL) return state.list;
  const avail = sourcesAvailable();
  if (!avail.drive && !avail.upload) {
    throw new AppError('NO_SOURCE', 'No salary-sheet source is configured. Set the Google Drive variables (GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_ROOT_FOLDER_ID) and/or the Supabase variables. See the README.', 503);
  }

  const warnings = [];
  const all = [];
  const jobs = [];
  if (avail.drive) jobs.push(['Google Drive', listDrive()]);
  if (avail.upload) jobs.push(['Uploaded files', listStorage()]);
  const results = await Promise.allSettled(jobs.map((j) => j[1]));
  let anySuccess = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      anySuccess = true;
      all.push(...r.value.files);
      warnings.push(...r.value.warnings);
    } else {
      warnings.push(`${jobs[i][0]}: ${r.reason?.message || 'could not be read'}`);
    }
  });
  if (!anySuccess) throw new AppError('SOURCE_FAILED', warnings.join(' | '), 502);

  // One file per month: if several exist, use the most recently modified.
  const groups = new Map();
  for (const f of all) {
    const k = periodKey(f.year, f.month);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const files = [];
  for (const [, g] of groups) {
    g.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
    files.push(g[0]);
    if (g.length > 1) {
      warnings.push(`More than one file exists for ${monthLabel(g[0].year, g[0].month)}. Using the newest ("${g[0].name}"); ignoring: ${g.slice(1).map((x) => `"${x.name}"`).join(', ')}.`);
    }
  }

  const byYear = new Map();
  for (const f of files) {
    if (!byYear.has(f.year)) byYear.set(f.year, []);
    byYear.get(f.year).push(f);
  }
  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, fs]) => ({
      year,
      months: fs
        .sort((a, b) => a.month - b.month)
        .map((f) => ({ month: f.month, name: MONTH_ABBR[f.month - 1], fileName: f.name, source: f.source, modified: f.modified || null })),
    }));

  state.list = { files, years, warnings, sources: avail, generatedAt: new Date().toISOString() };
  state.listAt = Date.now();
  return state.list;
}

export function clearCaches() {
  state.list = null;
  state.listAt = 0;
  state.buffers.clear();
}

export async function findSalaryFile(year, month, { refresh = false } = {}) {
  let list = await listSalaryFiles({ refresh });
  let file = list.files.find((f) => f.year === year && f.month === month);
  if (!file && !refresh) {
    // The remembered list may be stale (another server instance just stored a new file): look again once.
    list = await listSalaryFiles({ refresh: true });
    file = list.files.find((f) => f.year === year && f.month === month);
  }
  if (!file) {
    const avail = list.files.filter((f) => f.year === year).map((f) => MONTH_ABBR[f.month - 1]);
    throw new AppError(
      'FILE_NOT_FOUND',
      `No salary sheet was found for ${monthLabel(year, month)}. Add a file whose name contains the month and year (for example "Salary Sheet - ${monthLabel(year, month)}") to the ${year} folder, then press Refresh.` +
        (avail.length ? ` Months currently available for ${year}: ${avail.join(', ')}.` : ` No files were found for ${year} at all.`),
      404,
    );
  }
  return file;
}

export async function getSalaryFile(year, month, { refresh = false } = {}) {
  const file = await findSalaryFile(year, month, { refresh });
  const key = `${file.source}:${file.ref}:${file.modified}`;
  if (!refresh && state.buffers.has(key)) return { ...file, buffer: state.buffers.get(key) };
  const buffer = file.source === 'drive' ? await downloadDrive(file) : await downloadStorage(file);
  if (state.buffers.size >= 6) state.buffers.delete(state.buffers.keys().next().value);
  state.buffers.set(key, buffer);
  return { ...file, buffer };
}
