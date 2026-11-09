import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check authorization
  const token = req.cookies.get('admin_session')?.value || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Akses ditolak. Silakan login sebagai HR Admin.' }, { status: 401 });
  }

  try {
    if (!isServerSupabaseConfigured || !supabaseServer) {
      return NextResponse.json({ sessions: [] });
    }

    const { data, error } = await supabaseServer
      .from('exam_sessions')
      .select('id, started_at, finished_at, time_limit_minutes, total_score, total_correct, status, tab_switch_count, participants(full_name)')
      .order('started_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (data || []).map((s: any) => ({
      id: s.id,
      participant_name: s.participants?.full_name || 'Peserta',
      started_at: s.started_at,
      finished_at: s.finished_at,
      time_limit_minutes: s.time_limit_minutes,
      total_score: Number(s.total_score),
      total_correct: s.total_correct,
      status: s.status,
      tab_switch_count: s.tab_switch_count || 0,
    }));

    return NextResponse.json({ sessions: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: 'Gagal mengambil data sesi ujian' }, { status: 500 });
  }
}
