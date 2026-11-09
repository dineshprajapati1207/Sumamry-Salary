import * as XLSX from 'xlsx';
import { AppError } from './errors.js';
import { extractTable } from './process.js';

/** Reads .xls / .xlsx bytes and returns the raw rows of the sheet that holds the salary table. */
export function parseWorkbook(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch (e) {
    throw new AppError('BAD_FILE', 'The file could not be opened as an Excel workbook (.xls or .xlsx). It may be corrupted or password protected.', 422);
  }
  if (!wb.SheetNames.length) throw new AppError('BAD_FILE', 'The workbook has no sheets.', 422);

  let fallback = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const hit = { aoa, sheetName: name, rowOffset: range.s.r };
    if (!fallback) fallback = hit;
    if (extractTable(aoa)) return hit;
  }
  if (!fallback) throw new AppError('BAD_FILE', 'All sheets in the workbook are empty.', 422);
  return fallback; // buildDataset() will report the missing header clearly
}
