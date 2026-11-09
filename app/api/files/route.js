import { NextResponse } from 'next/server';
import { listSalaryFiles } from '@/lib/sources/index';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  try {
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';
    const list = await listSalaryFiles({ refresh });
    return NextResponse.json({
      years: list.years,
      warnings: list.warnings,
      sources: list.sources,
      generatedAt: list.generatedAt,
      user: { email: null, editor: true },
    });
  } catch (e) {
    return jsonError(e);
  }
}
