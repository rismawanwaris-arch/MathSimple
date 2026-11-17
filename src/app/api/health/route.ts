import { NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: 'connected' | 'not_configured' | 'error' = 'not_configured';

  if (isServerSupabaseConfigured && supabaseServer) {
    try {
      const { error } = await supabaseServer
        .from('exam_settings')
        .select('id')
        .limit(1);

      dbStatus = error ? 'error' : 'connected';
    } catch {
      dbStatus = 'error';
    }
  }

  return NextResponse.json(
    {
      status: 'ok',
      database: dbStatus,
      timestamp,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
