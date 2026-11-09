import { NextResponse } from 'next/server';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let rawQuestions = defaultQuestions;

    if (isServerSupabaseConfigured && supabaseServer) {
      const { data, error } = await supabaseServer
        .from('questions')
        .select('id, question_order, difficulty, category, question_type, question_text, options')
        .order('question_order', { ascending: true });

      if (!error && data && data.length > 0) {
        rawQuestions = data as any;
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

    // Return with security headers
    return NextResponse.json(
      { questions: sanitizedQuestions },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Gagal mengambil data soal' },
      { status: 500 }
    );
  }
}
