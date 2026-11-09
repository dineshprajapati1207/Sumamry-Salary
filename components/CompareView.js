'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, Line, Cell } from 'recharts';
import { compactInr, fmtInt, fmtPct } from '@/lib/format';
import ReportView from './ReportView';

function DeltaKpi({ k, prevLabel, curLabel }) {
  const show = (v) => (k.kind === 'money' ? compactInr(v) : fmtInt(v));
  const up = k.delta > 0;
  const flat = k.delta === 0;
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
      <p className="num mt-1 text-2xl font-bold text-slate-900">{show(k.cur)}</p>
      <p className="mt-0.5 text-xs text-slate-500">{prevLabel}: {show(k.prev)}</p>
      <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${flat ? 'bg-slate-100 text-slate-600' : up ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
        {flat ? 'No change' : `${up ? '+' : ''}${k.kind === 'money' ? compactInr(k.delta) : fmtInt(k.delta)}${k.pct === '' ? '' : ` (${up ? '+' : ''}${fmtPct(k.pct)})`}`}
      </p>
    </div>
  );
}

export default function CompareView({ data, ctx }) {
  const c = data.compare;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        Comparing <b>{c.curLabel}</b> with <b>{c.prevLabel}</b>. CTC and salary amounts are period totals; headcount is the average per month.
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {c.kpis.map((k) => <DeltaKpi key={k.label} k={k} prevLabel={c.prevShort} curLabel={c.curShort} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-800">Segment-wise CTC: {c.prevShort} vs {c.curShort}</h3>
          <div style={{ height: 320 }} className="mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.segmentCompare} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={compactInr} width={70} />
                <Tooltip formatter={(v) => compactInr(v)} cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="prev" name={c.prevShort} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cur" name={c.curShort} fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-800">Month-by-month CTC and headcount</h3>
          <p className="mb-1 text-xs text-slate-500">Bars: CTC ({c.prevShort} grey, {c.curShort} indigo). Line: headcount.</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={c.trend} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={compactInr} width={70} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} width={50} domain={['auto', 'auto']} />
                <Tooltip formatter={(v, name) => (name === 'Headcount' ? fmtInt(v) : compactInr(v))} />
                <Bar yAxisId="l" dataKey="ctc" name="CTC" radius={[4, 4, 0, 0]}>
                  {c.trend.map((t, i) => <Cell key={i} fill={t.group === 'cur' ? '#4f46e5' : '#94a3b8'} />)}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="headcount" name="Headcount" stroke="#f59e0b" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      {data.reports.map((r) => <ReportView key={r.id} report={r} ctx={ctx} />)}
    </div>
  );
}
