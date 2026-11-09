import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isValidUuid } from '@/lib/security';
import { supabaseServer, isServerSupabaseConfigured, supabaseUrl } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';
import { ExamAnswerDetail } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const detailSessionId = url.searchParams.get('id');

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

  // 1. DETAIL EVALUASI SESI (Soal mana yang salah, jawaban karyawan, dan kunci jawaban)
  if (detailSessionId) {
    if (!isValidUuid(detailSessionId)) {
      return NextResponse.json({ error: 'ID sesi tidak valid.' }, { status: 400 });
    }

    try {
      const { data: sess, error: sErr } = await supabaseServer
        .from('exam_sessions')
        .select('*')
        .eq('id', detailSessionId)
        .single();

      if (sErr || !sess) {
        return NextResponse.json({ error: 'Sesi ujian tidak ditemukan.' }, { status: 404 });
      }

      const { data: part } = await supabaseServer
        .from('participants')
        .select('id, full_name')
        .eq('id', sess.participant_id)
        .single();

      const { data: answersData } = await supabaseServer
        .from('exam_answers')
        .select('*')
        .eq('session_id', detailSessionId);

      let qList = defaultQuestions;
      const { data: qData } = await supabaseServer
        .from('questions')
        .select('*')
        .order('question_order', { ascending: true });
      if (qData && qData.length > 0) {
        qList = qData as any;
      }

      const answerMap = new Map<number, { submitted_answer: string; is_correct: boolean }>();
      (answersData || []).forEach((a: any) => {
        answerMap.set(Number(a.question_id), {
          submitted_answer: a.submitted_answer || '',
          is_correct: Boolean(a.is_correct),
        });
      });

      const answersDetail: ExamAnswerDetail[] = qList.map((q) => {
        const recorded = answerMap.get(q.id);
        const submitted = recorded?.submitted_answer || '';
        const isCorrect = recorded ? recorded.is_correct : false;
        return {
          question_id: q.id,
          question_order: q.question_order,
          category: q.category,
          difficulty: q.difficulty,
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options || null,
          submitted_answer: submitted,
          correct_answer: q.correct_answer,
          is_correct: isCorrect,
        };
      });

      const totalCorrect = answersDetail.filter((a) => a.is_correct).length;
      const totalIncorrect = answersDetail.length - totalCorrect;
      const categoryStats: Record<string, { total: number; correct: number; incorrect: number }> = {};
      const difficultyStats: Record<string, { total: number; correct: number; incorrect: number }> = {};

      answersDetail.forEach((a) => {
        if (!categoryStats[a.category]) categoryStats[a.category] = { total: 0, correct: 0, incorrect: 0 };
        categoryStats[a.category].total++;
        if (a.is_correct) categoryStats[a.category].correct++;
        else categoryStats[a.category].incorrect++;

        if (!difficultyStats[a.difficulty]) difficultyStats[a.difficulty] = { total: 0, correct: 0, incorrect: 0 };
        difficultyStats[a.difficulty].total++;
        if (a.is_correct) difficultyStats[a.difficulty].correct++;
        else difficultyStats[a.difficulty].incorrect++;
      });

      return NextResponse.json({
        success: true,
        session: {
          id: sess.id,
          participant_name: part?.full_name || 'Peserta',
          started_at: sess.started_at,
          finished_at: sess.finished_at,
          time_limit_minutes: sess.time_limit_minutes,
          total_score: Number(sess.total_score),
          total_correct: sess.total_correct ?? totalCorrect,
          status: sess.status,
          tab_switch_count: sess.tab_switch_count || 0,
        },
        answers: answersDetail,
        summary: {
          score: Number(sess.total_score),
          total_questions: answersDetail.length,
          total_correct: sess.total_correct ?? totalCorrect,
          total_incorrect: totalIncorrect,
          category_stats: categoryStats,
          difficulty_stats: difficultyStats,
        },
      });
    } catch (err: any) {
      console.error('Error fetching session detail:', err);
      return NextResponse.json({ error: 'Gagal memuat evaluasi sesi ujian.' }, { status: 500 });
    }
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

    if (!sessionId || !isValidUuid(sessionId)) {
      return NextResponse.json({ error: 'ID sesi ujian tidak valid.' }, { status: 400 });
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

