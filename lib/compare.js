// ---------------------------------------------------------------------------
// Period comparison report (Quarterly / Half-yearly / Yearly): current period vs a previous period.
// Inputs are two merged datasets (see mergeDatasets). Counts are AVERAGE monthly headcount,
// CTC and salary amounts are totals for the period.
// ---------------------------------------------------------------------------
import { norm, r2 } from './process.js';
import { fieldSalesItems, misSegmentGroups, tallyAmounts } from './reports.js';
import { monthLabel } from './period.js';

const byText = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
const W = (r) => r.w ?? 1;
const pctChange = (a, b) => (a ? r2(((b - a) / Math.abs(a)) * 100) : '');

function metrics(ds) {
  const recs = ds.records;
  const n = ds.nMonths || 1;
  const H = r2(recs.reduce((a, r) => a + W(r), 0));
  const ctc = r2(recs.reduce((a, r) => a + r.ctc, 0));
  const t = tallyAmounts(ds);
  const last = ds.components.length - 1;
  return {
    n,
    H,
    unique: new Set(recs.map((r) => r.code)).size,
    ctc,
    monthlyCtc: r2(ctc / n),
    perEmp: H ? r2(ctc / n / H) : 0,
    gross: t.sums[ds.pos.grossTotal],
    net: t.sums[last],
    loan: r2(recs.reduce((a, r) => a + r.loan, 0)),
    ctcComponent: t.sums[ds.pos.ctc],
    tally: t,
  };
}

const tbl = (label, columns, rows, extra = {}) => ({ type: 'table', label, title: label, columns, rows, sortable: false, filterable: false, ...extra });
const data = (cells) => ({ kind: 'data', cells, search: Object.values(cells).join(' ').toLowerCase() });
const total = (cells) => ({ kind: 'total', cells, search: '' });

/** Columns shared by the "item / CTC / headcount" comparison tables. */
function ctcCols(first, pl, cl) {
  return [
    ...first,
    { key: 'pCtc', header: `CTC ${pl}`, type: 'money' },
    { key: 'cCtc', header: `CTC ${cl}`, type: 'money' },
    { key: 'dCtc', header: 'Change', type: 'money', signed: true },
    { key: 'dCtcPct', header: 'Change %', type: 'pct', signed: true },
    { key: 'pCnt', header: `Avg HC ${pl}`, type: 'int' },
    { key: 'cCnt', header: `Avg HC ${cl}`, type: 'int' },
    { key: 'dCnt', header: 'Change', type: 'int', signed: true },
  ];
}

function diffCells(p = { ctc: 0, count: 0 }, c = { ctc: 0, count: 0 }) {
  return {
    pCtc: r2(p.ctc), cCtc: r2(c.ctc), dCtc: r2(c.ctc - p.ctc), dCtcPct: pctChange(p.ctc, c.ctc),
    pCnt: r2(p.count), cCnt: r2(c.count), dCnt: r2(c.count - p.count),
  };
}

const addTo = (map, key, ctc, count) => {
  const e = map.get(key) || { ctc: 0, count: 0 };
  e.ctc += ctc;
  e.count += count;
  map.set(key, e);
};

