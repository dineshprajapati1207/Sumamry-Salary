'use client';
import { CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown } from 'lucide-react';

export function Kpi({ label, value, sub, title }) {
  return (
    <div className="card p-4" title={title}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="num mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function ErrorCard({ error, onDismiss }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{error.message}</p>
          {error.details?.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {error.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
        {onDismiss && <button className="text-red-500 hover:text-red-700" onClick={onDismiss} aria-label="Dismiss">x</button>}
      </div>
    </div>
  );
}

export function ValidationPanel({ validation, open, setOpen }) {
  const { checks, warnings, notices } = validation;
  const passed = checks.filter((c) => c.status === 'pass').length;
  const bad = checks.filter((c) => c.status === 'fail').length;
  const tone = bad ? 'border-red-300 bg-red-50' : warnings.length || checks.some((c) => c.status === 'warn') ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50';
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {bad ? <XCircle className="h-5 w-5 text-red-600" /> : warnings.length ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          Data validation: {passed}/{checks.length} checks passed
          {warnings.length > 0 && <span className="text-amber-700">, {warnings.length} warning(s)</span>}
          {notices.length > 0 && <span className="text-slate-500">, {notices.length} note(s)</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-4 text-sm">
          {warnings.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-amber-800">Warnings (please review)</p>
              <ul className="space-y-2">
                {warnings.map((w, i) => (
                  <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>{w.message}{w.items?.length > 0 && <p className="mt-0.5 text-xs text-slate-600">{w.items.join('; ')}</p>}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1 font-semibold text-slate-800">Reconciliation checks</p>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.id} className="flex gap-2">
                  {c.status === 'pass' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : c.status === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <span><span className="font-medium">{c.label}.</span> <span className="text-slate-600">{c.detail}</span></span>
                </li>
              ))}
            </ul>
          </div>
          {notices.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-slate-800">Notes</p>
              <ul className="space-y-2">
                {notices.map((n, i) => (
                  <li key={i} className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <div>{n.message}{n.items?.length > 0 && <p className="mt-0.5 text-xs text-slate-600">{n.items.join('; ')}</p>}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

