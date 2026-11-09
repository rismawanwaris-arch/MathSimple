import crypto from 'crypto';

// Default Admin PIN if not set in Environment Variables
const DEFAULT_ADMIN_PIN = '889922';

export function getAdminPin(): string {
  return process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN;
}

// Generate secure session token based on HMAC-SHA256
export function generateAdminToken(): string {
  const secret = process.env.ADMIN_JWT_SECRET || 'math-simple-secret-salt-key-2026';
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`admin-session-${timestamp}`)
    .digest('hex');
  
  return `${timestamp}.${signature}`;
}

// Verify admin session token (valid for 8 hours)
export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  
  try {
    const [timestampStr, signature] = token.split('.');
    if (!timestampStr || !signature) return false;

    const timestamp = parseInt(timestampStr, 10);
    const maxAge = 8 * 60 * 60 * 1000; // 8 hours in ms

    // Check expiration
    if (Date.now() - timestamp > maxAge) return false;

    const secret = process.env.ADMIN_JWT_SECRET || 'math-simple-secret-salt-key-2026';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`admin-session-${timestampStr}`)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}
