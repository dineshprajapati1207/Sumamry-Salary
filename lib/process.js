// ---------------------------------------------------------------------------
// Turns the raw rows of a salary sheet (array of arrays) into a validated dataset.
// Pure functions only: no file or network access, so it is easy to test.
// ---------------------------------------------------------------------------
import { CONFIG } from './config.js';
import { parseMonthYear, monthLabel, periodKey } from './period.js';

export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function toNum(v) {
  if (v === null || v === undefined || v === '') return { n: 0, blank: true };
  if (typeof v === 'number') return Number.isFinite(v) ? { n: v } : { n: 0, bad: true };
  const s = String(v).replace(/[,\u20B9\s]/g, '');
  if (s === '' || s === '-') return { n: 0, blank: true };
  const n = Number(s);
  return Number.isNaN(n) ? { n: 0, bad: true } : { n };
}

const sample = (arr, n = 15) => arr.slice(0, n);

/** Finds the header row (the one that contains "Emp Code") and the title text above it. */
export function extractTable(aoa, scan = CONFIG.headerScanRows) {
  for (let i = 0; i < Math.min(scan, aoa.length); i++) {
    const row = aoa[i] || [];
    if (row.some((c) => norm(c) === 'emp code')) {
      const title = aoa
        .slice(0, i)
        .flat()
        .filter((c) => typeof c === 'string' && c.trim())
        .join(' | ');
      return { headerIndex: i, headers: row.map((c) => clean(c)), title, rows: aoa.slice(i + 1) };
    }
  }
  return null;
}

/** Groups spelling variants (case / spacing) and picks the most frequent spelling as canonical. */
export function makeCanonicalizer(values, aliases = {}) {
  const groups = new Map(); // norm -> Map(variant -> count)
  for (const v of values) {
    const k = norm(v);
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k);
    g.set(v, (g.get(v) || 0) + 1);
  }
  const best = new Map();
  for (const [k, g] of groups) {
    let top = null;
    const upper = (v) => (v.match(/[A-Z]/g) || []).length;
    // Most frequent spelling wins; on a tie prefer the one with more capital letters (e.g. "Analytics" over "analytics").
    for (const [variant, n] of g) if (!top || n > top.n || (n === top.n && upper(variant) > upper(top.variant))) top = { variant, n };
    best.set(k, top.variant);
  }
  const canon = (v) => {
    const k = norm(v);
    if (aliases[k]) return best.get(norm(aliases[k])) || aliases[k];
    return best.get(k) ?? v;
  };
  const merges = [];
  for (const [k, g] of groups) {
    const target = canon([...g.keys()][0]);
    for (const [variant, n] of g) if (variant !== target) merges.push({ from: variant, to: target, count: n });
  }
  return { canon, merges };
}

/**
 * @param {any[][]} aoa  raw sheet rows
 * @param {{expected?:{year:number,month:number}, fileName?:string, rowOffset?:number}} opts
 */