export function buildComparison({ cur, prev, curLabel, prevLabel, curShort, prevShort }) {
  const m1 = metrics(cur.ds);
  const m0 = metrics(prev.ds);

  // ---- Summary blocks
  const amt = (name, a, b) => data({ item: name, prev: r2(a), cur: r2(b), delta: r2(b - a), pct: pctChange(a, b) });
  const amountsCols = [
    { key: 'item', header: 'Particular', type: 'text' },
    { key: 'prev', header: prevShort, type: 'money' },
    { key: 'cur', header: curShort, type: 'money' },
    { key: 'delta', header: 'Change', type: 'money', signed: true },
    { key: 'pct', header: 'Change %', type: 'pct', signed: true },
  ];
  const summaryAmounts = tbl('Summary - amounts', amountsCols, [
    amt('Total earnings CTC', m0.ctc, m1.ctc),
    amt('Average monthly CTC', m0.monthlyCtc, m1.monthlyCtc),
    amt('Average monthly CTC per employee', m0.perEmp, m1.perEmp),
    amt('Gross total', m0.gross, m1.gross),
    amt('Net amount payable', m0.net, m1.net),
    amt('Loan deductions', m0.loan, m1.loan),
  ]);
  const hc = (name, a, b) => data({ item: name, prev: r2(a), cur: r2(b), delta: r2(b - a), pct: pctChange(a, b) });
  const summaryHeadcount = tbl('Summary - headcount', amountsCols.map((c) => (c.type === 'money' ? { ...c, type: 'int' } : c)), [
    hc('Average monthly headcount', m0.H, m1.H),
    hc('Unique employees in the period', m0.unique, m1.unique),
    hc('Months of data', m0.n, m1.n),
  ]);

  // ---- Segment-wise (true segments)
  const segP = new Map();
  const segC = new Map();
  prev.ds.records.forEach((r) => addTo(segP, r.segment, r.ctc, W(r)));
  cur.ds.records.forEach((r) => addTo(segC, r.segment, r.ctc, W(r)));
  const segKeys = [...new Set([...segP.keys(), ...segC.keys()])].sort(byText);
  const segRows = segKeys.map((k) => data({ name: k, ...diffCells(segP.get(k), segC.get(k)) }));
  segRows.push(total({ name: 'Grand Total', ...diffCells({ ctc: m0.ctc, count: m0.H }, { ctc: m1.ctc, count: m1.H }) }));
  const segTable = tbl('Segment-wise comparison', ctcCols([{ key: 'name', header: 'Segment', type: 'text' }], prevShort, curShort), segRows, { sortable: true });

  // ---- Segment x Department (same mapping as the MIS segment-wise report: Others in Petpooja)
  const sdKey = (g, d) => `${g}\u0000${d}`;
  const sdP = new Map();
  const sdC = new Map();
  misSegmentGroups(prev.ds.records).forEach((g) => g.depts.forEach((d) => addTo(sdP, sdKey(g.segment, d.department), d.ctc, d.count)));
  misSegmentGroups(cur.ds.records).forEach((g) => g.depts.forEach((d) => addTo(sdC, sdKey(g.segment, d.department), d.ctc, d.count)));
  const OTH = 'Others';
  const sdKeys = [...new Set([...sdP.keys(), ...sdC.keys()])].sort((a, b) => {
    const [sa, da] = a.split('\u0000');
    const [sb, db] = b.split('\u0000');
    return byText(sa, sb) || (da === OTH) - (db === OTH) || byText(da, db);
  });
  const sdRows = sdKeys.map((k) => {
    const [segment, department] = k.split('\u0000');
    return { ...data({ segment, department, ...diffCells(sdP.get(k), sdC.get(k)) }), emphasis: department === OTH };
  });
  sdRows.push(total({ segment: 'Grand Total', department: '', ...diffCells({ ctc: m0.ctc, count: m0.H }, { ctc: m1.ctc, count: m1.H }) }));
  const sdTable = tbl(
    'Segment-wise department comparison ("Others" mapped to Petpooja)',
    ctcCols([{ key: 'segment', header: 'Segment', type: 'text' }, { key: 'department', header: 'Department', type: 'text' }], prevShort, curShort),
    sdRows,
    { groupKey: 'segment', filterable: true },
  );

  // ---- Field Sales functions
  const fP = new Map(fieldSalesItems(prev.ds.records).items.map((i) => [i.fn, { ctc: i.ctc, count: i.count }]));
  const fC = new Map(fieldSalesItems(cur.ds.records).items.map((i) => [i.fn, { ctc: i.ctc, count: i.count }]));
  const fKeys = [...new Set([...fP.keys(), ...fC.keys()])].sort(byText);
  const fRows = fKeys.map((k) => data({ name: k, ...diffCells(fP.get(k), fC.get(k)) }));
  const fsT0 = [...fP.values()].reduce((a, e) => ({ ctc: a.ctc + e.ctc, count: a.count + e.count }), { ctc: 0, count: 0 });
  const fsT1 = [...fC.values()].reduce((a, e) => ({ ctc: a.ctc + e.ctc, count: a.count + e.count }), { ctc: 0, count: 0 });
  fRows.push(total({ name: 'Total', ...diffCells(fsT0, fsT1) }));
  const fsTable = tbl('Field Sales (function-wise) comparison', ctcCols([{ key: 'name', header: 'Function', type: 'text' }], prevShort, curShort), fRows);

  // ---- Tally salary components
  const tP = new Map(m0.tally.rows.map((r) => [r.name, r]));
  const tC = new Map(m1.tally.rows.map((r) => [r.name, r]));
  const names = [...m1.tally.rows.map((r) => r.name), ...m0.tally.rows.map((r) => r.name).filter((n) => !tC.has(n))];
  const tRows = names.map((n) => {
    const a = tP.get(n)?.amount ?? 0;
    const b = tC.get(n)?.amount ?? 0;
    const kind = (tC.get(n) || tP.get(n)).kind;
    return { kind, cells: { item: n, prev: r2(a), cur: r2(b), delta: r2(b - a), pct: pctChange(a, b) }, search: '' };
  });
  const tallyTable = tbl('Salary components (Tally Entry) comparison', amountsCols.map((c) => (c.key === 'item' ? { ...c, header: 'Particular' } : c)), tRows);

  // ---- Charts + KPI cards
  const trend = [];
  for (const [group, ds] of [['prev', prev.ds], ['cur', cur.ds]]) {
    const last = ds.components.length - 1;
    const byP = new Map();
    ds.records.forEach((r) => {
      const e = byP.get(r.p) || { headcount: 0, ctc: 0, net: 0 };
      e.headcount += 1;
      e.ctc += r.ctc;
      e.net += r.nums[last];
      byP.set(r.p, e);
    });
    [...byP.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([p, e]) => {
      const [y, m] = p.split('-').map(Number);
      trend.push({ period: p, label: monthLabel(y, m), group, headcount: e.headcount, ctc: r2(e.ctc), net: r2(e.net) });
    });
  }
  trend.sort((a, b) => a.period.localeCompare(b.period));

  const kpis = [
    { label: 'Avg monthly headcount', kind: 'int', prev: m0.H, cur: m1.H },
    { label: 'Total earnings CTC', kind: 'money', prev: m0.ctc, cur: m1.ctc },
    { label: 'Avg monthly CTC', kind: 'money', prev: m0.monthlyCtc, cur: m1.monthlyCtc },
    { label: 'Monthly CTC / employee', kind: 'money', prev: m0.perEmp, cur: m1.perEmp },
    { label: 'Net amount payable', kind: 'money', prev: m0.net, cur: m1.net },
    { label: 'Loan deductions', kind: 'money', prev: m0.loan, cur: m1.loan },
  ].map((k) => ({ ...k, delta: r2(k.cur - k.prev), pct: pctChange(k.prev, k.cur) }));

  const checks = [];
  const near = (a, b) => Math.abs(a - b) <= 1;
  for (const [name, m, segs] of [[curLabel, m1, segC], [prevLabel, m0, segP]]) {
    const segSum = r2([...segs.values()].reduce((a, e) => a + e.ctc, 0));
    checks.push({ id: `seg-${name}`, label: `Segment CTC adds up to the total (${name})`, status: near(segSum, m.ctc) ? 'pass' : 'fail', detail: `${segSum.toLocaleString('en-IN')} vs ${m.ctc.toLocaleString('en-IN')}` });
    checks.push({ id: `ctc-${name}`, label: `CTC column equals the CTC salary component (${name})`, status: near(m.ctc, m.ctcComponent) ? 'pass' : 'fail', detail: `${m.ctc.toLocaleString('en-IN')} vs ${m.ctcComponent.toLocaleString('en-IN')}` });
  }
  const sdSum = (map) => r2([...map.values()].reduce((a, e) => a + e.ctc, 0));
  checks.push({ id: 'sd', label: 'Segment-wise department totals equal total CTC (both periods)', status: near(sdSum(sdC), m1.ctc) && near(sdSum(sdP), m0.ctc) ? 'pass' : 'fail', detail: `${sdSum(sdC).toLocaleString('en-IN')} / ${sdSum(sdP).toLocaleString('en-IN')}` });

  return {
    report: {
      id: 'comparison',
      tabLabel: 'Comparison',
      title: `Comparison - ${curLabel} vs ${prevLabel}`,
      sheetName: 'Comparison',
      landscape: true,
      blocks: [summaryAmounts, summaryHeadcount, segTable, sdTable, fsTable, tallyTable],
    },
    kpis,
    trend,
    segmentCompare: segKeys.map((k) => ({ name: k, prev: r2(segP.get(k)?.ctc ?? 0), cur: r2(segC.get(k)?.ctc ?? 0) })),
    checks,
    months: { cur: m1.n, prev: m0.n },
  };
}
