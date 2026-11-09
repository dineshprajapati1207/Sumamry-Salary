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

export function supabaseAdmin() {
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  if (!globalThis.__sb) globalThis.__sb = createClient(url, key, { auth: { persistSession: false } });
  return globalThis.__sb;
}

const bucket = () => process.env.SUPABASE_BUCKET || 'salary-sheets';
export const safeName = (n) => String(n).replace(/[^A-Za-z0-9._'()-]+/g, '_');

export async function listStorage() {
  const sb = supabaseAdmin();
  const warnings = [];
  const files = [];
  const top = await sb.storage.from(bucket()).list('', { limit: 1000 });
  if (top.error) throw new AppError('STORAGE_ACCESS', `Uploaded-files storage could not be read (${top.error.message}).`, 502);

  for (const item of top.data || []) {
    if (item.id) continue; // a loose file in the bucket root is ignored; files live inside year folders
    const y = parseYearFolder(item.name);
    if (!y) continue;
    const inner = await sb.storage.from(bucket()).list(item.name, { limit: 1000 });
    if (inner.error) throw new AppError('STORAGE_ACCESS', `Uploaded-files storage could not be read (${inner.error.message}).`, 502);
    for (const f of inner.data || []) {
      if (!f.id || !/\.(xls|xlsx|xlsm)$/i.test(f.name)) continue;
      const p = parseMonthYear(f.name);
      if (!p) {
        warnings.push(`Ignored uploaded file "${f.name}": no month and year in the file name.`);
        continue;
      }
      if (p.year !== y) warnings.push(`Uploaded "${f.name}" is in the ${y} folder but its name says ${monthLabel(p.year, p.month)}. The file name is used.`);
      files.push({ year: p.year, month: p.month, name: f.name, source: 'upload', ref: `${item.name}/${f.name}`, modified: f.updated_at || f.created_at });
    }
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
  return path;
}
