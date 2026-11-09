import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { jsonError } from '@/lib/http';
import { parseMonthYear, monthLabel } from '@/lib/period';
import { parseWorkbook } from '@/lib/parse';
import { buildDataset } from '@/lib/process';
import { uploadStorage } from '@/lib/sources/storage';
import { clearCaches } from '@/lib/sources/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request-body limit for functions is 4.5 MB

export async function POST(req) {
  try {

    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new AppError('NO_FILE', 'Please choose a file to upload.', 400);
    if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) throw new AppError('BAD_TYPE', 'Only .xls or .xlsx salary sheets can be uploaded.', 400);
    if (file.size > MAX_BYTES) {
      throw new AppError('TOO_LARGE', 'This file is larger than 4 MB, which is the upload limit on Vercel. Put it in the Google Drive folder instead.', 413);
    }

    const period = parseMonthYear(file.name);
    if (!period) {
      throw new AppError('BAD_NAME', 'The file name must contain the month and year, for example "Salary Sheet - Oct\'26.xls". Rename the file and upload it again.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseWorkbook(buffer);
    const built = buildDataset(parsed.aoa, { expected: period, fileName: file.name, rowOffset: parsed.rowOffset });
    if (!built.ok) {
      throw new AppError('INVALID_SHEET', 'The file was NOT uploaded because it failed validation.', 422, built.errors.map((e) => e.message));
    }
    const tp = built.dataset.titlePeriod;
    if (tp && (tp.year !== period.year || tp.month !== period.month)) {
      throw new AppError(
        'PERIOD_MISMATCH',
        `The file name says ${monthLabel(period.year, period.month)} but the sheet title says ${monthLabel(tp.year, tp.month)}. The file was NOT uploaded; please check you chose the right file.`,
        422,
      );
    }

    await uploadStorage(period.year, file.name, buffer);
    clearCaches();
    return NextResponse.json({ ok: true, year: period.year, month: period.month, rows: built.dataset.rowsRead, warnings: built.warnings.map((w) => w.message) });
  } catch (e) {
    return jsonError(e);
  }
}
