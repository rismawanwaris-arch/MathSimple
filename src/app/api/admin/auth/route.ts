import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminPin, generateAdminToken, verifyAdminToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ error: 'PIN wajib diisi.' }, { status: 400 });
    }

    const expectedPin = getAdminPin();

    // Timing-safe comparison to prevent timing attacks
    const pinBuffer = Buffer.from(pin.trim());
    const expectedBuffer = Buffer.from(expectedPin.trim());

    if (pinBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(pinBuffer, expectedBuffer)) {
      return NextResponse.json({ error: 'PIN Admin yang Anda masukkan salah.' }, { status: 401 });
    }

    // Generate secure session token
    const token = generateAdminToken();

    const response = NextResponse.json({
      success: true,
      token,
      message: 'Autentikasi HR Admin berhasil.',
    });

    // Set secure cookie
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60, // 8 hours
      path: '/',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Terjadi kesalahan otentikasi.' }, { status: 500 });
  }
}

// Check current session validity
export async function GET(req: NextRequest) {
  const token = req.cookies.get('admin_session')?.value || req.headers.get('Authorization')?.replace('Bearer ', '');
  const isValid = verifyAdminToken(token);

  if (!isValid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}

// Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: 'Logout berhasil.' });
  response.cookies.delete('admin_session');
  return response;
}
