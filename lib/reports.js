// ---------------------------------------------------------------------------
// Builds the four reports, KPIs, chart data and reconciliation checks.
//
// Every report is a "table model" used BOTH by the dashboard UI and by the Excel / Word / PDF
// exporters, so what you see on screen is exactly what gets exported.
//
//   block  = { type:'table', title?, label?, columns:[{key,header,type,signed?}], rows:[row], groupKey?, sortable?, filterable? }
//          | { type:'panels', panels:[table block, ...] }          (side-by-side tables)
//   column.type: 'text' | 'int' | 'money' | 'pct'
//   row    = { kind:'data'|'subtotal'|'total', cells:{key:value}, search:string, emphasis?:boolean }
//
// Records carry a weight `w`: 1 for a single month, 1/N when N months are combined, so that
// "Employee Count" becomes the AVERAGE monthly headcount while CTC and salary amounts are summed.
// ---------------------------------------------------------------------------
import { CONFIG } from './config.js';
import { norm, r2 } from './process.js';
import { monthLabel } from './period.js';

const byText = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
const sum = (arr, f) => r2(arr.reduce((a, x) => a + f(x), 0));
const W = (r) => r.w ?? 1;
const cnt = (multi, h) => (multi ? `${h} (avg/month)` : h);

const row = (cells, extra = {}) => ({
  kind: 'data',
  cells,
  search: Object.values(cells).join(' ').toLowerCase(),
  ...extra,
});

// ---------------------------------------------------------------------------
// Shared helpers (also used by the comparison report)
// ---------------------------------------------------------------------------
export function fieldSalesItems(records) {
  const exclude = new Set(CONFIG.fieldSales.excludeFunctionValues.map(norm));
  const map = new Map();
  let blank = 0;
  for (const r of records) {
    if (!r.function) { blank += W(r); continue; }
    if (exclude.has(norm(r.function))) continue;
    const e = map.get(r.function) || { ctc: 0, count: 0 };
    e.ctc += r.ctc;
    e.count += W(r);
    map.set(r.function, e);
  }
  const items = [...map.entries()].sort((a, b) => byText(a[0], b[0])).map(([fn, e]) => ({ fn, ctc: r2(e.ctc), count: r2(e.count) }));
  return { items, blank: Math.round(blank) };
}

const othersSet = () => new Map(CONFIG.mis.othersDepartments.map((d) => [norm(d), d]));

/** Segment x Department with the 12 "Others" departments mapped to the Petpooja segment as one "Others" row. */
export function misSegmentGroups(records) {
  const set = othersSet();
  const isOther = (r) => set.has(norm(r.department));
  const OTH = CONFIG.mis.othersLabel;
  return groupSegDept(records, (r) => (isOther(r) ? CONFIG.mis.othersSegment : r.segment), (r) => (isOther(r) ? OTH : r.department), OTH);
}

export function groupSegDept(recs, segOf, deptOf, lastLabel = null) {
  const segs = new Map();
  for (const r of recs) {
    const s = segOf(r);
    const d = deptOf(r);
    if (!segs.has(s)) segs.set(s, new Map());
    const dm = segs.get(s);
    const e = dm.get(d) || { ctc: 0, count: 0 };
    e.ctc += r.ctc;
    e.count += W(r);
    dm.set(d, e);
  }
  return [...segs.entries()]
    .sort((a, b) => byText(a[0], b[0]))
    .map(([segment, dm]) => {
      const depts = [...dm.entries()]
        .sort((a, b) => (lastLabel ? (a[0] === lastLabel) - (b[0] === lastLabel) : 0) || byText(a[0], b[0]))
        .map(([department, e]) => ({ department, ctc: r2(e.ctc), count: r2(e.count) }));
      return { segment, depts, ctc: sum(depts, (d) => d.ctc), count: sum(depts, (d) => d.count) };
    });
}

