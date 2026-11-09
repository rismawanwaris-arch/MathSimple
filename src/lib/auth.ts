import crypto from 'crypto';

const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 jam
const EXAM_TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 jam masa berlaku tiket ujian

// Gunakan ADMIN_PIN dari environment variable jika ada, dengan fallback agar login tidak error 503.
export function getAdminPin(): string {
  const pin = (process.env.ADMIN_PIN || '').trim();
  return pin.length > 0 ? pin : '889922';
}

// Secret penandatangan token diturunkan dari rahasia server (SUPABASE_SERVICE_ROLE_KEY / ADMIN_JWT_SECRET)
// yang hanya ada di server Vercel dan tidak pernah ada di repositori publik.
export function getSigningSecret(): string {
  const explicit = (process.env.ADMIN_JWT_SECRET || '').trim();
  if (explicit.length >= 16) return explicit;

  const pin = getAdminPin();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  return crypto
    .createHash('sha256')
    .update(`msimple-v2|${pin}|${svc}|${anon}|${url}`)
    .digest('hex');
}

export function hmacSign(payload: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function generateAdminToken(): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${hmacSign(payload)}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string' || token.length > 256) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [expiresStr, nonce, signature] = parts;

    const expiresAt = parseInt(expiresStr, 10);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    const expected = hmacSign(`${expiresStr}.${nonce}`);
    return safeEqualHex(signature, expected);
  } catch {
    return false;
  }
}

// Token Waktu Mulai Ujian yang ditandatangani server (mencegah manipulasi startedAt dari browser)
export function generateExamToken(startedAtMs: number = Date.now()): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `exam.${startedAtMs}.${nonce}`;
  return `${startedAtMs}.${nonce}.${hmacSign(payload)}`;
}

export function verifyExamToken(
  token: string | null | undefined
): { valid: boolean; startedAtMs: number; nonce: string } {
  if (!token || typeof token !== 'string' || token.length > 256) {
    return { valid: false, startedAtMs: 0, nonce: '' };
  }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, startedAtMs: 0, nonce: '' };
    const [startedStr, nonce, sig] = parts;
    const startedAtMs = parseInt(startedStr, 10);
    const now = Date.now();
    if (
      !Number.isFinite(startedAtMs) ||
      startedAtMs <= 0 ||
      startedAtMs > now + 60_000 ||
      now - startedAtMs > EXAM_TOKEN_MAX_AGE_MS
    ) {
      return { valid: false, startedAtMs: 0, nonce: '' };
    }
    const expected = hmacSign(`exam.${startedStr}.${nonce}`);
    if (!safeEqualHex(sig, expected)) {
      return { valid: false, startedAtMs: 0, nonce: '' };
    }
    return { valid: true, startedAtMs, nonce };
  } catch {
    return { valid: false, startedAtMs: 0, nonce: '' };
  }
}

// Pencatatan nonce tiket ujian yang sudah dipakai (anti double-submit / replay)
const usedExamNonces = new Map<string, number>();

export function isExamNonceUsed(nonce: string): boolean {
  if (!nonce) return false;
  const exp = usedExamNonces.get(nonce);
  if (!exp) return false;
  if (Date.now() > exp) {
    usedExamNonces.delete(nonce);
    return false;
  }
  return true;
}

export function markExamNonceUsed(nonce: string): void {
  if (!nonce) return;
  const now = Date.now();
  if (usedExamNonces.size > 5000) {
    usedExamNonces.forEach((exp, k) => {
      if (exp < now) usedExamNonces.delete(k);
    });
  }
  usedExamNonces.set(nonce, now + EXAM_TOKEN_MAX_AGE_MS);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
export const EXAM_TOKEN_MAX_AGE_SECONDS = EXAM_TOKEN_MAX_AGE_MS / 1000;

