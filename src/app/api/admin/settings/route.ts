import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get('admin_session')?.value || req.headers.get('Authorization')?.replace('Bearer ', '');
  return verifyAdminToken(token);
}

export async function GET() {
  try {
    if (isServerSupabaseConfigured && supabaseServer) {
      const { data } = await supabaseServer.from('exam_settings').select('*').eq('id', 1).single();
      if (data) return NextResponse.json({ settings: data });
    }
    return NextResponse.json({ settings: { duration_minutes: 15, autosubmit: true, warning_minutes: 2 } });
  } catch (err: any) {
    return NextResponse.json({ error: 'Gagal mengambil pengaturan.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 401 });
  }

  try {
    const { duration_minutes } = await req.json();
    const duration = parseInt(duration_minutes, 10);

    if (isNaN(duration) || duration < 1 || duration > 180) {
      return NextResponse.json({ error: 'Durasi waktu harus antara 1 sampai 180 menit.' }, { status: 400 });
    }

    if (isServerSupabaseConfigured && supabaseServer) {
      const { error } = await supabaseServer
        .from('exam_settings')
        .update({ duration_minutes: duration })
        .eq('id', 1);

      if (error) throw error;
    }

    return NextResponse.json({ success: true, duration_minutes: duration });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
