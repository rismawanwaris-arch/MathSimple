import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// Rate limiter in-memory (best-effort per instance serverless).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    buckets.forEach((v, k) => {
      if (v.resetAt < now) buckets.delete(k);
    });
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

// Pastikan request pengubah data berasal dari origin yang sama (proteksi CSRF).
function isSameOrigin(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = req.headers.get('origin');
  if (!origin) return true; // SameSite=Strict cookie tetap melindungi
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

// Mengembalikan NextResponse error jika tidak berwenang, atau null jika admin valid.
export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_session')?.value; // hanya cookie HttpOnly
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Akses ditolak. Silakan login sebagai HR Admin.' }, { status: 401 });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Permintaan lintas-origin ditolak.' }, { status: 403 });
  }
  return null;
}
