'use client';
import { useEffect, useMemo, useState } from 'react';
import { MONTH_FULL, MONTH_ABBR, monthLabel } from '@/lib/period';
import { PERIOD_TYPES, fyOf, ymKey, periodMonths, yearStartMonth } from '@/lib/periods';

const FY_START = 4; // keep in sync with CONFIG.fiscalYearStartMonth

export default function PeriodBar({ files, view, onApply, busy }) {
  const periods = useMemo(
    () => files.years.flatMap((y) => y.months.map((m) => ({ key: ymKey(y.year, m.month), year: y.year, month: m.month, label: monthLabel(y.year, m.month) }))).sort((a, b) => a.key.localeCompare(b.key)),
    [files],
  );
  const latest = periods[periods.length - 1];

  const [mode, setMode] = useState(view?.mode || 'month');
  const [from, setFrom] = useState(view?.mode === 'range' ? view.from : periods[Math.max(0, periods.length - 6)]?.key);
  const [to, setTo] = useState(view?.mode === 'range' ? view.to : latest?.key);
  const [cmp, setCmp] = useState(() => (view?.mode === 'compare' ? { type: view.type, yearType: view.yearType, fy: view.fy, index: view.index, basis: view.basis } : { type: 'quarter', yearType: 'fy', ...defaults('quarter', 'fy'), basis: 'prev' }));

  function defaults(type, yearType) {
    const S = yearStartMonth(yearType, FY_START);
    if (!latest) return { fy: new Date().getFullYear(), index: 1 };
    const fy = fyOf(latest.year, latest.month, S);
    const len = PERIOD_TYPES[type].len;
    const offset = latest.year * 12 + latest.month - 1 - (fy * 12 + S - 1);
    return { fy, index: type === 'year' ? 1 : Math.floor(offset / len) + 1 };
  }

  // keep the month dropdowns in step when the dashboard itself changes the month (e.g. a new sheet arrives)
  const [sel, setSel] = useState({ year: view?.year ?? latest?.year, month: view?.month ?? latest?.month });
  useEffect(() => {
    if (view?.mode === 'month') setSel({ year: view.year, month: view.month });
  }, [view]);

  const years = files.years;
  const monthsOfYear = years.find((y) => y.year === sel.year)?.months || [];

  function pickYear(y) {
    const ms = years.find((x) => x.year === y).months;
    const m = ms.some((x) => x.month === sel.month) ? sel.month : ms[ms.length - 1].month;
    setSel({ year: y, month: m });
    onApply({ mode: 'month', year: y, month: m });
  }
  function pickMonth(m) {
    setSel({ ...sel, month: m });
    onApply({ mode: 'month', year: sel.year, month: m });
  }
  function switchMode(m) {
    setMode(m);
    if (m === 'month') onApply({ mode: 'month', year: sel.year ?? latest.year, month: sel.month ?? latest.month });
  }

  function preset(v) {
    if (!v) return;
    const n = { last3: 3, last6: 6, last12: 12 }[v];
    if (n) {
      setFrom(periods[Math.max(0, periods.length - n)].key);
      setTo(latest.key);
    } else if (v === 'fy') {
      const fy = fyOf(latest.year, latest.month, FY_START);
      const inFy = periods.filter((p) => fyOf(p.year, p.month, FY_START) === fy);
      setFrom(inFy[0].key);
      setTo(latest.key);
    }
  }

  const S = yearStartMonth(cmp.yearType, FY_START);
  const fyOptions = useMemo(() => [...new Set(periods.map((p) => fyOf(p.year, p.month, S)))].sort((a, b) => b - a), [periods, S]);
  const fyText = (fy) => (S === 1 ? String(fy) : `FY ${fy}-${String(fy + 1).slice(2)}`);
  const idxOptions = Array.from({ length: PERIOD_TYPES[cmp.type].count }, (_, i) => {
    const ms = periodMonths({ type: cmp.type, fy: cmp.fy, index: i + 1, S });
    const lab = cmp.type === 'quarter' ? `Q${i + 1}` : cmp.type === 'half' ? `H${i + 1}` : 'Full year';
    return { value: i + 1, label: `${lab} (${MONTH_ABBR[ms[0].month - 1]} to ${MONTH_ABBR[ms[ms.length - 1].month - 1]})` };
  });

  const seg = (id, label) => (
    <button key={id} onClick={() => switchMode(id)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === id ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`}>{label}</button>
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-white/20 bg-white/5 p-0.5" role="tablist" aria-label="View">
        {seg('month', 'Single month')}
        {seg('range', 'Custom range')}
        {seg('compare', 'Compare periods')}
      </div>

      {mode === 'month' && (
        <>
          <select className="select" aria-label="Year" value={sel.year ?? ''} onChange={(e) => pickYear(parseInt(e.target.value, 10))}>
            {years.map((y) => <option key={y.year} value={y.year}>{y.year}</option>)}
          </select>
          <select className="select" aria-label="Month" value={sel.month ?? ''} onChange={(e) => pickMonth(parseInt(e.target.value, 10))}>
            {monthsOfYear.map((m) => <option key={m.month} value={m.month}>{MONTH_FULL[m.month - 1]}</option>)}
          </select>
        </>
      )}

      {mode === 'range' && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-200">From
            <select className="select" value={from || ''} onChange={(e) => setFrom(e.target.value)}>
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">To
            <select className="select" value={to || ''} onChange={(e) => setTo(e.target.value)}>
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <select className="select" aria-label="Quick range" value="" onChange={(e) => preset(e.target.value)}>
            <option value="">Quick range...</option>
            <option value="last3">Last 3 months</option>
            <option value="last6">Last 6 months</option>
            <option value="last12">Last 12 months</option>
            <option value="fy">Financial year to date</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !from || !to || from > to} onClick={() => onApply({ mode: 'range', from, to })}>Apply range</button>
          {from > to && <span className="text-xs text-amber-300">"From" is after "To"</span>}
        </>
      )}

      {mode === 'compare' && (
        <>
          <select className="select" aria-label="Period type" value={cmp.type} onChange={(e) => setCmp({ ...cmp, type: e.target.value, ...defaults(e.target.value, cmp.yearType) })}>
            {Object.entries(PERIOD_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="select" aria-label="Year type" value={cmp.yearType} onChange={(e) => setCmp({ ...cmp, yearType: e.target.value, ...defaults(cmp.type, e.target.value) })}>
            <option value="fy">Financial year (Apr-Mar)</option>
            <option value="calendar">Calendar year (Jan-Dec)</option>
          </select>
          <select className="select" aria-label="Year" value={cmp.fy ?? ''} onChange={(e) => setCmp({ ...cmp, fy: parseInt(e.target.value, 10) })}>
            {fyOptions.map((fy) => <option key={fy} value={fy}>{fyText(fy)}</option>)}
          </select>
          {cmp.type !== 'year' && (
            <select className="select" aria-label="Period" value={cmp.index} onChange={(e) => setCmp({ ...cmp, index: parseInt(e.target.value, 10) })}>
              {idxOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {cmp.type !== 'year' && (
            <select className="select" aria-label="Compare with" value={cmp.basis} onChange={(e) => setCmp({ ...cmp, basis: e.target.value })}>
              <option value="prev">vs previous {cmp.type === 'quarter' ? 'quarter' : 'half-year'}</option>
              <option value="yoy">vs same period last year</option>
            </select>
          )}
          <button className="btn btn-primary" disabled={busy || !cmp.fy} onClick={() => onApply({ mode: 'compare', ...cmp })}>Compare</button>
        </>
      )}
    </div>
  );
}
