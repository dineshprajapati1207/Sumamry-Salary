'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown, Loader2 } from 'lucide-react';

const ITEMS = [
  ['xlsx', 'Excel (.xlsx)'],
  ['docx', 'Word (.docx)'],
  ['pdf', 'PDF (.pdf)'],
];

export default function ExportMenu({ label = 'Export', onPick, busy, variant = 'btn-light' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className={`btn ${variant}`} onClick={() => setOpen((o) => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg" role="menu">
          {ITEMS.map(([fmt, text]) => (
            <button key={fmt} role="menuitem" className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setOpen(false); onPick(fmt); }}>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
