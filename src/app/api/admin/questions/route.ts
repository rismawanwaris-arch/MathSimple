import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';
import { defaultQuestions } from '@/data/defaultQuestions';

export const dynamic = 'force-dynamic';

const DIFFICULTIES = ['Mudah', 'Menengah', 'Sulit'];
const TYPES = ['mcq', 'input'];

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Whitelist field & validasi (mencegah mass-assignment / data berbahaya)
function sanitizeQuestion(q: any, requireId = false): Record<string, any> | null {
  if (!q || typeof q !== 'object') return null;

  const question_type = str(q.question_type, 10);
  const difficulty = str(q.difficulty, 20);
  const question_text = str(q.question_text, 1000);
  const correct_answer = str(q.correct_answer, 300);
  const category = str(q.category, 50);

  if (!TYPES.includes(question_type) || !DIFFICULTIES.includes(difficulty)) return null;
  if (!question_text || !correct_answer || !category) return null;

  let options: string[] | null = null;
  if (question_type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return null;
    const opts: string[] = q.options.map((o: unknown) => str(o, 200));
    if (opts.some((o) => !o)) return null;
    options = opts;
  }

  const out: Record<string, any> = { question_type, difficulty, question_text, correct_answer, category, options };

  const order = Number(q.question_order);
  if (Number.isInteger(order) && order > 0 && order < 1000) out.question_order = order;

  if (requireId || q.id !== undefined) {
    const id = Number(q.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    out.id = id;
  }
  return out;
}

// GET full questions (WITH correct answers, admin only)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    if (isServerSupabaseConfigured && supabaseServer) {
      const { data, error } = await supabaseServer.from('questions').select('*').order('question_order', { ascending: true });
      if (!error && data && data.length > 0) {
        return NextResponse.json({ questions: data }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
    return NextResponse.json({ questions: defaultQuestions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Gagal mengambil data soal' }, { status: 500 });
  }
}

// POST: Add new question or batch import
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const { questions: batch, question } = body || {};

    if (!isServerSupabaseConfigured || !supabaseServer) {
      return NextResponse.json({ success: true, message: 'Disimpan secara lokal.' });
    }

    if (Array.isArray(batch)) {
      if (batch.length === 0 || batch.length > 200) {
        return NextResponse.json({ error: 'Jumlah soal harus 1-200.' }, { status: 400 });
      }
      const clean = batch.map((q) => sanitizeQuestion(q));
      if (clean.some((q) => q === null)) {
        return NextResponse.json({ error: 'Ada soal dengan format tidak valid.' }, { status: 400 });
      }
      const { error } = await supabaseServer.from('questions').upsert(clean as any[]);
      if (error) throw error;
      return NextResponse.json({ success: true, count: clean.length });
    }

    if (question) {
      const clean = sanitizeQuestion(question);
      if (!clean) return NextResponse.json({ error: 'Format soal tidak valid.' }, { status: 400 });
      delete clean.id;
      const { data, error } = await supabaseServer.from('questions').insert([clean]).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, question: data });
    }

    return NextResponse.json({ error: 'Format data tidak valid.' }, { status: 400 });
  } catch (err) {
    console.error('questions POST error:', err);
    return NextResponse.json({ error: 'Gagal menyimpan soal.' }, { status: 500 });
  }
}

// PUT: Update single question
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { question } = await req.json().catch(() => ({}));
    const clean = sanitizeQuestion(question, true);
    if (!clean) return NextResponse.json({ error: 'Data soal tidak valid atau ID kosong.' }, { status: 400 });

    if (isServerSupabaseConfigured && supabaseServer) {
      const { id, ...fields } = clean;
      const { error } = await supabaseServer.from('questions').update(fields).eq('id', id);
      if (error) throw error;
    }
    return NextResponse.json({ success: true, question: clean });
  } catch (err) {
    console.error('questions PUT error:', err);
    return NextResponse.json({ error: 'Gagal memperbarui soal.' }, { status: 500 });
  }
}

// DELETE: Delete single question
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID soal tidak valid.' }, { status: 400 });
    }

    if (isServerSupabaseConfigured && supabaseServer) {
      const { error } = await supabaseServer.from('questions').delete().eq('id', id);
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('questions DELETE error:', err);
    return NextResponse.json({ error: 'Gagal menghapus soal.' }, { status: 500 });
  }
}
