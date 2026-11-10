import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';
import { generateExamToken, EXAM_TOKEN_MAX_AGE_SECONDS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const isDeviceLocked = Boolean(req.cookies.get('exam_submitted_lock')?.value);
    let rawQuestions = defaultQuestions;
    let settings = { duration_minutes: 15, autosubmit: true, warning_minutes: 2 };

    if (isServerSupabaseConfigured && supabaseServer) {
      const [{ data, error }, { data: sData }] = await Promise.all([
        supabaseServer
          .from('questions')
          .select('id, question_order, difficulty, category, question_type, question_text, options')
          .order('question_order', { ascending: true }),
        supabaseServer
          .from('exam_settings')
          .select('duration_minutes, autosubmit, warning_minutes')
          .eq('id', 1)
          .single(),
      ]);

      if (!error && data && data.length > 0) {
        // Auto-migrasi jika database masih berisi bank soal lama (belum berisi soal konter pulsa / tarik tunai)
        const hasKonterQuestions = data.some((q: any) =>
          q.question_text?.toLowerCase().includes('tarik tunai') ||
          q.question_text?.toLowerCase().includes('pulsa')
        );

        if (!hasKonterQuestions) {
          try {
            await supabaseServer.from('questions').upsert(defaultQuestions);
            rawQuestions = defaultQuestions;
          } catch {
            rawQuestions = data as any;
          }
        } else {
          rawQuestions = data as any;
        }
      } else if (!error && (!data || data.length === 0)) {
        try {
          await supabaseServer.from('questions').upsert(defaultQuestions);
        } catch {
          // Fallback lokal
        }
      }
      if (sData) {
        settings = {
          duration_minutes: sData.duration_minutes || 15,
          autosubmit: sData.autosubmit ?? true,
          warning_minutes: sData.warning_minutes || 2,
        };
      }
    }

    // SANITIZATION: Strip out any sensitive fields (correct_answer, points, etc.)
    const sanitizedQuestions = rawQuestions.map((q) => ({
      id: q.id,
      question_order: q.question_order,
      difficulty: q.difficulty,
      category: q.category,
      question_type: q.question_type,
      question_text: q.question_text,
      options: q.options || null,
    }));

    const examToken = generateExamToken(Date.now());

    const res = NextResponse.json(
      { questions: sanitizedQuestions, settings, examToken, isDeviceLocked },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
    res.cookies.set('exam_ticket', examToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: EXAM_TOKEN_MAX_AGE_SECONDS,
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: 'Gagal mengambil data soal' },
      { status: 500 }
    );
  }
}

// POST: Terbitkan tiket waktu mulai ujian resmi dari jam server saat peserta klik "Mulai Ujian"
export async function POST(req: NextRequest) {
  // 1. Cek apakah perangkat sudah terkunci karena pernah submit
  if (req.cookies.get('exam_submitted_lock')?.value) {
    return NextResponse.json(
      { error: 'Ujian pada perangkat ini telah selesai dikirimkan dan tidak dapat diakses kembali.' },
      { status: 403 }
    );
  }

  // 2. Cek apakah nama peserta sudah pernah menyelesaikan ujian di Supabase
  let candidateName = '';
  try {
    const rawBody = await req.text();
    if (rawBody) {
      const parsed = JSON.parse(rawBody);
      if (parsed?.fullName && typeof parsed.fullName === 'string') {
        candidateName = parsed.fullName
          .trim()
          .slice(0, 100)
          .replace(/[<>"'`\\\r\n\t]/g, '')
          .replace(/^[=+\-@]+/, '')
          .trim();
      }
    }
  } catch {
    // Body opsional
  }

  if (candidateName && isServerSupabaseConfigured && supabaseServer) {
    try {
      const { data: pCheck } = await supabaseServer
        .from('participants')
        .select('id, full_name, exam_sessions(id, status)')
        .ilike('full_name', candidateName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pCheck && pCheck.exam_sessions?.some((s: any) => s.status === 'completed' || s.status === 'timed_out')) {
        return NextResponse.json(
          {
            error: `Peserta atas nama "${candidateName}" sudah pernah menyelesaikan dan mengirimkan ujian. Akses ujian ulang ditolak demi integritas penilaian.`,
            isAlreadySubmitted: true,
          },
          { status: 403 }
        );
      }
    } catch (checkErr) {
      console.warn('Gagal cek nama peserta di Supabase:', checkErr);
    }
  }

  const startedAtMs = Date.now();
  const examToken = generateExamToken(startedAtMs);
  const res = NextResponse.json(
    { examToken, startedAt: new Date(startedAtMs).toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  res.cookies.set('exam_ticket', examToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: EXAM_TOKEN_MAX_AGE_SECONDS,
    path: '/',
  });
  return res;
}

