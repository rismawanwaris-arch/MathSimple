import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, hmacSign, safeEqualHex } from '@/lib/auth';

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function isValidUuid(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

// Rate limiter hybrid: in-memory + signed HttpOnly cookie (tahan lintas instance serverless).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  req?: NextRequest,
  cookieName?: string
): { ok: boolean; retryAfter: number; cookieValue?: string; maxAgeSec?: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    buckets.forEach((v, k) => {
      if (v.resetAt < now) buckets.delete(k);
    });
  }

  let memCount = 0;
  let memResetAt = now + windowMs;
  const b = buckets.get(key);
  if (b && b.resetAt >= now) {
    memCount = b.count;
    memResetAt = b.resetAt;
  }

  // Baca state rate limit dari signed cookie jika tersedia (lintas instance serverless)
  let cookieCount = 0;
  let cookieResetAt = now + windowMs;
  if (req && cookieName) {
    const raw = req.cookies.get(cookieName)?.value;
    if (raw) {
      const parts = raw.split('.');
      if (parts.length === 3) {
        const [cStr, rStr, sig] = parts;
        const expected = hmacSign(`rl.${cookieName}.${cStr}.${rStr}`);
        const cNum = parseInt(cStr, 10);
        const rNum = parseInt(rStr, 10);
        if (safeEqualHex(sig, expected) && Number.isFinite(cNum) && Number.isFinite(rNum) && rNum >= now) {
          cookieCount = cNum;
          cookieResetAt = rNum;
        }
      }
    }
  }

  const resetAt = Math.max(memResetAt, cookieResetAt);
  const nextCount = Math.max(memCount, cookieCount) + 1;
  buckets.set(key, { count: nextCount, resetAt });

  let cookieValue: string | undefined;
  const maxAgeSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
  if (cookieName) {
    const sig = hmacSign(`rl.${cookieName}.${nextCount}.${resetAt}`);
    cookieValue = `${nextCount}.${resetAt}.${sig}`;
  }

  if (nextCount > limit) {
    return { ok: false, retryAfter: maxAgeSec, cookieValue, maxAgeSec };
  }
  return { ok: true, retryAfter: 0, cookieValue, maxAgeSec };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function tooManyRequests(retryAfter: number, cookieName?: string, cookieValue?: string) {
  const res = NextResponse.json(
    { error: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
  if (cookieName && cookieValue) {
    res.cookies.set(cookieName, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: retryAfter,
      path: '/',
    });
  }
  return res;
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

