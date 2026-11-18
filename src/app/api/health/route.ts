import { NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: 'connected' | 'not_configured' | 'error' = 'not_configured';
  let dbReason: string | undefined;

  if (isServerSupabaseConfigured && supabaseServer) {
    try {
      const { error } = await supabaseServer
        .from('exam_settings')
        .select('id')
        .limit(1);

      if (error) {
        dbStatus = 'error';
        const rawMsg = error.message || '';
        if (rawMsg.includes('<html') || rawMsg.includes('<!DOCTYPE')) {
          const titleMatch = rawMsg.match(/<title>([^<]+)<\/title>/i);
          dbReason = `HTML Error: ${titleMatch ? titleMatch[1].trim() : 'Cloudflare / Supabase server unreachable (kemungkinan project Supabase sedang Paused atau gangguan jaringan)'}`;
        } else {
          dbReason = `${error.code || 'ERR'}: ${rawMsg}`.slice(0, 160);
        }
      } else {
        dbStatus = 'connected';
      }
    } catch (err: any) {
      dbStatus = 'error';
      dbReason = (err?.message || 'Network/fetch error').slice(0, 160);
    }
  }

  return NextResponse.json(
    {
      status: 'ok',
      database: dbStatus,
      ...(dbReason ? { reason: dbReason } : {}),
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
