import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminPin, generateAdminToken, verifyAdminToken, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import { getClientIp, rateLimit, resetRateLimit, tooManyRequests } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limitKey = `admin-login:${ip}`;

    // Maks 5 percobaan per 15 menit per IP
    const rl = rateLimit(limitKey, 5, 15 * 60 * 1000);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);

    const expectedPin = getAdminPin();
    if (!expectedPin) {
      return NextResponse.json(
        { error: 'Login admin dinonaktifkan: ADMIN_PIN belum diatur di server.' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const pin = body?.pin;
    if (!pin || typeof pin !== 'string' || pin.length > 64) {
      return NextResponse.json({ error: 'PIN wajib diisi.' }, { status: 400 });
    }

    // Bandingkan hash agar panjang sama & timing-safe
    const h = (s: string) => crypto.createHash('sha256').update(s).digest();
    if (!crypto.timingSafeEqual(h(pin.trim()), h(expectedPin))) {
      return NextResponse.json({ error: 'PIN Admin yang Anda masukkan salah.' }, { status: 401 });
    }

    const token = generateAdminToken();
    if (!token) {
      return NextResponse.json({ error: 'Konfigurasi keamanan server tidak lengkap.' }, { status: 503 });
    }

    resetRateLimit(limitKey);

    // Token HANYA lewat cookie HttpOnly (tidak dikirim di body JSON)
    const response = NextResponse.json({ success: true, message: 'Autentikasi HR Admin berhasil.' });
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan otentikasi.' }, { status: 500 });
  }
}

// Check current session validity
export async function GET(req: NextRequest) {
  const isValid = verifyAdminToken(req.cookies.get('admin_session')?.value);
  if (!isValid) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true });
}

// Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: 'Logout berhasil.' });
  response.cookies.set('admin_session', '', { httpOnly: true, maxAge: 0, path: '/' });
  return response;
}
