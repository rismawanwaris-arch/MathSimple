import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { supabaseServer, isServerSupabaseConfigured, supabaseUrl } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check authorization
  const token = req.cookies.get('admin_session')?.value || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Akses ditolak. Silakan login sebagai HR Admin.' }, { status: 401 });
  }

  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  let keyRole = 'unknown';
  try {
    const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    const parts = rawKey.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      keyRole = payload.role || 'no-role';
    }
  } catch {}

  const debugInfo = {
    isConfigured: isServerSupabaseConfigured,
    hasUrl: Boolean(supabaseUrl),
    urlPreview: supabaseUrl || 'KOSONG',
    hasAnonKey: hasAnon,
    hasServiceRoleKey: hasService,
    keyRole,
  };

  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({
      sessions: [],
      debug: debugInfo,
      warning: 'Environment variables Supabase belum terbaca di server. Pastikan sudah klik Redeploy di Vercel.',
    });
  }

  try {
    // 1. Fetch sessions directly without risky join syntax
    const { data: rawSessions, error: sessErr } = await supabaseServer
      .from('exam_sessions')
      .select('id, participant_id, started_at, finished_at, time_limit_minutes, total_score, total_correct, status, tab_switch_count')
      .order('started_at', { ascending: false });

    if (sessErr) {
      let friendlyWarning = `Error membaca tabel exam_sessions: ${sessErr.message}`;
      if (sessErr.message.includes('relation') && sessErr.message.includes('does not exist')) {
        friendlyWarning = 'Tabel "exam_sessions" belum dibuat di database Supabase Anda. Buka menu SQL Editor di Supabase, lalu jalankan file supabase/schema.sql.';
      }
      return NextResponse.json({
        sessions: [],
        debug: { ...debugInfo, error: sessErr.message },
        warning: friendlyWarning,
      });
    }

    const sessionsList = rawSessions || [];

    // 2. Fetch participant names in a separate simple query to avoid schema-cache join errors
    const participantIds = Array.from(new Set(sessionsList.map((s: any) => s.participant_id).filter(Boolean)));
    const participantMap: Record<string, string> = {};

    if (participantIds.length > 0) {
      const { data: pData } = await supabaseServer
        .from('participants')
        .select('id, full_name')
        .in('id', participantIds);

      (pData || []).forEach((p: any) => {
        participantMap[p.id] = p.full_name;
      });
    }

    const formatted = sessionsList.map((s: any) => ({
      id: s.id,
      participant_name: participantMap[s.participant_id] || 'Peserta',
      started_at: s.started_at,
      finished_at: s.finished_at,
      time_limit_minutes: s.time_limit_minutes,
      total_score: Number(s.total_score),
      total_correct: s.total_correct,
      status: s.status,
      tab_switch_count: s.tab_switch_count || 0,
    }));

    return NextResponse.json({
      sessions: formatted,
      debug: debugInfo,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        sessions: [],
        debug: { ...debugInfo, exception: err.message },
        warning: 'Gagal mengambil data dari database Supabase.',
      },
      { status: 500 }
    );
  }
}
