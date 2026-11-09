// Orchestrates: find files -> parse -> validate -> build reports (single month, custom range, comparison).
import { findSalaryFile, getSalaryFile, listSalaryFiles } from './sources/index.js';
import { parseWorkbook } from './parse.js';
import { buildDataset, mergeDatasets } from './process.js';
import { buildReports } from './reports.js';
import { buildComparison } from './compare.js';
import { getOverrides } from './overrides.js';
import { AppError } from './errors.js';
import { CONFIG } from './config.js';
import { monthLabel, monthSlug, periodKey, prevPeriod } from './period.js';
import { PERIOD_TYPES, yearStartMonth, periodMonths, shiftMonths, describePeriod, monthsBetween } from './periods.js';

const MAX_RANGE_MONTHS = 36;
const dsCache = (globalThis.__dsCache ||= new Map()); // parsed + validated sheets, keyed by file version

/** Reads, parses and validates one month's sheet (cached until the file changes in Drive). */
export async function loadDataset(year, month, { refresh = false } = {}) {
  const meta = await findSalaryFile(year, month, { refresh });
  const key = `${meta.source}:${meta.ref}:${meta.modified}`;
  if (!refresh && dsCache.has(key)) return dsCache.get(key);

  const file = await getSalaryFile(year, month, { refresh });
  const parsed = parseWorkbook(file.buffer);
  const built = buildDataset(parsed.aoa, { expected: { year, month }, fileName: file.name, rowOffset: parsed.rowOffset, period: { year, month } });
  if (!built.ok) {
    throw new AppError(
      'INVALID_SHEET',
      `The file "${file.name}" cannot be used because it failed validation. Nothing was calculated, so no partial numbers are shown.`,
      422,
      built.errors.map((e) => e.message),
    );
  }
  const out = { file: { name: file.name, source: file.source, modified: file.modified }, parsed: { sheetName: parsed.sheetName }, built };
  if (dsCache.size >= 40) dsCache.delete(dsCache.keys().next().value);
  dsCache.set(key, out);
  return out;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

/** Loads every month in `periods` that has a file; reports the ones that do not. */
async function loadMonths(periods, { refresh = false } = {}) {
  let list = await listSalaryFiles({ refresh });
  const split = () => {
    const have = new Set(list.files.map((f) => periodKey(f.year, f.month)));
    return { present: periods.filter((p) => have.has(periodKey(p.year, p.month))), missing: periods.filter((p) => !have.has(periodKey(p.year, p.month))) };
  };
  let { present, missing } = split();
  if (missing.length && !refresh) {
    list = await listSalaryFiles({ refresh: true }); // a just-uploaded file may not be in a stale list
    ({ present, missing } = split());
  }
  const parts = await mapPool(present, 4, async (p) => {
    try {
      const r = await loadDataset(p.year, p.month);
      return { period: p, ds: r.built.dataset, file: r.file, warnings: r.built.warnings, notices: r.built.notices };
    } catch (e) {
      if (e instanceof AppError) throw new AppError(e.code, `${monthLabel(p.year, p.month)}: ${e.message}`, e.status, e.details);
      throw e;
    }
  });
  return { parts, missing };
}

const labelOf = (p) => monthLabel(p.year, p.month);
const prefixed = (parts, field) =>
  parts.flatMap((x) => x[field].map((w) => ({ ...w, message: `${labelOf(x.period)}: ${w.message}` })));
const sourceOf = (parts) => (parts.every((x) => x.file.source === parts[0].file.source) ? parts[0].file.source : 'mixed');
const withPeriod = (items, p) => items.map((o) => ({ ...o, period: periodKey(p.year, p.month) }));

// ---------------------------------------------------------------------------
// Single month
// ---------------------------------------------------------------------------
export async function loadBundle(year, month, { refresh = false, compare = true } = {}) {
  const { file, parsed, built } = await loadDataset(year, month, { refresh });
  const ov = await getOverrides(year, month);

  let previous = null;
  let previousNote = null;
  if (compare) {
    const pp = prevPeriod(year, month);
    try {
      const p = await loadDataset(pp.year, pp.month);
      const pov = await getOverrides(pp.year, pp.month);
      previous = { ds: p.built.dataset, overrides: withPeriod(pov.items, pp), year: pp.year, month: pp.month };
    } catch (e) {
      previousNote = `No previous-month comparison: ${monthLabel(pp.year, pp.month)} ${e instanceof AppError && e.code === 'FILE_NOT_FOUND' ? 'file was not found' : 'could not be used'}. The Reclassification report shows the selected month only.`;
    }
  }

  const out = buildReports(built.dataset, { year, month, overrides: withPeriod(ov.items, { year, month }), previous });
  const warnings = [...built.warnings, ...out.extraWarnings];
  if (ov.warning) warnings.push({ code: 'OVERRIDES', message: ov.warning });
  const notices = [...built.notices, ...out.extraNotices];
  if (previousNote) notices.push({ code: 'NO_PREVIOUS', message: previousNote });

  return {
    meta: {
      mode: 'month',
      year,
      month,
      label: out.label,
      slug: monthSlug(year, month),
      fileName: file.name,
      source: file.source,
      modified: file.modified || null,
      sheetName: parsed.sheetName,
      rowsLoaded: built.dataset.rowsRead,
      nMonths: 1,
      loadedAt: new Date().toISOString(),
      previousLabel: out.previousLabel,
    },
    validation: { warnings, notices, checks: out.checks },
    kpis: out.kpis,
    insights: out.insights,
    reports: out.reports,
    overrides: out.overridesApplied,
    employees: out.employees,
  };
}

// ---------------------------------------------------------------------------
// Custom date range (whole months)
// ---------------------------------------------------------------------------
export async function loadRangeBundle(from, to, { refresh = false } = {}) {
  const periods = monthsBetween(from, to);
  if (!periods.length) throw new AppError('BAD_RANGE', 'The "From" month must not be later than the "To" month.', 400);
  if (periods.length > MAX_RANGE_MONTHS) throw new AppError('BAD_RANGE', `Please choose a range of at most ${MAX_RANGE_MONTHS} months.`, 400);

  const { parts, missing } = await loadMonths(periods, { refresh });
  if (!parts.length) {
    throw new AppError('FILE_NOT_FOUND', `No salary sheets were found between ${labelOf(from)} and ${labelOf(to)}. Add the monthly files to Google Drive and press Refresh.`, 404);
  }
  const ds = parts.length === 1 ? parts[0].ds : mergeDatasets(parts);
  const ovs = (await Promise.all(parts.map(async (x) => withPeriod((await getOverrides(x.period.year, x.period.month)).items, x.period)))).flat();
  const label = periods.length === 1 ? labelOf(from) : `${labelOf(from)} to ${labelOf(to)}`;
  const out = buildReports(ds, { year: to.year, month: to.month, label, overrides: ovs, previous: null });

  const warnings = [...out.extraWarnings, ...(ds.mergeWarnings || []), ...prefixed(parts, 'warnings')];
  if (missing.length) warnings.unshift({ code: 'MISSING_MONTHS', message: `No salary sheet found for ${missing.length} month(s) in this range: ${missing.map(labelOf).join(', ')}. They are NOT included in the totals.` });
  const notices = [...out.extraNotices, ...prefixed(parts, 'notices')];

  return {
    meta: {
      mode: 'range',
      year: to.year,
      month: to.month,
      label,
      slug: periods.length === 1 ? monthSlug(from.year, from.month) : `${monthSlug(from.year, from.month)}_to_${monthSlug(to.year, to.month)}`,
      fileName: `${parts.length} salary sheet(s): ${parts.map((x) => x.file.name).join(', ')}`,
      source: sourceOf(parts),
      nMonths: parts.length,
      months: parts.map((x) => ({ label: labelOf(x.period), fileName: x.file.name })),
      missing: missing.map(labelOf),
      rowsLoaded: out.kpis.employees,
      loadedAt: new Date().toISOString(),
      previousLabel: null,
    },
    validation: { warnings, notices, checks: out.checks },
    kpis: out.kpis,
    insights: out.insights,
    reports: out.reports,
    overrides: out.overridesApplied,
    employees: [],
  };
}

// ---------------------------------------------------------------------------
// Quarterly / Half-yearly / Yearly comparison
// ---------------------------------------------------------------------------
export async function loadCompareBundle({ type, yearType, fy, index, basis }, { refresh = false } = {}) {
  const S = yearStartMonth(yearType, CONFIG.fiscalYearStartMonth);
  const len = PERIOD_TYPES[type].len;
  const curMonths = periodMonths({ type, fy, index, S });
  const delta = type === 'year' || basis === 'yoy' ? -12 : -len;
  const prevMonths = shiftMonths(curMonths, delta);
  const curD = describePeriod(curMonths, type, S);
  const prevD = describePeriod(prevMonths, type, S);

  const { parts, missing } = await loadMonths([...prevMonths, ...curMonths], { refresh });
  const keyIn = (months) => new Set(months.map((m) => periodKey(m.year, m.month)));
  const curKeys = keyIn(curMonths);
  const prevKeys = keyIn(prevMonths);
  const curParts = parts.filter((x) => curKeys.has(periodKey(x.period.year, x.period.month)));
  const prevParts = parts.filter((x) => prevKeys.has(periodKey(x.period.year, x.period.month)));
  if (!curParts.length) throw new AppError('FILE_NOT_FOUND', `No salary sheets were found for ${curD.label}. Add the monthly files to Google Drive and press Refresh.`, 404);
  if (!prevParts.length) throw new AppError('FILE_NOT_FOUND', `No salary sheets were found for ${prevD.label}, so there is nothing to compare ${curD.name} with.`, 404);

  const cur = { ds: mergeDatasets(curParts) };
  const prev = { ds: mergeDatasets(prevParts) };
  const cmp = buildComparison({ cur, prev, curLabel: curD.label, prevLabel: prevD.label, curShort: curD.name, prevShort: prevD.name });

  const warnings = [];
  const missCur = missing.filter((m) => curKeys.has(periodKey(m.year, m.month)));
  const missPrev = missing.filter((m) => prevKeys.has(periodKey(m.year, m.month)));
  if (missCur.length) warnings.push({ code: 'MISSING_MONTHS', message: `${curD.name}: no sheet for ${missCur.map(labelOf).join(', ')} (not included).` });
  if (missPrev.length) warnings.push({ code: 'MISSING_MONTHS', message: `${prevD.name}: no sheet for ${missPrev.map(labelOf).join(', ')} (not included).` });
  if (curParts.length !== prevParts.length) {
    warnings.push({ code: 'UNEQUAL_MONTHS', message: `The periods do not have the same number of months (${curD.name}: ${curParts.length}, ${prevD.name}: ${prevParts.length}). Totals are not like-for-like; compare the monthly averages instead.` });
  }
  warnings.push(...(cur.ds.mergeWarnings || []), ...(prev.ds.mergeWarnings || []), ...prefixed(parts, 'warnings'));

  return {
    meta: {
      mode: 'compare',
      label: `${curD.name} vs ${prevD.name}`,
      slug: `${PERIOD_TYPES[type].label}_${curD.slug}_vs_${prevD.slug}`,
      curLabel: curD.label,
      prevLabel: prevD.label,
      fileName: `${parts.length} salary sheet(s) (${prevD.name} and ${curD.name})`,
      source: sourceOf(parts),
      nMonths: parts.length,
      rowsLoaded: cmp.kpis[0].cur,
      loadedAt: new Date().toISOString(),
    },
    validation: { warnings, notices: prefixed(parts, 'notices'), checks: cmp.checks },
    compare: { kpis: cmp.kpis, trend: cmp.trend, segmentCompare: cmp.segmentCompare, curShort: curD.name, prevShort: prevD.name, curLabel: curD.label, prevLabel: prevD.label },
    reports: [cmp.report],
  };
}

/** `view` comes from parseView(). */
export function loadView(view, opts = {}) {
  if (view.mode === 'range') return loadRangeBundle(view.from, view.to, opts);
  if (view.mode === 'compare') return loadCompareBundle(view, opts);
  return loadBundle(view.year, view.month, opts);
}
