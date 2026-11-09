'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { compactInr, fmtInt } from '@/lib/format';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#ec4899'];

function Panel({ title, subtitle, children }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="mb-2 text-xs text-slate-500">{subtitle}</p>}
      {children}
    </div>
  );
}

function HBar({ data, dataKey, nameKey = 'name', fmt }) {
  const height = Math.max(240, data.length * 26 + 30);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
          <YAxis type="category" dataKey={nameKey} width={140} tick={{ fontSize: 11 }} interval={0} />
          <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey={dataKey} fill="#4f46e5" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Charts({ insights }) {
  const { departmentDistribution, segmentCtc, functionDistribution, topDepartmentsByCtc } = insights;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Department-wise employee distribution" subtitle='Accounts Data departments, with the 12 consolidated departments shown as "Others"'>
        <HBar data={departmentDistribution} dataKey="value" fmt={fmtInt} />
      </Panel>
      <Panel title="Segment-wise CTC distribution" subtitle="Share of total Earnings CTC by segment">
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={segmentCtc} dataKey="ctc" nameKey="name" innerRadius={60} outerRadius={105} paddingAngle={2}>
                {segmentCtc.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => compactInr(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Function-wise employee distribution" subtitle="Field Sales functions (excludes employees with Function “-”)">
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={functionDistribution} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtInt(v)} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" name="Employees" radius={[4, 4, 0, 0]}>
                {functionDistribution.map((_, i) => <Cell key={i} fill={COLORS[(i + 1) % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Top 10 departments by CTC" subtitle="Department column of the salary sheet">
        <HBar data={topDepartmentsByCtc} dataKey="ctc" fmt={compactInr} />
      </Panel>
    </div>
  );
}
