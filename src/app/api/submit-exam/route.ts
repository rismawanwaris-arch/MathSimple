import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';
import { getClientIp, rateLimit, tooManyRequests } from '@/lib/security';

export const dynamic = 'force-dynamic';

function normalizeAnswer(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^rp\s*/i, 'rp ')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: maks 10 pengiriman / 10 menit per IP (kantor berbagi IP tetap aman)
    const rl = rateLimit(`submit:${getClientIp(req)}`, 10, 10 * 60 * 1000);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);

    // Batasi ukuran body (anti-DoS)
    const rawBody = await req.text();
    if (rawBody.length > 50_000) {
      return NextResponse.json({ error: 'Permintaan terlalu besar.' }, { status: 413 });
    }
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }
    const { fullName, startedAt } = body || {};
    const tabSwitchCount = Math.min(Math.max(Number(body?.tabSwitchCount) || 0, 0), 1000);

    // Sanitasi map jawaban: hanya key angka & value string pendek
    const answers: Record<number, string> = {};
    if (body?.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
      for (const [k, v] of Object.entries(body.answers).slice(0, 200)) {
        const id = Number(k);
        if (Number.isInteger(id) && typeof v === 'string') answers[id] = v.slice(0, 300);
      }
    }

    // 1. Sanitize & Validate Participant Name
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      return NextResponse.json({ error: 'Nama peserta wajib diisi.' }, { status: 400 });
    }
    const sanitizedName = fullName.trim().slice(0, 100).replace(/[<>"'`\\]/g, '');
    if (!sanitizedName) {
      return NextResponse.json({ error: 'Nama peserta tidak valid.' }, { status: 400 });
    }

    // 2. Fetch Authoritative Questions with Correct Answers on Server
    let authoritativeQuestions = defaultQuestions;
    let allowedDurationMinutes = 15;

    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        const { data: sData } = await supabaseServer
          .from('exam_settings')
          .select('duration_minutes')
          .eq('id', 1)
          .single();
        if (sData?.duration_minutes) {
          allowedDurationMinutes = sData.duration_minutes;
        }

        const { data: qData, error: qErr } = await supabaseServer
          .from('questions')
          .select('*')
          .order('question_order', { ascending: true });

        if (!qErr && qData && qData.length > 0) {
          authoritativeQuestions = qData;
        }
      } catch (e) {
        console.warn('Gagal membaca bank soal dari Supabase, menggunakan default lokal:', e);
      }
    }

    // 3. Server-Side Timer & Anti-Tamper Check
    const startTimeMs = new Date(startedAt || Date.now()).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - startTimeMs) / 1000));
    const maxAllowedSeconds = (allowedDurationMinutes * 60) + 120;
    const isLate = elapsedSeconds > maxAllowedSeconds;

    // 4. Server-Side Grading
    let correctCount = 0;
    const userAnswersMap: Record<number, string> = answers;
    const answerBreakdown: Array<{
      question_id: number;
      submitted_answer: string;
      is_correct: boolean;
    }> = [];

    authoritativeQuestions.forEach((q) => {
      const submitted = (userAnswersMap[q.id] || '').trim();
      const normSubmitted = normalizeAnswer(submitted);
      const normCorrect = normalizeAnswer(q.correct_answer);

      const isCorrect = normSubmitted !== '' && normSubmitted === normCorrect;
      if (isCorrect) correctCount++;

      answerBreakdown.push({
        question_id: q.id,
        submitted_answer: submitted,
        is_correct: isCorrect,
      });
    });

    const totalQuestions = authoritativeQuestions.length || 30;
    const totalScore = Number(((correctCount / totalQuestions) * 100).toFixed(1));
    const referenceCode = `SUBMIT-${Math.floor(1000 + Math.random() * 9000)}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

    let dbSaved = false;
    let dbErrorMsg: string | null = null;

    // 5. Save Securely to Supabase
    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        // Insert participant
        const { data: pData, error: pErr } = await supabaseServer
          .from('participants')
          .insert({ full_name: sanitizedName })
          .select('id')
          .single();

        if (pErr) {
          dbErrorMsg = 'Gagal menyimpan data peserta ke database.';
          console.error('Error insert participants:', pErr);
        } else if (pData) {
          // Insert exam session
          const { data: sData, error: sErr } = await supabaseServer
            .from('exam_sessions')
            .insert({
              participant_id: pData.id,
              time_limit_minutes: allowedDurationMinutes,
              total_score: totalScore,
              total_correct: correctCount,
              status: isLate ? 'timed_out' : 'completed',
              tab_switch_count: tabSwitchCount,
              finished_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (sErr) {
            dbErrorMsg = 'Gagal menyimpan sesi ujian ke database.';
            console.error('Error insert exam_sessions:', sErr);
          } else if (sData) {
            dbSaved = true;
            // Insert answer details
            const answerRows = answerBreakdown.map((a) => ({
              session_id: sData.id,
              question_id: a.question_id,
              submitted_answer: a.submitted_answer,
              is_correct: a.is_correct,
            }));
            await supabaseServer.from('exam_answers').insert(answerRows);
          }
        }
      } catch (dbErr: any) {
        dbErrorMsg = 'Terjadi kesalahan database.';
        console.error('Error inserting into Supabase:', dbErr);
      }
    } else {
      dbErrorMsg = 'Database belum terhubung.';
    }

    return NextResponse.json(
      {
        success: true,
        referenceCode,
        participantName: sanitizedName,
        submittedAt: new Date().toISOString(),
        durationMinutes: allowedDurationMinutes,
        savedToSupabase: dbSaved,
        dbWarning: dbErrorMsg,
        message: 'Jawaban ujian telah berhasil diserahkan.',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: any) {
    console.error('Error in /api/submit-exam:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat memproses jawaban ujian.' },
      { status: 500 }
    );
  }
}
