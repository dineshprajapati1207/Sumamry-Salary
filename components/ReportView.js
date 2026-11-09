'use client';
import { useMemo, useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { fmtCell } from '@/lib/format';
import ExportMenu from './ExportMenu';

function cellText(col, v) {
  const t = fmtCell(col.type, v, col.signed);
  return col.type === 'money' && t !== '' ? `\u20B9 ${t}` : t;
}

function TableBlock({ block, showLabel = true }) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState(null); // {key, dir}

  const rows = useMemo(() => {
    const data = block.rows.filter((r) => r.kind === 'data');
    const totals = block.rows.filter((r) => r.kind === 'total');
    const q = filter.trim().toLowerCase();
    if (!q && !sort) return block.rows;
    let list = q ? data.filter((r) => r.search.includes(q)) : data;
    if (sort) {
      const col = block.columns.find((c) => c.key === sort.key);
      list = [...list].sort((a, b) => {
        const x = a.cells[sort.key];
        const y = b.cells[sort.key];
        const c = col.type === 'text' ? String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' }) : Number(x || 0) - Number(y || 0);
        return sort.dir === 'asc' ? c : -c;
      });
    }
    return [...list, ...totals];
  }, [block, filter, sort]);

  // Show a repeated group label (e.g. Segment) only once, unless the user has sorted.
  let prevGroup = null;
  const isFiltered = filter.trim().length > 0;

  return (
    <div className="min-w-0">
      {(showLabel && (block.label || block.title)) && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{block.label || block.title}</h3>
          {block.label && block.title && block.title !== block.label && <span className="text-xs text-slate-500">{block.title}</span>}
        </div>
      )}
      {block.filterable && (
        <div className="relative mb-2 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rows..." className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" />
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-800 text-white">
            <tr>
              {block.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-semibold ${c.type === 'text' ? 'text-left' : 'text-right'}`}>
                  {block.sortable ? (
                    <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => (s && s.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }))}>
                      {c.header}
                      <ArrowUpDown className={`h-3 w-3 ${sort?.key === c.key ? 'opacity-100' : 'opacity-40'}`} />
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cls =
                r.kind === 'total' ? 'bg-indigo-100 font-bold' :
                r.kind === 'subtotal' ? 'bg-indigo-50 font-semibold' :
                r.emphasis ? 'bg-amber-50 font-semibold' : 'hover:bg-slate-50';
              return (
                <tr key={i} className={`border-t border-slate-100 ${cls}`}>
                  {block.columns.map((c) => {
                    let v = r.cells[c.key];
                    let dim = false;
                    if (block.groupKey && c.key === block.groupKey && r.kind === 'data' && !sort && !isFiltered) {
                      if (v === prevGroup) dim = true;
                    }
                    return (
                      <td key={c.key} className={`px-3 py-1.5 ${c.type === 'text' ? 'text-left' : 'num text-right'} ${dim ? 'text-slate-300' : ''}`}>
                        {cellText(c, v)}
                      </td>
                    );
                  })}
                  {(() => { if (block.groupKey && r.kind === 'data') prevGroup = r.cells[block.groupKey]; return null; })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isFiltered && <p className="mt-1 text-xs text-slate-500">Filtered view. The Total row still shows the full-report total.</p>}
    </div>
  );
}

export default function ReportView({ report, ctx }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">{report.title}</h2>
        <ExportMenu label="Export this report" busy={ctx.exporting === report.id} onPick={(fmt) => ctx.onExport(report.id, fmt)} />
      </div>
      <div className="space-y-6">
        {report.blocks.map((b, i) =>
          b.type === 'panels' ? (
            <div key={i} className="grid gap-4 lg:grid-cols-2">
              {b.panels.map((p, j) => <TableBlock key={j} block={p} />)}
            </div>
          ) : (
            <TableBlock key={i} block={b} />
          ),
        )}
      </div>
    </section>
  );
}
