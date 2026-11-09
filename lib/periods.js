// Period maths shared by the browser and the server (pure functions).
import { monthLabel } from './period.js';

export const PERIOD_TYPES = {
  quarter: { len: 3, count: 4, label: 'Quarterly' },
  half: { len: 6, count: 2, label: 'Half-yearly' },
  year: { len: 12, count: 1, label: 'Yearly' },
};

/** First month of the "year": 4 for the financial year (Apr-Mar), 1 for the calendar year. */
export const yearStartMonth = (yearType, fiscalStart = 4) => (yearType === 'calendar' ? 1 : fiscalStart);

/** The year in which the (financial) year containing this month starts. */
export const fyOf = (year, month, S) => (month >= S ? year : year - 1);

const idxOf = (y, m) => y * 12 + (m - 1);
const fromIdx = (i) => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
export const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const parseYm = (s) => {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(s || ''));
  if (!m) return null;
  const year = +m[1];
  const month = +m[2];
  return month >= 1 && month <= 12 ? { year, month } : null;
};

/** Every month from `from` to `to`, inclusive. */
export function monthsBetween(from, to) {
  const out = [];
  for (let i = idxOf(from.year, from.month); i <= idxOf(to.year, to.month); i++) out.push(fromIdx(i));
  return out;
}

/** The months of period `index` (1-based) of financial/calendar year `fy`. */
export function periodMonths({ type, fy, index, S }) {
  const len = PERIOD_TYPES[type].len;
  const offset = type === 'year' ? 0 : (index - 1) * len;
  const start = idxOf(fy, S) + offset;
  return Array.from({ length: len }, (_, i) => fromIdx(start + i));
}

export const shiftMonths = (months, delta) => months.map((m) => fromIdx(idxOf(m.year, m.month) + delta));

/** Name a run of months such as "Q3 FY26-27 (Oct'26-Dec'26)". */
export function describePeriod(months, type, S) {
  const first = months[0];
  const last = months[months.length - 1];
  const fy = fyOf(first.year, first.month, S);
  const len = PERIOD_TYPES[type].len;
  const offset = idxOf(first.year, first.month) - idxOf(fy, S);
  const index = type === 'year' ? 1 : Math.floor(offset / len) + 1;
  const fyTxt = S === 1 ? String(fy) : `FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  const prefix = type === 'quarter' ? `Q${index} ` : type === 'half' ? `H${index} ` : '';
  const name = `${prefix}${fyTxt}`;
  return {
    fy,
    index,
    name,
    label: `${name} (${monthLabel(first.year, first.month)} to ${monthLabel(last.year, last.month)})`,
    slug: name.replace(/\s+/g, '-'),
  };
}
