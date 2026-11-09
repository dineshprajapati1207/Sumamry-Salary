'use client';
import { useMemo, useState } from 'react';
import { Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/client';

export default function ReclassEditor({ data, canEdit, onChanged, onError, onToast }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [dept, setDept] = useState('');
  const [seg, setSeg] = useState('');
  const [busy, setBusy] = useState(false);

  const { year, month } = data.meta;
  const departments = useMemo(() => [...new Set(data.employees.flatMap((e) => [e.department, e.effDepartment]))].sort(), [data]);
  const segments = useMemo(() => [...new Set(data.employees.flatMap((e) => [e.segment, e.effSegment]))].sort(), [data]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return data.employees.filter((e) => e.code.toLowerCase().includes(s) || e.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q, data]);

  async function save() {
    if (!sel || !dept.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/api/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, empCode: sel.code, department: dept, segment: seg }),
      });
      onToast('Reclassification saved for this month.');
      setSel(null); setQ(''); setDept(''); setSeg('');
      await onChanged();
    } catch (e) { onError(e); } finally { setBusy(false); }
  }

  async function remove(empCode) {
    setBusy(true);
    try {
      await apiFetch(`/api/overrides?year=${year}&month=${month}&empCode=${encodeURIComponent(empCode)}`, { method: 'DELETE' });
      onToast('Reclassification removed.');
      await onChanged();
    } catch (e) { onError(e); } finally { setBusy(false); }
  }

  return (
    <div className="card mb-6 p-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Pencil className="h-4 w-4 text-indigo-600" /> Manual reclassification
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{data.overrides.length} saved for this month</span>
        </span>
        <span className="text-xs text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-500">
            Move an employee to a different department (and optionally segment) in the Reclassification report only. Changes are saved for {data.meta.label} and re-applied every time you open this month.
          </p>

          {canEdit ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Find employee (code or name)</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="e.g. 0123 or Jay" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" />
                </div>
                {!sel && matches.length > 0 && (
                  <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
                    {matches.map((e) => (
                      <li key={e.code}>
                        <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setSel(e); setDept(e.effDepartment); setSeg(e.effSegment); }}>
                          <span className="font-medium">{e.code}</span> {e.name}
                          <span className="block text-xs text-slate-500">{e.effSegment} / {e.effDepartment}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                {sel ? (
                  <div className="space-y-2">
                    <p className="text-sm"><span className="font-semibold">{sel.code}</span> {sel.name}<br /><span className="text-xs text-slate-500">Sheet says: {sel.segment} / {sel.department}</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">New department</label>
                        <input list="dept-list" value={dept} onChange={(e) => setDept(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        <datalist id="dept-list">{departments.map((d) => <option key={d} value={d} />)}</datalist>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Segment</label>
                        <select value={seg} onChange={(e) => setSeg(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                          {segments.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={save} disabled={busy || !dept.trim()}>
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save reclassification
                    </button>
                  </div>
                ) : (
                  <p className="pt-6 text-sm text-slate-400">Search and pick an employee to change.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Your account has view-only access. Ask an administrator to change reclassifications.</p>
          )}

          {data.overrides.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Emp Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th><th /></tr>
                </thead>
                <tbody>
                  {data.overrides.map((o) => (
                    <tr key={o.empCode} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{o.empCode}</td>
                      <td className="px-3 py-1.5">{o.name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{o.segmentFrom} / {o.departmentFrom}</td>
                      <td className="px-3 py-1.5 font-medium">{o.segment} / {o.department}</td>
                      <td className="px-3 py-1.5 text-right">
                        {canEdit && <button title="Remove" className="text-slate-400 hover:text-red-600" onClick={() => remove(o.empCode)} disabled={busy}><Trash2 className="h-4 w-4" /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
