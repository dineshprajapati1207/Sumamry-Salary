// Manual reclassification overrides, saved per month.
// Production: Supabase table `reclass_overrides` (see supabase/schema.sql).
// Local development without Supabase: a JSON file in .data/ (never used in production).
import fs from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from './sources/storage.js';
import { AppError } from './errors.js';

const LOCAL = path.join(process.cwd(), '.data', 'overrides.json');
const localAllowed = () => process.env.NODE_ENV !== 'production';

async function readLocal() {
  try {
    return JSON.parse(await fs.readFile(LOCAL, 'utf8'));
  } catch {
    return [];
  }
}
async function writeLocal(rows) {
  await fs.mkdir(path.dirname(LOCAL), { recursive: true });
  await fs.writeFile(LOCAL, JSON.stringify(rows, null, 2));
}

export async function getOverrides(year, month) {
  const sb = supabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('reclass_overrides')
      .select('emp_code, segment, department')
      .eq('year', year)
      .eq('month', month);
    if (error) return { items: [], warning: `Saved reclassifications could not be loaded (${error.message}). Did you run supabase/schema.sql?` };
    return { items: (data || []).map((r) => ({ empCode: r.emp_code, segment: r.segment || null, department: r.department })) };
  }
  if (localAllowed()) {
    const rows = (await readLocal()).filter((r) => r.year === year && r.month === month);
    return { items: rows.map((r) => ({ empCode: r.empCode, segment: r.segment || null, department: r.department })) };
  }
  return { items: [], warning: 'Saved reclassifications are unavailable because Supabase is not configured.' };
}

export async function saveOverride({ year, month, empCode, segment, department, user }) {
  const sb = supabaseAdmin();
  if (sb) {
    const { error } = await sb.from('reclass_overrides').upsert(
      { year, month, emp_code: empCode, segment: segment || null, department, updated_by: user, updated_at: new Date().toISOString() },
      { onConflict: 'year,month,emp_code' },
    );
    if (error) throw new AppError('SAVE_FAILED', `Could not save the reclassification (${error.message}).`, 502);
    return;
  }
  if (!localAllowed()) throw new AppError('SAVE_UNAVAILABLE', 'Saving reclassifications needs Supabase to be configured.', 503);
  const rows = (await readLocal()).filter((r) => !(r.year === year && r.month === month && r.empCode === empCode));
  rows.push({ year, month, empCode, segment: segment || null, department });
  await writeLocal(rows);
}

export async function deleteOverride({ year, month, empCode }) {
  const sb = supabaseAdmin();
  if (sb) {
    const { error } = await sb.from('reclass_overrides').delete().eq('year', year).eq('month', month).eq('emp_code', empCode);
    if (error) throw new AppError('SAVE_FAILED', `Could not remove the reclassification (${error.message}).`, 502);
    return;
  }
  if (!localAllowed()) throw new AppError('SAVE_UNAVAILABLE', 'Saving reclassifications needs Supabase to be configured.', 503);
  await writeLocal((await readLocal()).filter((r) => !(r.year === year && r.month === month && r.empCode === empCode)));
}
