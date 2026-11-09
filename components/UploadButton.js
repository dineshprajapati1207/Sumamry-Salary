'use client';
import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/client';

export default function UploadButton({ onUploaded, onError, onToast }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/upload', { method: 'POST', body: fd });
      onToast(`Uploaded "${file.name}" (${res.rows} employees validated).`);
      await onUploaded(res);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept=".xls,.xlsx,.xlsm" className="hidden" onChange={pick} />
      <button className="btn btn-ghost" onClick={() => ref.current?.click()} disabled={busy} title="Upload a monthly salary sheet">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload sheet
      </button>
    </>
  );
}
