import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';

export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get('admin_session')?.value || req.headers.get('Authorization')?.replace('Bearer ', '');
  return verifyAdminToken(token);
}

// GET full questions (WITH correct answers, admin only)
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 401 });
  }

  try {
    if (isServerSupabaseConfigured && supabaseServer) {
      const { data, error } = await supabaseServer
        .from('questions')
        .select('*')
        .order('question_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return NextResponse.json({ questions: data });
      }
    }

    return NextResponse.json({ questions: defaultQuestions });
  } catch (err: any) {
    return NextResponse.json({ error: 'Gagal mengambil data soal' }, { status: 500 });
  }
}

// POST: Add new question or batch import
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { questions: batchQuestions, question } = body;

    if (!isServerSupabaseConfigured || !supabaseServer) {
      return NextResponse.json({ success: true, message: 'Disimpan secara lokal.' });
    }

    if (Array.isArray(batchQuestions)) {
      // Replace or insert batch
      const { error } = await supabaseServer.from('questions').upsert(batchQuestions);
      if (error) throw error;
      return NextResponse.json({ success: true, count: batchQuestions.length });
    } else if (question) {
      const { data, error } = await supabaseServer.from('questions').insert([question]).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, question: data });
    }

    return NextResponse.json({ error: 'Format data tidak valid.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Update single question
export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 401 });
  }

  try {
    const { question } = await req.json();
    if (!question || !question.id) {
      return NextResponse.json({ error: 'ID soal wajib disertakan.' }, { status: 400 });
    }

    if (isServerSupabaseConfigured && supabaseServer) {
      const { error } = await supabaseServer
        .from('questions')
        .update(question)
        .eq('id', question.id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, question });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Delete single question
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID soal wajib disertakan.' }, { status: 400 });
    }

    if (isServerSupabaseConfigured && supabaseServer) {
      const { error } = await supabaseServer.from('questions').delete().eq('id', id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
