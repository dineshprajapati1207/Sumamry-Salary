export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Matches "Oct'26", "Oct 26", "Oct_26", "October 2026", "Oct-2026" ...
const RX = /(?<![A-Za-z])(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![A-Za-z])[\s\-_.'\u2019\u2018`]*((?:19|20)\d{2}|\d{2})(?!\d)/i;

export function parseMonthYear(text) {
  if (!text) return null;
  const m = RX.exec(String(text));
  if (!m) return null;
  const month = MONTH_ABBR.findIndex((a) => a.toLowerCase() === m[1].slice(0, 3).toLowerCase()) + 1;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return month >= 1 ? { year, month } : null;
}

// "2026" or "Salary 2026" or "FY 2026" -> 2026
export function parseYearFolder(name) {
  const m = /(?<!\d)((?:19|20)\d{2})(?!\d)/.exec(String(name || ''));
  return m ? parseInt(m[1], 10) : null;
}

export const monthLabel = (year, month) => `${MONTH_ABBR[month - 1]}'${String(year).slice(-2)}`;
export const monthSlug = (year, month) => `${MONTH_ABBR[month - 1]}-${year}`;
export const periodKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
export const prevPeriod = (year, month) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
