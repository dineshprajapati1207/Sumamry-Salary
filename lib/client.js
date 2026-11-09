// Browser-side helpers for talking to the API.
export class ApiError extends Error {
  constructor(message, code, details, status) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

async function toError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {}
  const e = body?.error;
  return new ApiError(e?.message || `Request failed (${res.status})`, e?.code, e?.details, res.status);
}

export async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { cache: 'no-store', ...opts });
  if (!res.ok) throw await toError(res);
  return res.json();
}

export async function downloadFile(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw await toError(res);
  const blob = await res.blob();
  const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = m ? m[1] : 'report';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

/** Query string for /api/report and /api/export for the selected view. */
export function viewQuery(v) {
  if (v.mode === 'range') return `mode=range&from=${v.from}&to=${v.to}`;
  if (v.mode === 'compare') return `mode=compare&type=${v.type}&yearType=${v.yearType}&fy=${v.fy}&index=${v.index}&basis=${v.basis}`;
  return `mode=month&year=${v.year}&month=${v.month}`;
}
