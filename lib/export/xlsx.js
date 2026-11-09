import ExcelJS from 'exceljs';
import { exportRows } from './common.js';
import { fmtCell } from '../format.js';

const FONT = { name: 'Arial', size: 10 };
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const numFmt = (col, v) => {
  const sg = !!col.signed;
  if (col.type === 'pct') return sg ? '+0.0"%";-0.0"%";0.0"%"' : '0.0"%"';
  if (col.type === 'money') return sg ? '+#,##0.00;-#,##0.00;0.00' : '#,##0.00';
  if (Number.isInteger(v)) return sg ? '+#,##0;-#,##0;0' : '#,##0';
  return sg ? '+#,##0.0;-#,##0.0;0.0' : '#,##0.0';
};

function writeTable(ws, block, r0, c0, widths, fixed) {
  const cols = block.columns;
  let r = r0;

  if (block.title) {
    ws.mergeCells(r, c0, r, c0 + cols.length - 1);
    const t = ws.getCell(r, c0);
    t.value = block.title;
    t.font = { ...FONT, size: 11, bold: true };
    t.alignment = { horizontal: 'left', vertical: 'middle' };
    t.fill = fill('FFEAF0F8');
    for (let i = 0; i < cols.length; i++) ws.getCell(r, c0 + i).border = BORDER;
    ws.getRow(r).height = 20;
    r += 1;
  }

  cols.forEach((col, i) => {
    const c = ws.getCell(r, c0 + i);
    c.value = col.header;
    c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill('FF1F3A5F');
    c.alignment = { horizontal: col.type === 'text' ? 'left' : 'right', vertical: 'middle', wrapText: true };
    c.border = BORDER;
    widths[c0 + i] = Math.max(widths[c0 + i] || 0, col.header.length);
  });
  ws.getRow(r).height = 22;
  r += 1;

  for (const row of exportRows(block)) {
    cols.forEach((col, i) => {
      const c = ws.getCell(r, c0 + i);
      const v = row.cells[col.key];
      const isNum = typeof v === 'number' && col.type !== 'text';
      if (isNum) {
        c.value = v;
        c.numFmt = numFmt(col, v);
        c.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        c.value = v === '' || v === undefined || v === null ? null : String(v);
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 0 };
      }
      c.font = { ...FONT, bold: row.kind !== 'data' || row.emphasis };
      c.border = BORDER;
      if (row.kind === 'subtotal') c.fill = fill('FFE8EEF7');
      if (row.kind === 'total') {
        c.fill = fill('FFD9E2F3');
        c.border = { ...BORDER, top: { style: 'medium', color: { argb: 'FF1F3A5F' } } };
      }
      if (row.emphasis) c.fill = fill('FFFFF2CC');
      widths[c0 + i] = Math.max(widths[c0 + i] || 0, String(fmtCell(col.type, v, col.signed)).length);
    });
    r += 1;
  }
  return r;
}

export async function buildXlsx(reports, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Salary Reporting Dashboard';
  wb.created = new Date();
  wb.title = `Salary Reports - ${meta.label}`;

  for (const rep of reports) {
    const name = rep.sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    const wide = !!rep.landscape || rep.blocks.some((b) => b.type === 'panels');
    const ws = wb.addWorksheet(name, {
      pageSetup: { orientation: wide ? 'landscape' : 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      properties: { defaultRowHeight: 16 },
    });
    const widths = {};
    const fixed = new Set();
    let r = 1;
    for (const block of rep.blocks) {
      if (block.type === 'panels') {
        let c = 1;
        let maxR = r;
        for (const p of block.panels) {
          maxR = Math.max(maxR, writeTable(ws, p, r, c, widths, fixed));
          c += p.columns.length;
          fixed.add(c);
          widths[c] = 1;
          c += 1; // spacer column between panels
        }
        r = maxR + 1;
      } else {
        r = writeTable(ws, block, r, 1, widths, fixed) + 1;
      }
    }
    Object.entries(widths).forEach(([col, w]) => {
      const c = Number(col);
      ws.getColumn(c).width = fixed.has(c) ? 3 : Math.min(Math.max(w + 4, 11), 55);
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
