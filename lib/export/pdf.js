import { jsPDF } from 'jspdf';
import * as AutoTableModule from 'jspdf-autotable';
import { exportRows, flatTables } from './common.js';
import { fmtCell } from '../format.js';

// jspdf-autotable is CommonJS; accept either interop shape.
const autoTable = AutoTableModule.default || AutoTableModule.autoTable || AutoTableModule;
const NAVY = [31, 58, 95];
const M = 40; // page margin (pt)

export function buildPdf(reports, meta) {
  const landscape = reports.length > 0 && reports.every((r) => r.landscape);
  const orient = landscape ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation: orient, unit: 'pt', format: 'a4' });
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  reports.forEach((rep, idx) => {
    if (idx > 0) doc.addPage('a4', orient);
    let y = M;
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...NAVY);
    doc.text(rep.title, M, y);
    y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110);
    doc.text(`Source file: ${meta.fileName}   |   Generated: ${stamp} IST`, M, y);
    y += 18;
    doc.setTextColor(0);

    for (const block of flatTables(rep)) {
      const caption = block.label || block.title;
      if (y > pageH - 120) { doc.addPage('a4', orient); y = M; }
      if (caption) {
        doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0);
        doc.text(caption, M, y);
        y += 6;
      }
      const rows = exportRows(block);
      const columnStyles = {};
      block.columns.forEach((c, i) => { columnStyles[i] = { halign: c.type === 'text' ? 'left' : 'right' }; });
      autoTable(doc, {
        startY: y + 4,
        margin: { left: M, right: M, bottom: 40 },
        head: [block.columns.map((c) => c.header)],
        body: rows.map((r) => block.columns.map((c) => fmtCell(c.type, r.cells[c.key], c.signed))),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: [190, 190, 190], lineWidth: 0.4, textColor: 20 },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        columnStyles,
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const r = rows[d.row.index];
          if (!r) return;
          if (r.kind !== 'data' || r.emphasis) d.cell.styles.fontStyle = 'bold';
          if (r.kind === 'subtotal') d.cell.styles.fillColor = [232, 238, 247];
          if (r.kind === 'total') d.cell.styles.fillColor = [217, 226, 243];
          if (r.emphasis) d.cell.styles.fillColor = [255, 242, 204];
        },
      });
      y = doc.lastAutoTable.finalY + 22;
    }
  });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130);
    doc.text(`Page ${i} of ${n}`, pageW - M, pageH - 20, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}