export function buildDataset(aoa, opts = {}) {
  const { expected, fileName, rowOffset = 0, period } = opts;
  const pk = period ? periodKey(period.year, period.month) : '';
  const errors = [];
  const warnings = [];
  const notices = [];
  const fail = () => ({ ok: false, errors, warnings, notices, dataset: null });

  const table = extractTable(aoa);
  if (!table) {
    errors.push({
      code: 'NO_HEADER',
      message: `Could not find the header row. A row containing "Emp Code" must appear in the first ${CONFIG.headerScanRows} rows of the sheet.`,
    });
    return fail();
  }

  const { headers, headerIndex } = table;
  const hdrNorm = headers.map(norm);
  const headerRowNo = rowOffset + headerIndex + 1;
  const findAll = (aliases) => hdrNorm.map((h, i) => (aliases.some((a) => norm(a) === h) ? i : -1)).filter((i) => i >= 0);

  // ---- 1. Required single columns ----------------------------------------
  const idx = {};
  for (const [key, def] of Object.entries(CONFIG.columns)) {
    const found = findAll(def.aliases);
    if (found.length === 0) {
      const alt = def.aliases.length > 1 ? ` (also accepted: ${def.aliases.slice(1).map((a) => `"${a}"`).join(', ')})` : '';
      errors.push({ code: 'MISSING_COLUMN', message: `Required column "${def.label}" was not found in the header row (row ${headerRowNo})${alt}.` });
    } else if (found.length > 1) {
      errors.push({ code: 'DUPLICATE_COLUMN', message: `Column "${def.label}" appears more than once in the header row, so it is ambiguous.` });
    } else idx[key] = found[0];
  }

  // ---- 2. Salary component range (BASIC .. Net Amount) -------------------
  const startIdx = findAll([CONFIG.tally.start])[0];
  const endAll = findAll([CONFIG.tally.end]);
  const endIdx = endAll[endAll.length - 1];
  let components = [];
  const pos = {};
  if (startIdx === undefined) errors.push({ code: 'MISSING_COLUMN', message: `Required column "${CONFIG.tally.start}" (start of the salary components) was not found.` });
  if (endIdx === undefined) errors.push({ code: 'MISSING_COLUMN', message: `Required column "${CONFIG.tally.end}" (end of the salary components) was not found.` });
  if (startIdx !== undefined && endIdx !== undefined) {
    if (startIdx > endIdx) {
      errors.push({ code: 'COLUMN_ORDER', message: `"${CONFIG.tally.start}" must appear before "${CONFIG.tally.end}" in the header row.` });
    } else {
      for (let i = startIdx; i <= endIdx; i++) {
        if (!headers[i]) {
          errors.push({ code: 'BLANK_HEADER', message: `Column ${i + 1} sits between "${CONFIG.tally.start}" and "${CONFIG.tally.end}" but has no header name.` });
          continue;
        }
        components.push({ idx: i, name: headers[i], norm: hdrNorm[i] });
      }
      for (const [k, name] of Object.entries(CONFIG.tally.required)) {
        const p = components.findIndex((c) => c.norm === norm(name));
        if (p < 0) errors.push({ code: 'MISSING_COLUMN', message: `Required salary column "${name}" was not found between "${CONFIG.tally.start}" and "${CONFIG.tally.end}".` });
        else pos[k] = p;
      }
      if (pos.grossTotal !== undefined && pos.ctc !== undefined && pos.deductionTotal !== undefined) {
        if (!(pos.grossTotal < pos.ctc && pos.ctc < pos.deductionTotal)) {
          errors.push({ code: 'COLUMN_ORDER', message: 'Expected column order: earnings, Gross Total, employer contributions, CTC, deductions, Deduction Total, Net Amount.' });
        }
      }
    }
  }
  if (errors.length) return fail();

  // ---- 3. Rows -----------------------------------------------------------
  const records = [];
  const seen = new Map();
  const dupCodes = [];
  const noCode = [];
  const blankCtc = [];
  const badCells = [];
  const negLoan = [];
  let totalsRow = null;

  table.rows.forEach((row, i) => {
    const rowNo = rowOffset + headerIndex + 2 + i;
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) return;
    const code = clean(row[idx.empCode]);
    if (!code) {
      noCode.push(rowNo);
      return;
    }
    if (norm(code) === 'total' || norm(code) === 'grand total') {
      totalsRow = row;
      return;
    }
    if (seen.has(code)) {
      dupCodes.push(`${code} (row ${rowNo}, first seen row ${seen.get(code)})`);
      return;
    }
    seen.set(code, rowNo);

    const nums = components.map((c) => {
      const t = toNum(row[c.idx]);
      if (t.bad) badCells.push(`Emp ${code}, column "${c.name}", row ${rowNo}`);
      return t.n;
    });
    const ctcT = toNum(row[idx.ctc]);
    const loanT = toNum(row[idx.loan]);
    if (ctcT.bad) badCells.push(`Emp ${code}, column "CTC", row ${rowNo}`);
    if (loanT.bad) badCells.push(`Emp ${code}, column "Loan", row ${rowNo}`);
    if (ctcT.blank) blankCtc.push(code);
    if (loanT.n < 0) negLoan.push(`${code} (${loanT.n})`);

    records.push({
      p: pk,
      w: 1,
      row: rowNo,
      code,
      name: clean(row[idx.name]),
      segment: clean(row[idx.segment]),
      department: clean(row[idx.department]),
      function: clean(row[idx.function]),
      accountsData: clean(row[idx.accountsData]),
      ctc: ctcT.n,
      loan: loanT.n,
      nums,
    });
  });

  if (!records.length) {
    errors.push({ code: 'NO_ROWS', message: 'The sheet has a valid header but no employee rows.' });
    return fail();
  }

  if (noCode.length) warnings.push({ code: 'MISSING_EMP_CODE', message: `${noCode.length} row(s) contain data but have no Emp Code and were EXCLUDED from all reports.`, items: sample(noCode.map((r) => `row ${r}`)) });
  if (dupCodes.length) warnings.push({ code: 'DUPLICATE_EMP_CODE', message: `${dupCodes.length} duplicate Emp Code row(s) were EXCLUDED so nobody is counted twice (first occurrence kept).`, items: sample(dupCodes) });
  if (badCells.length) warnings.push({ code: 'NON_NUMERIC', message: `${badCells.length} numeric cell(s) held non-numeric text and were treated as 0.`, items: sample(badCells) });
  if (blankCtc.length) warnings.push({ code: 'BLANK_CTC', message: `${blankCtc.length} employee(s) have a blank CTC (counted, CTC treated as 0).`, items: sample(blankCtc) });
  if (negLoan.length) warnings.push({ code: 'NEGATIVE_LOAN', message: `${negLoan.length} employee(s) have a negative Loan deduction (excluded from the loan list, included in totals).`, items: sample(negLoan) });

  // ---- 4. Blank labels + consistent spelling ----------------------------
  for (const [field, label] of [['segment', 'Segment'], ['department', 'Department'], ['accountsData', 'Accounts Data']]) {
    const blanks = records.filter((r) => !r[field]);
    if (blanks.length) {
      warnings.push({ code: 'BLANK_LABEL', message: `${blanks.length} employee(s) have a blank ${label}; they are shown under "(Blank)".`, items: sample(blanks.map((r) => r.code)) });
      blanks.forEach((r) => { r[field] = '(Blank)'; });
    }
  }
  const mergeNotes = [];
  for (const [field, label, aliases] of [
    ['segment', 'Segment', {}],
    ['department', 'Department', CONFIG.departmentAliases],
    ['function', 'Function', {}],
    ['accountsData', 'Accounts Data', {}],
  ]) {
    const { canon, merges } = makeCanonicalizer(records.map((r) => r[field]), aliases);
    records.forEach((r) => { r[field] = canon(r[field]); });
    merges.forEach((m) => mergeNotes.push(`${label}: "${m.from}" (${m.count}) reported as "${m.to}"`));
  }
  if (mergeNotes.length) notices.push({ code: 'SPELLING_MERGED', message: 'Inconsistent spellings were unified so each department is counted once.', items: mergeNotes });

  // ---- 5. Period cross-check --------------------------------------------
  const titlePeriod = parseMonthYear(table.title);
  if (expected && titlePeriod && (titlePeriod.year !== expected.year || titlePeriod.month !== expected.month)) {
    warnings.push({
      code: 'PERIOD_MISMATCH',
      message: `You selected ${monthLabel(expected.year, expected.month)} but the sheet title says ${monthLabel(titlePeriod.year, titlePeriod.month)}. Please confirm the right file was used.`,
    });
  }
  if (expected && !titlePeriod) {
    notices.push({ code: 'NO_TITLE_PERIOD', message: 'The sheet has no recognisable "month" title above the header, so the month could only be verified from the file name.' });
  }

  // ---- 6. The sheet's own Total row (used for reconciliation) -----------
  let sheetTotals = null;
  if (totalsRow) {
    const get = (i) => toNum(totalsRow[i]).n;
    sheetTotals = { ctc: get(idx.ctc), loan: get(idx.loan), net: get(components[components.length - 1].idx), gross: get(components[pos.grossTotal].idx) };
  }

  return {
    ok: true,
    errors,
    warnings,
    notices,
    dataset: {
      records,
      components,
      pos,
      idx,
      sheetTotals,
      title: table.title,
      titlePeriod,
      fileName,
      headerRow: headerRowNo,
      rowsRead: records.length,
    },
  };
}

