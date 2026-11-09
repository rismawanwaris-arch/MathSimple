import crypto from 'crypto';

const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 jam

// PIN admin WAJIB diset lewat environment variable (tidak ada default publik).
export function getAdminPin(): string | null {
  const pin = (process.env.ADMIN_PIN || '').trim();
  return pin.length > 0 ? pin : null;
}

// Secret penandatangan token. Tidak ada nilai default yang tertulis di repo:
// jika ADMIN_JWT_SECRET kosong, diturunkan dari rahasia server lain (PIN + service key).
function getSigningSecret(): string | null {
  const explicit = (process.env.ADMIN_JWT_SECRET || '').trim();
  if (explicit.length >= 16) return explicit;

  const pin = getAdminPin();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!pin) return null;
  return crypto.createHash('sha256').update(`msimple|${pin}|${svc}`).digest('hex');
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function generateAdminToken(): string | null {
  const secret = getSigningSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string' || token.length > 256) return false;
  const secret = getSigningSecret();
  if (!secret) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [expiresStr, nonce, signature] = parts;

    const expiresAt = parseInt(expiresStr, 10);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    const expected = sign(`${expiresStr}.${nonce}`, secret);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
