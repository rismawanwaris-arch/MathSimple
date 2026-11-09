import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

// GET publik: hanya mengembalikan field non-sensitif
export async function GET() {
  const fallback = { duration_minutes: 15, autosubmit: true, warning_minutes: 2 };
  try {
    if (isServerSupabaseConfigured && supabaseServer) {
      const { data } = await supabaseServer
        .from('exam_settings')
        .select('duration_minutes, autosubmit, warning_minutes')
        .eq('id', 1)
        .single();
      if (data) return NextResponse.json({ settings: data });
    }
    return NextResponse.json({ settings: fallback });
  } catch {
    return NextResponse.json({ error: 'Gagal mengambil pengaturan.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const duration = Number.parseInt(body?.duration_minutes, 10);

    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      return NextResponse.json({ error: 'Durasi waktu harus antara 1 sampai 180 menit.' }, { status: 400 });
    }

    if (isServerSupabaseConfigured && supabaseServer) {
      const { error } = await supabaseServer.from('exam_settings').update({ duration_minutes: duration }).eq('id', 1);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, duration_minutes: duration });
  } catch (err) {
    console.error('settings POST error:', err);
    return NextResponse.json({ error: 'Gagal menyimpan pengaturan.' }, { status: 500 });
  }
}