/**
 * Combines several monthly datasets into one (for a custom date range or a comparison period).
 * - Each record is tagged with its month (`p`) and weighted 1/N so that counts become an AVERAGE
 *   monthly headcount, while CTC and salary components are simply added up.
 * - If the salary columns differ between months, the union of columns is used (missing = 0) and a
 *   warning is raised; nothing is dropped silently.
 * @param {{period:{year:number,month:number}, ds:object}[]} parts  chronological order
 */
export function mergeDatasets(parts) {
  const n = parts.length;
  const warnings = [];
  const keyed = (ds) => {
    const occ = {};
    return ds.components.map((c) => {
      occ[c.norm] = (occ[c.norm] || 0) + 1;
      return `${c.norm}#${occ[c.norm]}`;
    });
  };
  const latest = parts[n - 1].ds;
  const lk = keyed(latest);
  const union = latest.components.map((c, i) => ({ name: c.name, norm: c.norm, key: lk[i] }));
  const extra = new Set();
  for (let i = n - 2; i >= 0; i--) {
    const ds = parts[i].ds;
    const ks = keyed(ds);
    ds.components.forEach((c, j) => {
      if (union.some((u) => u.key === ks[j])) return;
      const prevPos = j > 0 ? union.findIndex((u) => u.key === ks[j - 1]) : -1;
      union.splice(prevPos + 1, 0, { name: c.name, norm: c.norm, key: ks[j] });
      extra.add(c.name);
    });
  }
  if (extra.size) warnings.push({ code: 'COLUMNS_DIFFER', message: `Salary columns differ between months. Columns missing in some months were treated as 0: ${[...extra].join(', ')}.` });
  for (const { period, ds } of parts) {
    const ks = keyed(ds);
    const missing = union.filter((u) => !ks.includes(u.key)).map((u) => u.name);
    if (missing.length) warnings.push({ code: 'COLUMNS_MISSING', message: `${monthLabel(period.year, period.month)} has no column for: ${missing.join(', ')} (treated as 0).` });
  }

  const records = [];
  for (const { period, ds } of parts) {
    const ks = keyed(ds);
    const at = union.map((u) => ks.indexOf(u.key));
    const p = periodKey(period.year, period.month);
    for (const r of ds.records) records.push({ ...r, p, w: 1 / n, nums: at.map((j) => (j >= 0 ? r.nums[j] : 0)) });
  }
  for (const [field, aliases] of [['segment', {}], ['department', CONFIG.departmentAliases], ['function', {}], ['accountsData', {}]]) {
    const { canon } = makeCanonicalizer(records.map((r) => r[field]), aliases);
    records.forEach((r) => { r[field] = canon(r[field]); });
  }

  const pos = {};
  for (const [k, name] of Object.entries(CONFIG.tally.required)) pos[k] = union.findIndex((u) => u.norm === norm(name));
  return {
    records,
    components: union.map((u, i) => ({ idx: i, name: u.name, norm: u.norm })),
    pos,
    idx: latest.idx,
    sheetTotals: null,
    title: '',
    titlePeriod: null,
    fileName: parts.map((x) => x.ds.fileName).join(', '),
    headerRow: null,
    rowsRead: records.length,
    nMonths: n,
    mergeWarnings: warnings,
  };
}
