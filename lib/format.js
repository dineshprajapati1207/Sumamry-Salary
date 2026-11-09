// Number / text formatting shared by the UI and the exporters.
export const fmtInt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: Number.isInteger(Number(n)) ? 0 : 1 });
export const fmtMoney = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (n) => `${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** `signed` shows a leading + on positive numbers (used for "Change" columns). */
export function fmtCell(type, v, signed = false) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v !== 'number') return String(v);
  let t = type === 'money' ? fmtMoney(v) : type === 'int' ? fmtInt(v) : type === 'pct' ? fmtPct(v) : String(v);
  if (signed && v > 0) t = `+${t}`;
  return t;
}

/** Compact rupee value for KPI cards: 8.48 Cr / 12.5 L / 9,500 */
export function compactInr(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e7) return `\u20B9${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `\u20B9${(v / 1e5).toFixed(2)} L`;
  return `\u20B9${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
export const fullInr = (n) => `\u20B9${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
