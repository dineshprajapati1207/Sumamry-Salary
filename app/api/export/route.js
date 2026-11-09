import { loadView } from '@/lib/service';
import { exportBundle } from '@/lib/export/index';
import { jsonError, parseView } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Same view parameters as /api/report, plus: report=fieldSales|misEntry|reclassification|tallyEntry|comparison|all  format=xlsx|docx|pdf
export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const bundle = await loadView(parseView(sp), { compare: true });
    const { buffer, contentType, filename } = await exportBundle(bundle, sp.get('report') || 'all', sp.get('format') || 'xlsx');
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
