import { NextResponse } from 'next/server';
import { AppError } from './errors.js';
import { PERIOD_TYPES, parseYm } from './periods.js';

export function jsonError(e) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  console.error('Unexpected error:', e);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong on the server. Please try again; if it persists check the Vercel function logs.' } },
    { status: 500 },
  );
}

export function parsePeriod(searchParams) {
  const year = parseInt(searchParams.get('year'), 10);
  const month = parseInt(searchParams.get('month'), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError('BAD_PERIOD', 'Please choose a valid Year and Month.', 400);
  }
  return { year, month };
}

/** Reads ?mode=month|range|compare and its parameters. */
export function parseView(sp) {
  const mode = sp.get('mode') || 'month';
  if (mode === 'month') return { mode, ...parsePeriod(sp) };
  if (mode === 'range') {
    const from = parseYm(sp.get('from'));
    const to = parseYm(sp.get('to'));
    if (!from || !to) throw new AppError('BAD_PERIOD', 'Please choose a valid From and To month.', 400);
    return { mode, from, to };
  }
  if (mode === 'compare') {
    const type = sp.get('type');
    const yearType = sp.get('yearType') === 'calendar' ? 'calendar' : 'fy';
    const basis = sp.get('basis') === 'yoy' ? 'yoy' : 'prev';
    const fy = parseInt(sp.get('fy'), 10);
    const index = parseInt(sp.get('index') || '1', 10);
    const def = PERIOD_TYPES[type];
    if (!def || !Number.isInteger(fy) || fy < 2000 || fy > 2100 || !Number.isInteger(index) || index < 1 || index > def.count) {
      throw new AppError('BAD_PERIOD', 'Please choose a valid comparison period.', 400);
    }
    return { mode, type, yearType, fy, index, basis };
  }
  throw new AppError('BAD_MODE', 'Unknown view.', 400);
}
