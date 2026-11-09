import { NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';
import { generateExamToken, EXAM_TOKEN_MAX_AGE_SECONDS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
        rawQuestions = data as any;
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
      { questions: sanitizedQuestions, settings, examToken },
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
export async function POST() {
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

