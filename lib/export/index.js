import { buildXlsx } from './xlsx.js';
import { buildDocx } from './docx.js';
import { buildPdf } from './pdf.js';
import { fileName } from './common.js';
import { AppError } from '../errors.js';

const TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/** which = 'fieldSales' | 'misEntry' | 'reclassification' | 'tallyEntry' | 'all' */
export async function exportBundle(bundle, which, format) {
  if (!TYPES[format]) throw new AppError('BAD_FORMAT', 'Format must be xlsx, docx or pdf.', 400);
  const reports = which === 'all' ? bundle.reports : bundle.reports.filter((r) => r.id === which);
  if (!reports.length) throw new AppError('BAD_REPORT', 'Unknown report.', 400);

  const meta = { label: bundle.meta.label, fileName: bundle.meta.fileName };
  let buffer;
  if (format === 'xlsx') buffer = await buildXlsx(reports, meta);
  else if (format === 'docx') buffer = await buildDocx(reports, meta);
  else buffer = buildPdf(reports, meta);

  return { buffer, contentType: TYPES[format], filename: fileName(reports.length === 1 ? reports[0].id : 'all', bundle.meta.slug, format) };
}
