import { NextResponse } from 'next/server';
import { supabaseKeyProblem } from '@/lib/sources/storage';

export const dynamic = 'force-dynamic';

// Setup self-check. Disabled unless DEBUG_HEALTH=true is set in Vercel (remove it when everything works).
// Returns only yes/no flags, never secret values.
export async function GET() {
  if (process.env.DEBUG_HEALTH !== 'true') return new NextResponse('Not found', { status: 404 });
  const has = (k) => !!(process.env[k] && String(process.env[k]).trim());
  return NextResponse.json({
    DRIVE_ROOT_FOLDER_ID: has('DRIVE_ROOT_FOLDER_ID'),
    GOOGLE_SERVICE_ACCOUNT_JSON: has('GOOGLE_SERVICE_ACCOUNT_JSON'),
    SUPABASE_URL: has('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_KEY_IS_SERVICE_ROLE: has('SUPABASE_SERVICE_ROLE_KEY') ? supabaseKeyProblem() === null : false,
  });
}
