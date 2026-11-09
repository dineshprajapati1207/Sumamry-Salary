// Run with:  npm test      (uses synthetic data only - no real payroll in the repo)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, mergeDatasets } from '../lib/process.js';
import { buildComparison } from '../lib/compare.js';
import { periodMonths, describePeriod, shiftMonths, monthsBetween } from '../lib/periods.js';
import { buildReports } from '../lib/reports.js';
import { parseMonthYear } from '../lib/period.js';

const HEAD = ['Emp Code', 'Name', 'Segment', 'Department', 'Funtion', 'Accounts Data', 'BASIC', 'Arrears', 'LWP Reimbu', 'Other Earning', 'Bonus', 'Gross Total', 'EMP PF', 'CTC', 'PF', 'Loan', 'Deduction Total', 'Net Amount'];
//                 code    name  seg  dept  func  acct     basic arr lwp other bonus gross  empPF ctc  pf  loan ded  net
const row = (c, n, s, d, f, a, o) => [c, n, s, d, f, a, o.basic, o.arr ?? 0, o.lwp ?? 0, o.other ?? 0, o.bonus ?? 0, o.gross, o.pf ?? 0, o.ctc, o.pf ?? 0, o.loan ?? 0, o.ded, o.gross - o.ded];
const sheet = (rows) => [["Salary Sheet for the month of Oct'26"], [], HEAD, ...rows, ['Total']];

const rows = [
  row('0001', 'A', 'Petpooja', 'Sales', 'OB', 'Sales', { basic: 100, other: 10, arr: 5, lwp: 5, gross: 120, pf: 10, ctc: 130, ded: 15, loan: 5 }),
  row('0002', 'B', 'Petpooja', 'Sales', '-', 'Business Development', { basic: 200, gross: 200, ctc: 200, ded: 0 }),
  row('0003', 'C', 'Attendo', 'sales management & analytics', 'NPU', 'Operations', { basic: 50, gross: 50, ctc: 50, ded: 0 }),
  row('0004', 'D', 'Attendo', 'Sales Management & Analytics', 'OB', 'Support', { basic: 60, gross: 60, ctc: 60, ded: 0 }),
  row('0004', 'D dup', 'Attendo', 'Support', 'OB', 'Support', { basic: 999, gross: 999, ctc: 999, ded: 0 }),
];

test('month/year parsing from file names', () => {
  assert.deepEqual(parseMonthYear("Salary Sheet - Oct'26"), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthYear('Salary_Sheet_-_Nov_26.xls'), { year: 2026, month: 11 });
  assert.deepEqual(parseMonthYear('Salary Sheet December 2027.xlsx'), { year: 2027, month: 12 });
  assert.equal(parseMonthYear('salary final.xlsx'), null);
});

test('missing required columns are reported, not ignored', () => {
  const bad = sheet(rows).map((r) => r.map((c) => (c === 'Loan' ? 'Lone' : c)));
  const res = buildDataset(bad);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /Loan/);
});

test('duplicates excluded, Total row excluded, spelling merged', () => {
  const res = buildDataset(sheet(rows), { expected: { year: 2026, month: 10 } });
  assert.equal(res.ok, true);
  assert.equal(res.dataset.records.length, 4);
  assert.ok(res.warnings.some((w) => w.code === 'DUPLICATE_EMP_CODE'));
  const depts = new Set(res.dataset.records.map((r) => r.department));
  assert.equal(depts.size, 2); // Sales + Sales Management & Analytics (case variants merged)
});

test('reports: field sales, others, tally merge, loan list', () => {
  const ds = buildDataset(sheet(rows), { expected: { year: 2026, month: 10 } }).dataset;
  const out = buildReports(ds, { year: 2026, month: 10 });
  const byId = Object.fromEntries(out.reports.map((r) => [r.id, r]));

  const fs = byId.fieldSales.blocks[0].rows;
  assert.deepEqual(fs.filter((r) => r.kind === 'data').map((r) => r.cells.function), ['NPU', 'OB']); // "-" excluded
  assert.equal(fs.at(-1).cells.count, 3);

  const mis = byId.misEntry.blocks[0].rows;
  const others = mis.find((r) => r.cells.particulars === 'Others');
  assert.equal(others.cells.count, 2); // Business Development + Operations

  const tally = byId.tallyEntry.blocks[0].rows.map((r) => r.cells);
  assert.ok(!tally.some((c) => c.particular === 'Arrears' || c.particular === 'LWP Reimbu'));
  assert.equal(tally.find((c) => c.particular === 'Other Earning').amount, 20); // 10 + 5 + 5
  assert.ok(tally.some((c) => c.particular === 'Statutory Bonus'));

  const loans = byId.tallyEntry.blocks.at(-1).rows;
  assert.equal(loans.filter((r) => r.kind === 'data').length, 1);
  assert.ok(out.checks.every((c) => c.status !== 'fail'));
});

