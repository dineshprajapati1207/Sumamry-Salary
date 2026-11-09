import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType,
  ShadingType, BorderStyle, Footer, PageNumber, PageOrientation,
} from 'docx';
import { exportRows, flatTables } from './common.js';
import { fmtCell } from '../format.js';

const FONT = 'Arial';
const MARGIN = 1000; // twips; A4 is 11906 x 16838
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const borders = { top: border, bottom: border, left: border, right: border };

const run = (text, o = {}) => new TextRun({ text: String(text), font: FONT, size: 18, ...o });

function cell(text, width, { bold, color, fill, align }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align, children: [run(text, { bold, color })] })],
  });
}

function buildTable(block, TOTAL_W) {
  const weights = block.columns.map((c) => (c.type === 'text' ? 2.6 : c.type === 'money' ? 1.7 : 1.1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / sum) * TOTAL_W));
  const align = (c) => (c.type === 'text' ? AlignmentType.LEFT : AlignmentType.RIGHT);

  const head = new TableRow({
    tableHeader: true,
    children: block.columns.map((c, i) => cell(c.header, widths[i], { bold: true, color: 'FFFFFF', fill: '1F3A5F', align: align(c) })),
  });
  const body = exportRows(block).map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: block.columns.map((c, i) =>
          cell(fmtCell(c.type, r.cells[c.key], c.signed), widths[i], {
            bold: r.kind !== 'data' || r.emphasis,
            fill: r.emphasis ? 'FFF2CC' : r.kind === 'total' ? 'D9E2F3' : r.kind === 'subtotal' ? 'E8EEF7' : undefined,
            align: align(c),
          }),
        ),
      }),
  );
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows: [head, ...body] });
}

export async function buildDocx(reports, meta) {
  const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const sections = reports.map((rep) => {
    const land = !!rep.landscape;
    const totalW = (land ? 16838 : 11906) - MARGIN * 2;
    const children = [
      new Paragraph({ spacing: { after: 60 }, children: [run(rep.title, { bold: true, size: 32, color: '1F3A5F' })] }),
      new Paragraph({ spacing: { after: 240 }, children: [run(`Source file: ${meta.fileName}   |   Generated: ${stamp} IST`, { size: 16, color: '666666' })] }),
    ];
    for (const block of flatTables(rep)) {
      const caption = block.label || block.title;
      if (caption) children.push(new Paragraph({ spacing: { before: 200, after: 100 }, keepNext: true, children: [run(caption, { bold: true, size: 22 })] }));
      children.push(buildTable(block, totalW));
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
    return {
      properties: { page: { size: { width: 11906, height: 16838, orientation: land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run('Page ', { size: 16, color: '888888' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '888888' })] })],
        }),
      },
      children,
    };
  });
  const doc = new Document({
    creator: 'Salary Reporting Dashboard',
    title: `Salary Reports - ${meta.label}`,
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections,
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
