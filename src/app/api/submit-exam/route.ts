import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';
import { getClientIp, rateLimit, tooManyRequests } from '@/lib/security';
import { verifyExamToken, isExamNonceUsed, markExamNonceUsed } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const RL_SUBMIT_COOKIE = 'rl_submit';

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
    // Rate limit hybrid (IP + signed cookie): maks 10 pengiriman / 10 menit
    const rl = rateLimit(`submit:${getClientIp(req)}`, 10, 10 * 60 * 1000, req, RL_SUBMIT_COOKIE);
    if (!rl.ok) return tooManyRequests(rl.retryAfter, RL_SUBMIT_COOKIE, rl.cookieValue);

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
    const { fullName, startedAt, examToken: bodyExamToken } = body || {};
    const tabSwitchCount = Math.min(Math.max(Number(body?.tabSwitchCount) || 0, 0), 1000);

    // Sanitasi map jawaban: hanya key angka & value string pendek
    const answers: Record<number, string> = {};
    if (body?.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
      for (const [k, v] of Object.entries(body.answers).slice(0, 200)) {
        const id = Number(k);
        if (Number.isInteger(id) && typeof v === 'string') answers[id] = v.slice(0, 300);
      }
    }

    // 1. Sanitize & Validate Participant Name (termasuk anti-CSV Formula Injection)
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      return NextResponse.json({ error: 'Nama peserta wajib diisi.' }, { status: 400 });
    }
    const sanitizedName = fullName
      .trim()
      .slice(0, 100)
      .replace(/[<>"'`\\\r\n\t]/g, '')
      .replace(/^[=+\-@]+/, '')
      .trim();
    if (!sanitizedName) {
      return NextResponse.json({ error: 'Nama peserta tidak valid.' }, { status: 400 });
    }

    // 1b. Cek Kunci Perangkat: jika perangkat sudah pernah kirim ujian, tolak pengiriman ulang
    if (req.cookies.get('exam_submitted_lock')?.value) {
      return NextResponse.json(
        { error: 'Ujian pada perangkat ini sudah pernah dikirimkan sebelumnya dan telah terkunci.' },
        { status: 409 }
      );
    }

    // 1c. Cek Duplikasi Nama Peserta di Database: cegah pengiriman ulang atas nama yang sama
    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        const { data: existingP } = await supabaseServer
          .from('participants')
          .select('id, full_name, exam_sessions(id, status)')
          .ilike('full_name', sanitizedName)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingP && existingP.exam_sessions?.some((s: any) => s.status === 'completed' || s.status === 'timed_out')) {
          return NextResponse.json(
            { error: `Peserta atas nama "${sanitizedName}" sudah pernah menyelesaikan dan mengirimkan ujian. Pengiriman ulang ditolak demi integritas penilaian.` },
            { status: 409 }
          );
        }
      } catch (chkErr) {
        console.warn('Gagal cek status duplikasi peserta:', chkErr);
      }
    }

    // 2. Verifikasi Token Waktu Mulai Ujian dari Server (anti-manipulasi startedAt & anti-replay)
    const cookieTicket = req.cookies.get('exam_ticket')?.value;
    const verifiedCookie = verifyExamToken(cookieTicket);
    const verifiedBody = verifyExamToken(bodyExamToken);
    const verifiedTicket = verifiedBody.valid ? verifiedBody : verifiedCookie;

    if (verifiedTicket.valid && isExamNonceUsed(verifiedTicket.nonce)) {
      return NextResponse.json(
        { error: 'Sesi ujian ini sudah pernah dikirimkan sebelumnya.' },
        { status: 409 }
      );
    }

    // 3. Fetch Authoritative Questions with Correct Answers on Server
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
          const hasKonter = qData.some((q: any) =>
            q.question_text?.toLowerCase().includes('tarik tunai') ||
            q.question_text?.toLowerCase().includes('pulsa')
          );
          if (hasKonter) {
            authoritativeQuestions = qData;
          } else {
            authoritativeQuestions = defaultQuestions;
            try {
              await supabaseServer.from('questions').upsert(defaultQuestions);
            } catch {
              // Abaikan
            }
          }
        } else {
          authoritativeQuestions = defaultQuestions;
        }
      } catch (e) {
        console.warn('Gagal membaca bank soal dari Supabase, menggunakan default lokal:', e);
      }
    }

    // 4. Server-Side Timer & Anti-Tamper Check (prioritaskan timestamp bertanda tangan server)
    const nowMs = Date.now();
    let startTimeMs = verifiedTicket.valid ? verifiedTicket.startedAtMs : new Date(startedAt || nowMs).getTime();
    if (!Number.isFinite(startTimeMs) || startTimeMs <= 0 || startTimeMs > nowMs) {
      startTimeMs = nowMs;
    }
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - startTimeMs) / 1000));
    const maxAllowedSeconds = allowedDurationMinutes * 60 + 120;
    const isLate = elapsedSeconds > maxAllowedSeconds;

    if (verifiedTicket.valid) {
      markExamNonceUsed(verifiedTicket.nonce);
    }

    // 5. Server-Side Grading
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

    // 6. Save Securely to Supabase
    if (isServerSupabaseConfigured && supabaseServer) {
      try {
        const { data: pData, error: pErr } = await supabaseServer
          .from('participants')
          .insert({ full_name: sanitizedName })
          .select('id')
          .single();

        if (pErr) {
          dbErrorMsg = 'Gagal menyimpan data peserta ke database.';
          console.error('Error insert participants:', pErr);
        } else if (pData) {
          const { data: sData, error: sErr } = await supabaseServer
            .from('exam_sessions')
            .insert({
              participant_id: pData.id,
              started_at: new Date(startTimeMs).toISOString(),
              time_limit_minutes: allowedDurationMinutes,
              total_score: totalScore,
              total_correct: correctCount,
              status: isLate ? 'timed_out' : 'completed',
              tab_switch_count: tabSwitchCount,
              finished_at: new Date(nowMs).toISOString(),
            })
            .select('id')
            .single();

          if (sErr) {
            dbErrorMsg = 'Gagal menyimpan sesi ujian ke database.';
            console.error('Error insert exam_sessions:', sErr);
          } else if (sData) {
            dbSaved = true;

            // Pastikan bank soal di database sudah terisi agar foreign key exam_answers(question_id) terpenuhi
            try {
              const { count: qCount } = await supabaseServer
                .from('questions')
                .select('id', { count: 'exact', head: true });
              if (!qCount || qCount === 0) {
                await supabaseServer.from('questions').upsert(defaultQuestions);
              }
            } catch {
              // Abaikan jika tabel questions sudah ada
            }

            const answerRows = answerBreakdown.map((a) => ({
              session_id: sData.id,
              question_id: a.question_id,
              submitted_answer: a.submitted_answer,
              is_correct: a.is_correct,
            }));
            const { error: ansErr } = await supabaseServer.from('exam_answers').insert(answerRows);
            if (ansErr) {
              console.error('Error insert exam_answers:', ansErr);
            }
          }
        }
      } catch (dbErr: any) {
        dbErrorMsg = 'Terjadi kesalahan database.';
        console.error('Error inserting into Supabase:', dbErr);
      }
    } else {
      dbErrorMsg = 'Database belum terhubung.';
    }

    // Bangun rincian evaluasi lengkap agar peserta / penguji bisa langsung melihat mana yang salah
    const richAnswers = authoritativeQuestions.map((q) => {
      const submitted = (userAnswersMap[q.id] || '').trim();
      const normSubmitted = normalizeAnswer(submitted);
      const normCorrect = normalizeAnswer(q.correct_answer);
      const isCorrect = normSubmitted !== '' && normSubmitted === normCorrect;
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

    const categoryStats: Record<string, { total: number; correct: number; incorrect: number }> = {};
    richAnswers.forEach((a) => {
      if (!categoryStats[a.category]) categoryStats[a.category] = { total: 0, correct: 0, incorrect: 0 };
      categoryStats[a.category].total++;
      if (a.is_correct) categoryStats[a.category].correct++;
      else categoryStats[a.category].incorrect++;
    });

    const res = NextResponse.json(
      {
        success: true,
        referenceCode,
        participantName: sanitizedName,
        submittedAt: new Date(nowMs).toISOString(),
        durationMinutes: allowedDurationMinutes,
        savedToSupabase: dbSaved,
        dbWarning: dbErrorMsg,
        message: 'Terima kasih telah menyelesaikan ujian. Jawaban Anda telah berhasil diserahkan.',
        score: totalScore,
        totalQuestions,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
    // Hapus tiket ujian agar tidak bisa dipakai ulang
    res.cookies.set('exam_ticket', '', { httpOnly: true, maxAge: 0, path: '/' });
    // Pasang cookie pengunci perangkat (30 hari)
    res.cookies.set('exam_submitted_lock', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });
    if (rl.cookieValue && rl.maxAgeSec) {
      res.cookies.set(RL_SUBMIT_COOKIE, rl.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: rl.maxAgeSec,
        path: '/',
      });
    }
    return res;
  } catch (error: any) {
    console.error('Error in /api/submit-exam:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat memproses jawaban ujian.' },
      { status: 500 }
    );
  }
}