test('MIS segment-wise report maps all "Others" departments to Petpooja, with a department-wise breakdown', () => {
  const ds = buildDataset(sheet(rows), { expected: { year: 2026, month: 10 } }).dataset;
  const out = buildReports(ds, { year: 2026, month: 10 });
  const blocks = out.reports.find((r) => r.id === 'misEntry').blocks;
  const b = blocks[2].rows.filter((r) => r.kind === 'data').map((r) => r.cells);
  // Both Attendo employees are in "Sales Management & Analytics" (one of the 12), so they move to Petpooja / Others.
  assert.ok(!b.some((c) => c.segment === 'Attendo'));
  const petpooja = b.filter((c) => c.segment === 'Petpooja');
  assert.equal(petpooja.at(-1).department, 'Others'); // Others is the last row of the segment
  assert.equal(petpooja.at(-1).count, 2);
  assert.ok(!b.some((c) => c.department === 'Sales Management & Analytics'));
  // Breakdown is department-wise (no segment column)
  const breakdown = blocks[3].rows.filter((r) => r.kind === 'data').map((r) => r.cells);
  assert.equal(breakdown.find((c) => c.department === 'Sales Management & Analytics').count, 2);
  assert.ok(breakdown.every((c) => !('segment' in c)));
  assert.ok(out.checks.every((c) => c.status !== 'fail'));
});

test('period maths: quarters, halves, years (financial and calendar)', () => {
  const q3 = periodMonths({ type: 'quarter', fy: 2026, index: 3, S: 4 });
  assert.deepEqual(q3.map((m) => `${m.year}-${m.month}`), ['2026-10', '2026-11', '2026-12']);
  assert.equal(describePeriod(q3, 'quarter', 4).name, 'Q3 FY26-27');
  const prev = shiftMonths(q3, -3);
  assert.equal(describePeriod(prev, 'quarter', 4).name, 'Q2 FY26-27');
  assert.equal(describePeriod(periodMonths({ type: 'half', fy: 2026, index: 2, S: 1 }), 'half', 1).name, 'H2 2026');
  assert.equal(periodMonths({ type: 'year', fy: 2026, index: 1, S: 4 }).at(-1).month, 3); // FY ends in March
  assert.equal(periodMonths({ type: 'year', fy: 2026, index: 1, S: 4 }).at(-1).year, 2027);
  assert.deepEqual(monthsBetween({ year: 2026, month: 11 }, { year: 2027, month: 2 }).length, 4);
});

test('custom range: CTC is added up, headcount is the monthly average, loans add per employee', () => {
  const one = (m) => buildDataset(sheet(rows), { period: { year: 2026, month: m } }).dataset;
  const single = buildReports(one(10), { year: 2026, month: 10 });
  const merged = mergeDatasets([{ period: { year: 2026, month: 10 }, ds: one(10) }, { period: { year: 2026, month: 11 }, ds: one(11) }]);
  const range = buildReports(merged, { year: 2026, month: 11, label: "Oct'26 to Nov'26" });
  assert.equal(range.kpis.totalCtc, single.kpis.totalCtc * 2);
  assert.equal(range.kpis.employees, single.kpis.employees); // average headcount unchanged
  assert.equal(range.kpis.uniqueEmployees, 4);
  const loans = range.reports.find((r) => r.id === 'tallyEntry').blocks.at(-1).rows;
  assert.equal(loans[0].cells.loan, 10); // 5 per month x 2
  assert.ok(range.checks.every((c) => c.status !== 'fail'));
});

test('comparison: identical periods show zero change; a 10% rise shows +10%', () => {
  const mk = (m, f) => {
    const ds = buildDataset(sheet(rows), { period: { year: 2026, month: m } }).dataset;
    ds.records = ds.records.map((r) => ({ ...r, ctc: r.ctc * f, nums: r.nums.map((x) => x * f) }));
    return mergeDatasets([{ period: { year: 2026, month: m }, ds }]);
  };
  const same = buildComparison({ cur: { ds: mk(11, 1) }, prev: { ds: mk(10, 1) }, curLabel: 'B', prevLabel: 'A', curShort: 'B', prevShort: 'A' });
  assert.equal(same.kpis.find((k) => k.label === 'Total earnings CTC').delta, 0);
  const up = buildComparison({ cur: { ds: mk(11, 1.1) }, prev: { ds: mk(10, 1) }, curLabel: 'B', prevLabel: 'A', curShort: 'B', prevShort: 'A' });
  assert.equal(up.kpis.find((k) => k.label === 'Total earnings CTC').pct, 10);
  assert.ok(up.checks.every((c) => c.status === 'pass'));
  assert.equal(up.report.landscape, true);
});

test('manual override moves an employee in Reclassification only', () => {
  const ds = buildDataset(sheet(rows), { expected: { year: 2026, month: 10 } }).dataset;
  const out = buildReports(ds, { year: 2026, month: 10, overrides: [{ empCode: '0001', department: 'Corporate Development' }] });
  const rc = out.reports.find((r) => r.id === 'reclassification').blocks[0].rows;
  assert.ok(rc.some((r) => r.cells.department === 'Corporate Development'));
  const mis = out.reports.find((r) => r.id === 'misEntry').blocks[2].rows;
  assert.ok(!mis.some((r) => r.cells.department === 'Corporate Development'));
});
