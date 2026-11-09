'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { monthLabel } from '@/lib/period';
import { compactInr, fullInr, fmtInt } from '@/lib/format';
import { apiFetch, downloadFile, viewQuery } from '@/lib/client';
import Charts from './Charts';
import ReportView from './ReportView';
import ReclassEditor from './ReclassEditor';
import UploadButton from './UploadButton';
import ExportMenu from './ExportMenu';
import PeriodBar from './PeriodBar';
import CompareView from './CompareView';
import { Kpi, ErrorCard, ValidationPanel } from './ui';

const TABS = [
  ['fieldSales', 'Field Sales'],
  ['misEntry', 'MIS Entry'],
  ['reclassification', 'Reclassification'],
  ['tallyEntry', 'Tally Entry'],
];
const POLL_MS = 3 * 60 * 1000; // how often the dashboard re-checks Drive for new / replaced sheets

const signature = (f) => {
  const m = new Map();
  f.years.forEach((y) => y.months.forEach((x) => m.set(y.year * 12 + x.month, x.modified || '')));
  return m;
};
const toPeriod = (k) => ({ year: Math.floor((k - 1) / 12), month: ((k - 1) % 12) + 1 });

export default function Dashboard() {
  const [files, setFiles] = useState(null);
  const [view, setView] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('fieldSales');
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [valOpen, setValOpen] = useState(false);
  const [newFound, setNewFound] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const reqId = useRef(0);
  const sigRef = useRef(null);
  const viewRef = useRef(null);
  const lastCheck = useRef(0);
  const forceRef = useRef(false); // set after an upload so the next load bypasses cached file lists

  const showToast = useCallback((message, type = 'ok') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const loadReport = useCallback(async (v, refresh = false) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/report?${viewQuery(v)}${refresh ? '&refresh=1' : ''}`);
      if (id !== reqId.current) return;
      setData(res);
      const bad = res.validation.checks.some((c) => c.status !== 'pass');
      setValOpen(res.validation.warnings.length > 0 || bad);
    } catch (e) {
      if (id !== reqId.current) return;
      setData(null);
      setError(e);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async (refresh = false) => {
    try {
      const f = await apiFetch(`/api/files${refresh ? '?refresh=1' : ''}`);
      setFiles(f);
      sigRef.current = signature(f);
      setCheckedAt(new Date());
      if (!f.years.length) {
        setError({ message: 'No salary sheets were found. Add a file such as "Salary Sheet - Oct\'26" to the year folder in Google Drive (or upload one), then press Refresh.', details: f.warnings });
        setLoading(false);
        return null;
      }
      return f;
    } catch (e) {
      setError(e);
      setLoading(false);
      return null;
    }
  }, []);

  const latestOf = (f) => {
    const ly = f.years[0];
    return { mode: 'month', year: ly.year, month: ly.months[ly.months.length - 1].month };
  };

  // first load: always open the latest month
  useEffect(() => {
    (async () => {
      const f = await loadFiles(false);
      if (f) setView(latestOf(f));
    })();
  }, [loadFiles]);

  useEffect(() => {
    viewRef.current = view;
    if (view) {
      setNewFound(null);
      loadReport(view, forceRef.current);
      forceRef.current = false;
    }
  }, [view, loadReport]);

  // Automatic detection of new / replaced salary sheets: no button press needed.
  const checkForUpdates = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const f = await apiFetch('/api/files?refresh=1');
      setCheckedAt(new Date());
      const next = signature(f);
      const prev = sigRef.current;
      sigRef.current = next;
      setFiles(f);
      if (!prev) return;
      const v = viewRef.current;
      const added = [...next.keys()].filter((k) => !prev.has(k)).sort((a, b) => a - b);
      const changed = [...next.keys()].filter((k) => prev.has(k) && next.get(k) !== prev.get(k));
      if (added.length) {
        const newest = toPeriod(added[added.length - 1]);
        const following = v?.mode === 'month' && v.year * 12 + v.month === Math.max(...prev.keys());
        if (!v || following) {
          setView({ mode: 'month', ...newest });
          showToast(`New salary sheet detected: ${monthLabel(newest.year, newest.month)}. Showing its reports.`);
        } else {
          setNewFound(newest);
        }
      } else if (changed.length && v) {
        const affects = v.mode !== 'month' || changed.includes(v.year * 12 + v.month);
        if (affects) {
          showToast('A salary sheet was updated. Data reloaded.');
          loadReport(v, true);
        }
      }
    } catch {
      /* background check: stay quiet, the next one will retry */
    }
  }, [loadReport, showToast]);

  useEffect(() => {
    const timer = setInterval(checkForUpdates, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > 30000) checkForUpdates();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [checkForUpdates]);

  async function onRefresh() {
    const f = await loadFiles(true);
    if (f) {
      const v = view || latestOf(f);
      if (view) loadReport(v, true);
      else setView(v);
    }
  }

  async function onUploaded(res) {
    const f = await loadFiles(true);
    if (f) {
      forceRef.current = true;
      setView({ mode: 'month', year: res.year, month: res.month });
    }
  }

  async function onExport(reportId, format) {
    setExporting(reportId);
    try {
      await downloadFile(`/api/export?${viewQuery(view)}&report=${reportId}&format=${format}`);
      showToast('Download started.');
    } catch (e) {
      setError(e);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setExporting(null);
    }
  }

  const ctx = { exporting, onExport };
  const meta = data?.meta;
  const k = data?.kpis;
  const multi = (k?.nMonths || 1) > 1;
  const active = data?.reports.find((r) => r.id === tab);
  const sourceText = meta?.source === 'drive' ? 'Google Drive' : meta?.source === 'upload' ? 'Uploaded' : 'Google Drive and uploads';

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Salary Summary Dashboard</h1>
              <p className="text-sm text-slate-300">Field Sales, MIS Entry, Reclassification, Tally Entry and period comparisons</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-ghost" onClick={onRefresh} disabled={loading} title="Re-scan the folder and reload the data">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              {files?.sources?.upload && files?.user?.editor && <UploadButton onUploaded={onUploaded} onError={setError} onToast={showToast} />}
              {data && <ExportMenu label="Export all" variant="btn-primary" busy={exporting === 'all'} onPick={(f) => onExport('all', f)} />}
            </div>
          </div>
          {files?.years?.length > 0 && <PeriodBar files={files} view={view} onApply={setView} busy={loading} />}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {error && <ErrorCard error={error} onDismiss={() => setError(null)} />}
        {newFound && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span>New salary sheet detected: <b>{monthLabel(newFound.year, newFound.month)}</b></span>
            <button className="btn btn-primary" onClick={() => setView({ mode: 'month', ...newFound })}>View now</button>
          </div>
        )}
        {files?.warnings?.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="mb-1 font-semibold">File-folder notices</p>
            <ul className="list-disc space-y-0.5 pl-5">{files.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading salary data...</div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-medium text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                {meta.mode === 'compare' ? `Comparison ready: ${meta.label}` : `Data loaded successfully for ${meta.label}: ${fmtInt(meta.rowsLoaded)} ${multi ? 'average monthly headcount' : 'employees'}`}
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              </span>
              <span className="text-slate-600">
                Source: <span className="font-semibold text-slate-800" title={meta.fileName}>{meta.mode === 'month' ? meta.fileName : `${meta.nMonths} salary sheet(s)`}</span> ({sourceText})
                {' '}| auto-checks for new sheets every 3 min{checkedAt ? `, last check ${checkedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>

            <ValidationPanel validation={data.validation} open={valOpen} setOpen={setValOpen} />

            {meta.mode === 'compare' ? (
              <CompareView data={data} ctx={ctx} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi label={multi ? 'Avg monthly headcount' : 'Total employees'} value={fmtInt(k.employees)} sub={multi ? `${fmtInt(k.uniqueEmployees)} unique employees` : `${fmtInt(k.fieldSalesEmployees)} in Field Sales`} />
                  <Kpi label="Total earnings CTC" value={compactInr(k.totalCtc)} sub={fullInr(k.totalCtc)} title={fullInr(k.totalCtc)} />
                  <Kpi label="Net amount payable" value={compactInr(k.totalNet)} sub={`Gross ${compactInr(k.totalGross)}`} title={fullInr(k.totalNet)} />
                  <Kpi label="Loan deductions" value={compactInr(k.totalLoan)} sub={`${fmtInt(k.loanEmployees)} employees`} title={fullInr(k.totalLoan)} />
                  <Kpi label="Departments" value={fmtInt(k.departments)} sub="Department column" />
                  <Kpi label="Segments" value={fmtInt(k.segments)} sub={multi ? `${k.nMonths} months combined` : ''} />
                  <Kpi label={multi ? 'Avg monthly CTC / employee' : 'Avg CTC / employee'} value={compactInr(k.avgCtc)} title={fullInr(k.avgCtc)} />
                  <Kpi label="Gross total" value={compactInr(k.totalGross)} title={fullInr(k.totalGross)} />
                </div>

                <Charts insights={data.insights} />

                <div>
                  <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
                    {TABS.map(([id, label]) => (
                      <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                        className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {tab === 'reclassification' && meta.mode === 'month' && (
                    <ReclassEditor data={data} canEdit={!!files?.user?.editor} onChanged={() => loadReport(view)} onError={setError} onToast={showToast} />
                  )}
                  {tab === 'reclassification' && meta.mode === 'range' && meta.nMonths > 1 && (
                    <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Manual reclassifications are edited per month. Switch to Single month to change them; saved changes are applied in this range automatically.</p>
                  )}
                  {active && <ReportView key={`${active.id}-${meta.loadedAt}`} report={active} ctx={ctx} />}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toast.type === 'ok' ? 'bg-slate-900' : 'bg-red-600'}`}>{toast.message}</div>
      )}
    </div>
  );
}