/** Tally rows after the configured renames / merges. */
export function tallyAmounts(ds) {
  const { components, pos, records } = ds;
  const T = CONFIG.tally;
  const sums = components.map((_, i) => r2(records.reduce((a, r) => a + r.nums[i], 0)));
  const mergeIdx = [];
  const mergedNote = [];
  for (const aliases of T.mergeIntoOtherEarning) {
    const p = components.findIndex((c) => aliases.some((a) => norm(a) === c.norm));
    if (p >= 0 && p !== pos.otherEarning) {
      mergeIdx.push(p);
      mergedNote.push({ name: components[p].name, amount: sums[p] });
    }
  }
  const mergedTotal = r2(mergedNote.reduce((a, m) => a + m.amount, 0));
  const rename = Object.fromEntries(Object.entries(T.rename).map(([k, v]) => [norm(k), v]));
  const sub = new Set(T.subtotalRows.map(norm));
  const tot = new Set(T.totalRows.map(norm));
  const rows = [];
  components.forEach((c, p) => {
    if (mergeIdx.includes(p)) return;
    rows.push({
      name: rename[c.norm] || c.name,
      amount: p === pos.otherEarning ? r2(sums[p] + mergedTotal) : sums[p],
      kind: tot.has(c.norm) ? 'total' : sub.has(c.norm) ? 'subtotal' : 'data',
    });
  });
  return { rows, sums, mergedNote };
}

// ---------------------------------------------------------------------------
// Report 1 - Field Sales
// ---------------------------------------------------------------------------
function buildFieldSales(records, label, multi) {
  const { items, blank } = fieldSalesItems(records);
  const rows = items.map((i) => row({ sales: CONFIG.fieldSales.salesLabel, function: i.fn, count: i.count, ctc: i.ctc }));
  const totalCount = sum(items, (i) => i.count);
  const totalCtc = sum(items, (i) => i.ctc);
  rows.push({ kind: 'total', cells: { sales: 'Total', function: '', count: totalCount, ctc: totalCtc }, search: '' });
  return {
    items,
    blank,
    totalCount,
    report: {
      id: 'fieldSales',
      tabLabel: 'Field Sales',
      title: `Field Sales - ${label}`,
      sheetName: 'Field Sales',
      blocks: [{
        type: 'table',
        columns: [
          { key: 'sales', header: 'Sales', type: 'text' },
          { key: 'function', header: 'Function', type: 'text' },
          { key: 'count', header: cnt(multi, 'Count'), type: 'int' },
          { key: 'ctc', header: 'CTC', type: 'money' },
        ],
        rows,
        sortable: true,
        filterable: true,
      }],
    },
  };
}

function segDeptTable(groups, { title, label, headers, subtotals, highlight = null }) {
  const rows = [];
  for (const g of groups) {
    for (const d of g.depts) rows.push(row({ segment: g.segment, department: d.department, ctc: d.ctc, count: d.count }, d.department === highlight ? { emphasis: true } : {}));
    if (subtotals) {
      rows.push({ kind: 'subtotal', cells: { segment: g.segment, department: 'Segment Total', ctc: g.ctc, count: g.count }, search: g.segment.toLowerCase() });
    }
  }
  rows.push({ kind: 'total', cells: { segment: 'Grand Total', department: '', ctc: sum(groups, (g) => g.ctc), count: sum(groups, (g) => g.count) }, search: '' });
  return {
    type: 'table',
    title,
    label,
    columns: [
      { key: 'segment', header: headers[0], type: 'text' },
      { key: 'department', header: headers[1], type: 'text' },
      { key: 'ctc', header: headers[2], type: 'money' },
      { key: 'count', header: headers[3], type: 'int' },
    ],
    rows,
    groupKey: 'segment',
    sortable: !subtotals,
    filterable: true,
  };
}

