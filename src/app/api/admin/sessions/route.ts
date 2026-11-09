import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { supabaseServer, isServerSupabaseConfigured, supabaseUrl } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const debugInfo = {
    isConfigured: isServerSupabaseConfigured,
    hasUrl: Boolean(supabaseUrl),
    urlPreview: supabaseUrl ? 'OK' : 'KOSONG',
    hasAnonKey: hasAnon,
    hasServiceRoleKey: hasService,
  };

  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({
      sessions: [],
      debug: debugInfo,
      warning: 'Environment variables Supabase belum terbaca di server. Pastikan sudah klik Redeploy di Vercel.',
    });
  }

  try {
    // Check participants table directly
    const { data: allParticipants, error: partErr } = await supabaseServer
      .from('participants')
      .select('id, full_name, created_at');

    // Fetch sessions directly
    const { data: rawSessions, error: sessErr } = await supabaseServer
      .from('exam_sessions')
      .select('*')
      .order('started_at', { ascending: false });

    if (sessErr) {
      let friendlyWarning = 'Gagal membaca tabel exam_sessions. Pastikan skema database sudah dijalankan dan SUPABASE_SERVICE_ROLE_KEY benar.';
      if (sessErr.message.includes('relation') && sessErr.message.includes('does not exist')) {
        friendlyWarning = 'Tabel "exam_sessions" belum dibuat di database Supabase Anda. Buka menu SQL Editor di Supabase, lalu jalankan file supabase/schema.sql.';
      }
      return NextResponse.json({
        sessions: [],
        debug: {
          ...debugInfo,
          partCount: allParticipants ? allParticipants.length : 0,
        },
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
      debug: {
        ...debugInfo,
        rawSessionsLength: rawSessions ? rawSessions.length : 0,
        partCount: allParticipants ? allParticipants.length : 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        sessions: [],
        debug: debugInfo,
        warning: 'Gagal mengambil data dari database Supabase.',
      },
      { status: 500 }
    );
  }
}

// DELETE: Hapus data sesi ujian (bisa spesifik ID atau semua data)
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ error: 'Supabase belum terkonfigurasi di server.' }, { status: 500 });
  }

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('id');
    const deleteAll = url.searchParams.get('all') === 'true';

    if (deleteAll) {
      // 1. Hapus seluruh jawaban
      await supabaseServer.from('exam_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // 2. Hapus seluruh sesi
      await supabaseServer.from('exam_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // 3. Hapus seluruh peserta
      await supabaseServer.from('participants').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      return NextResponse.json({ success: true, message: 'Seluruh data hasil ujian berhasil dihapus.' });
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'ID sesi ujian harus disertakan.' }, { status: 400 });
    }

    // Ambil participant_id untuk membersihkan data peserta juga
    const { data: sessData } = await supabaseServer
      .from('exam_sessions')
      .select('participant_id')
      .eq('id', sessionId)
      .single();

    // Hapus sesi (exam_answers otomatis terhapus karena foreign key CASCADE)
    const { error: delErr } = await supabaseServer
      .from('exam_sessions')
      .delete()
      .eq('id', sessionId);

    if (delErr) {
      return NextResponse.json({ error: 'Gagal menghapus sesi.' }, { status: 500 });
    }

    // Hapus record peserta jika ada
    if (sessData?.participant_id) {
      await supabaseServer
        .from('participants')
        .delete()
        .eq('id', sessData.participant_id);
    }

    return NextResponse.json({ success: true, message: 'Data hasil ujian peserta berhasil dihapus.' });
  } catch (err: any) {
    console.error('Error in DELETE /api/admin/sessions:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem saat menghapus data.' }, { status: 500 });
  }
}

