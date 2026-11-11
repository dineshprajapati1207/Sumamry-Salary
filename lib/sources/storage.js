import { createClient } from '@supabase/supabase-js';
import { parseMonthYear, parseYearFolder, monthLabel } from '../period.js';
import { AppError } from '../errors.js';

const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');

/** Returns a description if the configured key is NOT the service_role / secret key, otherwise null. */
export function supabaseKeyProblem() {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) return null;
  if (/^sb_publishable_/.test(key)) return 'publishable (public) key';
  if (key.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
      if (role && role !== 'service_role') return `"${role}" key`;
    } catch {
      /* not a readable JWT: let Supabase decide */
    }
  }
  return null;
}

export function assertServiceKey() {
  const problem = supabaseKeyProblem();
  if (problem) {
    throw new AppError(
      'SUPABASE_KEY',
      `SUPABASE_SERVICE_ROLE_KEY in Vercel holds the ${problem}, not the service_role (secret) key, so Supabase blocks writes. In Supabase open Project Settings > API Keys, copy the service_role key (the secret one, not anon/publishable), update the variable in Vercel and redeploy.`,
      500,
    );
  }
}

/** Accepts common paste mistakes: missing https://, trailing slash, or a path such as /rest/v1/. */
export function supabaseUrl() {
  const v = clean(process.env.SUPABASE_URL);
  if (!v) return '';
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    return v;
  }
}

export function supabaseUrlProblem() {
  const u = supabaseUrl();
  if (!u) return null;
  let host;
  try {
    host = new URL(u).hostname;
  } catch {
    return 'is not a valid web address';
  }
  if (host === 'localhost' || /\.supabase\.(co|in|red)$/.test(host)) return null;
  return `points to "${host}", which is not a Supabase project address`;
}

/** Turns low-level network errors into something actionable. */
export function explainSupabaseError(msg) {
  const text = String(msg || '');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|getaddrinfo|network|timed? ?out/i.test(text)) {
    let host = 'the configured address';
    try { host = new URL(supabaseUrl()).host; } catch { /* keep default */ }
    return `could not connect to Supabase at ${host}. Check that SUPABASE_URL is exactly your Project URL (https://xxxx.supabase.co, from Supabase > Project Settings > Data API) and that the project is not paused (Supabase dashboard > Restore project)`;
  }
  return text;
}

export function supabaseAdmin() {
  const url = supabaseUrl();
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  if (!globalThis.__sb) globalThis.__sb = createClient(url, key, { auth: { persistSession: false } });
  return globalThis.__sb;
}

const bucket = () => process.env.SUPABASE_BUCKET || 'salary-sheets';
export const safeName = (n) => String(n).replace(/[^A-Za-z0-9._'()-]+/g, '_');

const EXT = /\.(xls|xlsx|xlsm)$/i;

async function ls(sb, prefix) {
  const urlProblem = supabaseUrlProblem();
  if (urlProblem) throw new AppError('SUPABASE_URL', `SUPABASE_URL ${urlProblem}. It must look like https://xxxx.supabase.co (Supabase > Project Settings > Data API > Project URL).`, 500);
  let r;
  try {
    r = await sb.storage.from(bucket()).list(prefix, { limit: 1000 });
  } catch (e) {
    r = { error: { message: e?.message || String(e) } };
  }
  if (r.error) {
    const why = explainSupabaseError(r.error.message);
    const network = why !== r.error.message;
    throw new AppError('STORAGE_ACCESS', `Uploaded-files storage ${network ? why : `could not be read (${why}). Check that SUPABASE_BUCKET is "${bucket()}" and that supabase/schema.sql was run`}.`, 502);
  }
  return r.data || [];
}

/**
 * Lists uploaded salary sheets stored as <year>/<file>. It does NOT rely on Supabase's internal `id`
 * field to tell folders from files: a name with an Excel extension is a file, a year-like name is a folder.
 */
export async function listStorage() {
  const sb = supabaseAdmin();
  const warnings = [];
  const files = [];

  const add = (folderYear, folderName, item) => {
    const p = parseMonthYear(item.name);
    if (!p) {
      warnings.push(`Ignored uploaded file "${item.name}": no month and year in the file name.`);
      return;
    }
    if (folderYear && p.year !== folderYear) warnings.push(`Uploaded "${item.name}" is in the ${folderYear} folder but its name says ${monthLabel(p.year, p.month)}. The file name is used.`);
    files.push({ year: p.year, month: p.month, name: item.name, source: 'upload', ref: folderName ? `${folderName}/${item.name}` : item.name, modified: item.updated_at || item.created_at || null });
  };

  const top = await ls(sb, '');
  const folders = new Set();
  for (const item of top) {
    if (EXT.test(item.name)) add(null, '', item); // a sheet stored directly in the bucket root
    else if (parseYearFolder(item.name)) folders.add(item.name);
  }
  // Safety net: if the root listing shows no year folder, probe the likely ones directly.
  let probed = false;
  if (!folders.size) {
    probed = true;
    const y0 = new Date().getFullYear();
    for (let y = y0 - 4; y <= y0 + 1; y++) folders.add(String(y));
  }
  for (const name of folders) {
    let inner;
    try {
      inner = await ls(sb, name);
    } catch (e) {
      if (probed) continue;
      throw e;
    }
    const y = parseYearFolder(name);
    for (const item of inner) if (EXT.test(item.name)) add(y, name, item);
  }
  if (!files.length) {
    warnings.push(`Uploaded-files storage (bucket "${bucket()}") has no usable salary sheet. Top level contains ${top.length} item(s)${top.length ? `: ${top.slice(0, 6).map((x) => x.name).join(', ')}` : ''}.`);
  }
  return { files, warnings };
}

export async function downloadStorage(file) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.from(bucket()).download(file.ref);
  if (error || !data) throw new AppError('STORAGE_DOWNLOAD', `The uploaded file "${file.name}" could not be downloaded (${error?.message || 'unknown error'}).`, 502);
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadStorage(year, name, buffer) {
  const sb = supabaseAdmin();
  if (!sb) throw new AppError('UPLOAD_UNAVAILABLE', 'File upload is not configured (Supabase environment variables are missing).', 503);
  assertServiceKey();
  const path = `${year}/${safeName(name)}`;
  const { error } = await sb.storage.from(bucket()).upload(path, buffer, {
    upsert: true,
    contentType: /\.(xlsx|xlsm)$/i.test(name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel',
  });
  if (error) {
    if (/row-level security|violates|not authorized|unauthorized/i.test(error.message)) {
      throw new AppError('SUPABASE_KEY', 'Supabase refused the upload (row-level security). SUPABASE_SERVICE_ROLE_KEY must be the service_role (secret) key, not the anon/publishable key. Copy it from Supabase > Project Settings > API Keys, update it in Vercel and redeploy.', 500);
    }
    throw new AppError('UPLOAD_FAILED', `Upload failed: ${error.message}`, 502);
  }
  // Confirm the object really exists under that exact key (exact-key access, independent of listing).
  const check = await sb.storage.from(bucket()).download(path);
  if (check.error || !check.data) {
    throw new AppError('UPLOAD_NOT_VISIBLE', `The upload reported success, but "${path}" cannot be read back from bucket "${bucket()}". Check that SUPABASE_BUCKET matches your bucket name exactly.`, 502);
  }
  return path;
}