// ---------------------------------------------------------------------------
// Report 2 - MIS Entry
// ---------------------------------------------------------------------------
function buildMis(records, label, multi) {
  const set = othersSet();
  const OTH = CONFIG.mis.othersLabel;
  const counts = new Map();
  for (const r of records) counts.set(r.accountsData, (counts.get(r.accountsData) || 0) + W(r));

  // Section A: department-wise count (Accounts Data); the 12 listed departments become "Others"
  const direct = new Map();
  const others = new Map(CONFIG.mis.othersDepartments.map((d) => [d, 0]));
  for (const [dept, n] of counts) {
    const hit = set.get(norm(dept));
    if (hit) others.set(hit, (others.get(hit) || 0) + n);
    else direct.set(dept, (direct.get(dept) || 0) + n);
  }
  const othersTotal = r2([...others.values()].reduce((a, b) => a + b, 0));
  if (othersTotal > 0) direct.set(OTH, othersTotal);

  const order = CONFIG.mis.departmentOrder.map(norm);
  const known = [...direct.keys()].filter((k) => order.includes(norm(k))).sort((a, b) => order.indexOf(norm(a)) - order.indexOf(norm(b)));
  const unknown = [...direct.keys()].filter((k) => !order.includes(norm(k))).sort(byText);
  const listA = [...known, ...unknown];
  const totalA = r2(listA.reduce((a, k) => a + direct.get(k), 0));

  const rowsA = listA.map((k) => row({ particulars: k, count: r2(direct.get(k)) }, k === OTH ? { emphasis: true } : {}));
  rowsA.push({ kind: 'total', cells: { particulars: 'Grand Total', count: totalA }, search: '' });
  const rowsO = [...others.entries()].map(([k, n]) => row({ particulars: k, count: r2(n) }));
  rowsO.push({ kind: 'total', cells: { particulars: `Total (= "${OTH}" above)`, count: othersTotal }, search: '' });

  // Section B: Segment x Department (Department column). Every "Others" department is mapped to the
  // Petpooja segment as a single "Others" row, followed by a department-wise breakdown of Others.
  const groupsB = misSegmentGroups(records);
  const bd = new Map(CONFIG.mis.othersDepartments.map((d) => [d, { ctc: 0, count: 0 }]));
  for (const r of records) {
    const hit = set.get(norm(r.department));
    if (!hit) continue;
    const e = bd.get(hit);
    e.ctc += r.ctc;
    e.count += W(r);
  }
  const bdRows = [...bd.entries()].map(([k, e]) => row({ department: k, ctc: r2(e.ctc), count: r2(e.count) }));
  const bdCtc = r2([...bd.values()].reduce((a, e) => a + e.ctc, 0));
  const bdCount = r2([...bd.values()].reduce((a, e) => a + e.count, 0));
  bdRows.push({ kind: 'total', cells: { department: `Total (= "${OTH}" above)`, ctc: bdCtc, count: bdCount }, search: '' });
  const othersB = r2(groupsB.reduce((a, g) => a + g.depts.filter((d) => d.department === OTH).reduce((x, d) => x + d.count, 0), 0));
  const othersBCtc = r2(groupsB.reduce((a, g) => a + g.depts.filter((d) => d.department === OTH).reduce((x, d) => x + d.ctc, 0), 0));

  return {
    totalA,
    othersTotal,
    groupsB,
    othersB,
    othersBCtc,
    othersBreakdownB: bdCount,
    othersBreakdownCtc: bdCtc,
    othersDetail: [...others.entries()],
    deptDistribution: listA.map((k) => ({ name: k, value: r2(direct.get(k)) })),
    report: {
      id: 'misEntry',
      tabLabel: 'MIS Entry',
      title: `MIS Entry - ${label}`,
      sheetName: 'MIS Entry',
      blocks: [
        {
          type: 'table',
          title: `Employee Count - ${label}`,
          label: 'A. Department-wise Employee Count',
          columns: [
            { key: 'particulars', header: 'Particulars', type: 'text' },
            { key: 'count', header: cnt(multi, 'Count'), type: 'int' },
          ],
          rows: rowsA,
          sortable: false,
          filterable: false,
        },
        {
          type: 'table',
          title: 'Others - Department Breakdown',
          label: `Departments consolidated into "${OTH}"`,
          columns: [
            { key: 'particulars', header: 'Other Department', type: 'text' },
            { key: 'count', header: cnt(multi, 'Count'), type: 'int' },
          ],
          rows: rowsO,
          sortable: false,
          filterable: false,
        },
        segDeptTable(groupsB, {
          title: `Amount & Count - ${label}`,
          label: `B. Segment-wise Department Report ("${OTH}" mapped to ${CONFIG.mis.othersSegment})`,
          headers: ['Segment', 'Department', 'Total Earnings CTC', cnt(multi, 'Employee Count')],
          subtotals: true,
          highlight: OTH,
        }),
        {
          type: 'table',
          title: 'Others - Department Breakdown',
          label: `Breakdown of "${OTH}" in the Segment-wise Department Report`,
          columns: [
            { key: 'department', header: 'Other Department', type: 'text' },
            { key: 'ctc', header: 'Total Earnings CTC', type: 'money' },
            { key: 'count', header: cnt(multi, 'Employee Count'), type: 'int' },
          ],
          rows: bdRows,
          sortable: false,
          filterable: false,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Overrides (manual reclassification): matched on (month, Emp Code)
// ---------------------------------------------------------------------------
export function applyOverrides(records, overrides = []) {
  const key = (p, code) => `${p || ''}|${code}`;
  const map = new Map(overrides.map((o) => [key(o.period, String(o.empCode)), o]));
  const deptCanon = new Map();
  const segCanon = new Map();
  records.forEach((r) => {
    if (!deptCanon.has(norm(r.department))) deptCanon.set(norm(r.department), r.department);
    if (!segCanon.has(norm(r.segment))) segCanon.set(norm(r.segment), r.segment);
  });
  const applied = [];
  const effective = records.map((r) => {
    const o = map.get(key(r.p, r.code));
    if (!o) return { ...r, effSegment: r.segment, effDepartment: r.department };
    const dept = o.department ? deptCanon.get(norm(o.department)) || o.department : r.department;
    const seg = o.segment ? segCanon.get(norm(o.segment)) || o.segment : r.segment;
    applied.push({ empCode: r.code, name: r.name, period: r.p, segmentFrom: r.segment, departmentFrom: r.department, segment: seg, department: dept });
    return { ...r, effSegment: seg, effDepartment: dept };
  });
  const present = new Set(records.map((r) => key(r.p, r.code)));
  const unmatched = overrides.filter((o) => !present.has(key(o.period, String(o.empCode)))).map((o) => String(o.empCode));
  return { effective, applied, unmatched };
}

// ---------------------------------------------------------------------------
// Report 3 - Reclassification
// ---------------------------------------------------------------------------
function reclassTable(effective, label, multi) {
  const groups = groupSegDept(effective, (r) => r.effSegment, (r) => r.effDepartment);
  return {
    groups,
    table: segDeptTable(groups, { title: label, label, headers: ['Segment', 'Department', 'Sum of Earning CTC', cnt(multi, 'No. of Employee')], subtotals: false }),
  };
}

function buildReclass(effective, label, previous, multi) {
  const cur = reclassTable(effective, label, multi);
  const blocks = previous ? [{ type: 'panels', panels: [reclassTable(previous.effective, previous.label, multi).table, cur.table] }] : [cur.table];
  return {
    groups: cur.groups,
    report: { id: 'reclassification', tabLabel: 'Reclassification', title: `Reclassification - ${label}`, sheetName: 'Reclassification', blocks },
  };
}

// ---------------------------------------------------------------------------
// Report 4 - Tally Entry
// ---------------------------------------------------------------------------
function buildTally(ds, label) {
  const { records } = ds;
  const T = CONFIG.tally;
  const { rows, sums, mergedNote } = tallyAmounts(ds);
  const rowsA = rows.map((r) => ({ kind: r.kind, cells: { particular: r.name, amount: r.amount }, search: '' }));

  const blocks = [{
    type: 'table',
    title: `Salary - ${label}`,
    label: 'A. Salary Summary',
    columns: [
      { key: 'particular', header: 'Particular', type: 'text' },
      { key: 'amount', header: 'Amount', type: 'money' },
    ],
    rows: rowsA,
    sortable: false,
    filterable: false,
  }];

  if (T.includeLeaveEncashmentBlock) {
    blocks.push({
      type: 'table',
      columns: [{ key: 'particular', header: 'Leave Encashment', type: 'text' }, { key: 'amount', header: 'Amount', type: 'money' }],
      rows: ['Expenses', 'Provision'].map((p) => row({ particular: p, amount: '' })),
      sortable: false,
      filterable: false,
    });
  }

  // Loan list: one line per employee (over a date range the loan of every month is added up)
  const agg = new Map();
  for (const r of records) {
    const e = agg.get(r.code) || { code: r.code, name: '', loan: 0 };
    e.loan += r.loan;
    if (r.name) e.name = r.name;
    agg.set(r.code, e);
  }
  const loanRecs = [...agg.values()].map((e) => ({ ...e, loan: r2(e.loan) })).filter((e) => e.loan > 0).sort((a, b) => byText(a.code, b.code));
  const loanTotal = sum(loanRecs, (r) => r.loan);
  const loanRows = loanRecs.map((r) => row({ empCode: r.code, name: r.name, loan: r.loan }));
  loanRows.push({ kind: 'total', cells: { empCode: 'Total', name: `${loanRecs.length} employee(s)`, loan: loanTotal }, search: '' });
  blocks.push({
    type: 'table',
    label: 'B. Employee-wise Loan Deduction',
    columns: [
      { key: 'empCode', header: 'Emp Code', type: 'text' },
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'loan', header: 'Loan Deducted Amount', type: 'money' },
    ],
    rows: loanRows,
    sortable: true,
    filterable: true,
  });

  return {
    sums,
    mergedNote,
    loanRecs,
    loanTotal,
    report: { id: 'tallyEntry', tabLabel: 'Tally Entry', title: `Tally Entry - ${label}`, sheetName: 'Tally Entry', blocks },
  };
}

// ---------------------------------------------------------------------------
// Reconciliation checks
// ---------------------------------------------------------------------------
function buildChecks(ds, parts) {
  const tol = CONFIG.tolerance;
  const { records, components, pos, sheetTotals } = ds;
  const { mis, reclass, tally } = parts;
  const checks = [];
  const add = (id, label, ok, detail, warnOnly = false) => checks.push({ id, label, status: ok ? 'pass' : warnOnly ? 'warn' : 'fail', detail });
  const near = (a, b, t = tol) => Math.abs(a - b) <= t;
  const fmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const totalCtc = sum(records, (r) => r.ctc);
  const H = sum(records, W);
  const hB = sum(mis.groupsB, (g) => g.count);
  const hR = sum(reclass.groups, (g) => g.count);

  add('headcount', 'Employee count is the same in every report', near(mis.totalA, H, 0.05) && near(hB, H, 0.05) && near(hR, H, 0.05),
    `${fmt(H)} employees; MIS (department) ${fmt(mis.totalA)}; MIS (segment) ${fmt(hB)}; Reclassification ${fmt(hR)}`);
  add('ctc', 'CTC totals agree across reports', near(sum(mis.groupsB, (g) => g.ctc), totalCtc) && near(sum(reclass.groups, (g) => g.ctc), totalCtc),
    `Sum of employee CTC ${fmt(totalCtc)}; MIS ${fmt(sum(mis.groupsB, (g) => g.ctc))}; Reclassification ${fmt(sum(reclass.groups, (g) => g.ctc))}`);
  add('others', '"Others" equals the sum of its 12 departments', near(mis.othersTotal, mis.othersDetail.reduce((a, [, c]) => a + c, 0), 0.05), `Others = ${fmt(mis.othersTotal)}`);
  add('othersB', 'Segment-wise "Others" equals its department breakdown', near(mis.othersB, mis.othersBreakdownB, 0.05) && near(mis.othersBCtc, mis.othersBreakdownCtc),
    `Others (segment-wise) = ${fmt(mis.othersB)} employees, CTC ${fmt(mis.othersBCtc)}`);
  add('ctcCol', 'CTC column equals the CTC salary component', near(totalCtc, tally.sums[pos.ctc]), `${fmt(totalCtc)} vs ${fmt(tally.sums[pos.ctc])}`);

  const earn = tally.sums.slice(0, pos.grossTotal).reduce((a, b) => a + b, 0);
  const employer = tally.sums.slice(pos.grossTotal + 1, pos.ctc).reduce((a, b) => a + b, 0);
  const ded = tally.sums.slice(pos.ctc + 1, pos.deductionTotal).reduce((a, b) => a + b, 0);
  const g = tally.sums[pos.grossTotal];
  const net = tally.sums[components.length - 1];
  add('gross', 'Earning components add up to Gross Total', near(earn, g), `${fmt(earn)} vs ${fmt(g)}`);
  add('ctcCalc', 'Gross Total + employer contributions = CTC', near(g + employer, tally.sums[pos.ctc]), `${fmt(g + employer)} vs ${fmt(tally.sums[pos.ctc])}`);
  add('ded', 'Deduction components add up to Deduction Total', near(ded, tally.sums[pos.deductionTotal]), `${fmt(ded)} vs ${fmt(tally.sums[pos.deductionTotal])}`);
  add('net', 'Gross Total - Deduction Total = Net Amount', near(g - tally.sums[pos.deductionTotal], net), `${fmt(g - tally.sums[pos.deductionTotal])} vs ${fmt(net)}`);

  const bad = records.filter((r) => !near(r.nums[pos.grossTotal] - r.nums[pos.deductionTotal], r.nums[components.length - 1]));
  add('rowNet', 'Every employee: Gross - Deductions = Net', bad.length === 0,
    bad.length ? `${bad.length} row(s) differ, e.g. ${bad.slice(0, 5).map((r) => r.code).join(', ')}` : `${records.length} of ${records.length} employee rows reconcile`, true);

  add('loan', 'Loan list total equals the Loan column total', near(tally.loanTotal, sum(tally.loanRecs, (r) => r.loan)),
    `${tally.loanRecs.length} employees, ${fmt(tally.loanTotal)}`);

  if (sheetTotals) {
    const t = [['CTC', sheetTotals.ctc, totalCtc], ['Loan', sheetTotals.loan, sum(records, (r) => r.loan)], ['Net Amount', sheetTotals.net, net]].filter(([, v]) => v !== 0);
    const diffs = t.filter(([, a, b]) => !near(a, b));
    add('sheetTotal', "Totals match the sheet's own Total row", diffs.length === 0,
      diffs.length ? diffs.map(([l, a, b]) => `${l}: sheet ${fmt(a)} vs computed ${fmt(b)}`).join('; ') : t.map(([l, a]) => `${l} ${fmt(a)}`).join(', '));
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
/**
 * @param ds    dataset from buildDataset() or mergeDatasets()
 * @param opts  { year, month, label?, overrides?:[{empCode,period?,segment?,department}], previous?:{ds, overrides, year, month} }
 */
export function buildReports(ds, opts) {
  const { year, month, overrides = [], previous = null } = opts;
  const label = opts.label || monthLabel(year, month);
  const records = ds.records;
  const nMonths = ds.nMonths || 1;
  const multi = nMonths > 1;

  const fs = buildFieldSales(records, label, multi);
  const mis = buildMis(records, label, multi);
  const ov = applyOverrides(records, overrides);
  let prevInfo = null;
  if (previous && !multi) {
    prevInfo = { label: monthLabel(previous.year, previous.month), effective: applyOverrides(previous.ds.records, previous.overrides || []).effective };
  }
  const reclass = buildReclass(ov.effective, label, prevInfo, multi);
  const tally = buildTally(ds, label);

  const reports = [fs.report, mis.report, reclass.report, tally.report];
  const checks = buildChecks(ds, { mis, reclass, tally });

  const totalCtc = sum(records, (r) => r.ctc);
  const H = sum(records, W);
  const uniq = new Set(records.map((r) => r.code)).size;
  const kpis = {
    employees: multi ? r2(H) : records.length,
    uniqueEmployees: uniq,
    totalCtc,
    totalGross: tally.sums[ds.pos.grossTotal],
    totalNet: tally.sums[ds.components.length - 1],
    totalLoan: sum(records, (r) => r.loan),
    loanEmployees: tally.loanRecs.length,
    departments: new Set(records.map((r) => r.department)).size,
    segments: new Set(records.map((r) => r.segment)).size,
    avgCtc: H ? r2(totalCtc / (H * nMonths)) : 0, // average monthly CTC per employee
    fieldSalesEmployees: fs.totalCount,
    nMonths,
  };

  const segAgg = new Map();
  records.forEach((r) => {
    const e = segAgg.get(r.segment) || { ctc: 0, count: 0 };
    e.ctc += r.ctc;
    e.count += W(r);
    segAgg.set(r.segment, e);
  });
  const deptCtc = new Map();
  records.forEach((r) => deptCtc.set(r.department, (deptCtc.get(r.department) || 0) + r.ctc));
  const insights = {
    departmentDistribution: [...mis.deptDistribution].sort((a, b) => b.value - a.value),
    segmentCtc: [...segAgg.entries()].map(([name, e]) => ({ name, ctc: r2(e.ctc), count: r2(e.count) })).sort((a, b) => b.ctc - a.ctc),
    functionDistribution: fs.items.map((i) => ({ name: i.fn, count: i.count, ctc: i.ctc })),
    topDepartmentsByCtc: [...deptCtc.entries()].map(([name, ctc]) => ({ name, ctc: r2(ctc) })).sort((a, b) => b.ctc - a.ctc).slice(0, 10),
  };

  const extraWarnings = [];
  const extraNotices = [];
  if (fs.blank) extraWarnings.push({ code: 'BLANK_FUNCTION', message: `${fs.blank} employee(s) have a blank Function and are excluded from Field Sales (only "-" and blank are excluded).` });
  if (ov.unmatched.length) extraWarnings.push({ code: 'OVERRIDE_UNMATCHED', message: `${ov.unmatched.length} saved reclassification(s) refer to Emp Codes that are not in the sheet and were ignored.`, items: ov.unmatched.slice(0, 15) });
  if (tally.mergedNote.length) {
    extraNotices.push({
      code: 'TALLY_MERGE',
      message: `Tally Entry: ${tally.mergedNote.map((m) => m.name).join(' and ')} merged into Other Earning.`,
      items: tally.mergedNote.map((m) => `${m.name}: ${m.amount.toLocaleString('en-IN')}`),
    });
  }
  const noName = tally.loanRecs.filter((r) => !r.name);
  if (noName.length) extraWarnings.push({ code: 'LOAN_NO_NAME', message: `${noName.length} employee(s) in the loan list have a blank Name in the salary sheet.`, items: noName.slice(0, 15).map((r) => r.code) });
  if (ov.applied.length) extraNotices.push({ code: 'RECLASS_APPLIED', message: `${ov.applied.length} manual reclassification(s) applied to the Reclassification report.` });
  if (multi) extraNotices.push({ code: 'RANGE_COUNTS', message: `Combined ${nMonths} months: CTC and salary amounts are added up; "Employee Count" is the average monthly headcount.` });

  return {
    label,
    reports,
    kpis,
    insights,
    checks,
    extraWarnings,
    extraNotices,
    overridesApplied: ov.applied,
    employees: multi ? [] : ov.effective.map((r) => ({ code: r.code, name: r.name, segment: r.segment, department: r.department, ctc: r.ctc, effSegment: r.effSegment, effDepartment: r.effDepartment })),
    previousLabel: prevInfo ? prevInfo.label : null,
  };
}
