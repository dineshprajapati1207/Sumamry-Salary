import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { jsonError, parsePeriod } from '@/lib/http';
import { loadDataset } from '@/lib/service';
import { getOverrides, saveOverride, deleteOverride } from '@/lib/overrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export async function GET(req) {
  try {
    const { year, month } = parsePeriod(new URL(req.url).searchParams);
    return NextResponse.json(await getOverrides(year, month));
  } catch (e) {
    return jsonError(e);
  }
}

// Body: { year, month, empCode, department, segment? }
export async function POST(req) {
  try {
    const body = await req.json();
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    const empCode = clean(body.empCode);
    const department = clean(body.department);
    const segment = clean(body.segment);
    if (!empCode || !department) throw new AppError('BAD_INPUT', 'Emp Code and the new Department are required.', 400);
    if (department.length > 100 || segment.length > 100) throw new AppError('BAD_INPUT', 'Department / Segment names must be 100 characters or fewer.', 400);

    // The employee must exist in that month's sheet.
    const { built } = await loadDataset(year, month);
    const rec = built.dataset.records.find((r) => r.code === empCode);
    if (!rec) throw new AppError('NOT_FOUND', `Emp Code ${empCode} is not in the ${month}/${year} salary sheet.`, 404);

    const sameAsOriginal = department.toLowerCase() === rec.department.toLowerCase() && (!segment || segment.toLowerCase() === rec.segment.toLowerCase());
    if (sameAsOriginal) await deleteOverride({ year, month, empCode });
    else await saveOverride({ year, month, empCode, segment: segment || null, department, user: 'dashboard' });
    return NextResponse.json({ ok: true, removed: sameAsOriginal });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const { year, month } = parsePeriod(sp);
    const empCode = clean(sp.get('empCode'));
    if (!empCode) throw new AppError('BAD_INPUT', 'empCode is required.', 400);
    await deleteOverride({ year, month, empCode });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
