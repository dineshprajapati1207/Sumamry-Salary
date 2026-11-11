import { NextResponse } from 'next/server';
import { supabaseKeyProblem, supabaseUrl, supabaseUrlProblem } from '@/lib/sources/storage';
import { serviceAccountInfo } from '@/lib/sources/drive';

export const dynamic = 'force-dynamic';

// Setup self-check. Disabled unless DEBUG_HEALTH=true is set in Vercel (remove it when everything works).
// Returns only yes/no flags, never secret values.
export async function GET() {
  if (process.env.DEBUG_HEALTH !== 'true') return new NextResponse('Not found', { status: 404 });
  const has = (k) => !!(process.env[k] && String(process.env[k]).trim());
  let drive = { GOOGLE_SERVICE_ACCOUNT_JSON_valid: false, shareTheDriveFolderWith: null, problem: null };
  if (has('GOOGLE_SERVICE_ACCOUNT_JSON')) {
    try {
      drive = { GOOGLE_SERVICE_ACCOUNT_JSON_valid: true, shareTheDriveFolderWith: serviceAccountInfo().client_email, problem: null };
    } catch (e) {
      drive.problem = e.message;
    }
  }
  const supa = { SUPABASE_URL_used: null, SUPABASE_URL_problem: null, SUPABASE_reachable: null };
  if (has('SUPABASE_URL')) {
    supa.SUPABASE_URL_used = supabaseUrl();
    supa.SUPABASE_URL_problem = supabaseUrlProblem();
    try {
      const r = await fetch(`${supa.SUPABASE_URL_used}/rest/v1/`, { signal: AbortSignal.timeout(6000) });
      supa.SUPABASE_reachable = `yes (HTTP ${r.status})`;
    } catch (e) {
      supa.SUPABASE_reachable = `NO: ${e?.cause?.code || e?.message || 'connection failed'}. Check the URL and whether the project is paused.`;
    }
  }
  return NextResponse.json({
    ...drive,
    ...supa,
    DRIVE_ROOT_FOLDER_ID: has('DRIVE_ROOT_FOLDER_ID'),
    GOOGLE_SERVICE_ACCOUNT_JSON: has('GOOGLE_SERVICE_ACCOUNT_JSON'),
    SUPABASE_URL: has('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_KEY_IS_SERVICE_ROLE: has('SUPABASE_SERVICE_ROLE_KEY') ? supabaseKeyProblem() === null : false,
  });
}
