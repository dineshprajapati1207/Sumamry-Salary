import { NextResponse } from 'next/server';
import { loadView } from '@/lib/service';
import { jsonError, parseView } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/report?mode=month&year=2026&month=10
//     /api/report?mode=range&from=2026-04&to=2026-10
//     /api/report?mode=compare&type=quarter&yearType=fy&fy=2026&index=3&basis=prev
export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const bundle = await loadView(parseView(sp), { refresh: sp.get('refresh') === '1' });
    return NextResponse.json(bundle, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}
