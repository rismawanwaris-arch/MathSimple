import { createClient } from '@supabase/supabase-js';

export function cleanSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let trimmed = rawUrl.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return '';

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = 'https://' + trimmed;
  }

  // Handle accidental copy of Supabase dashboard project URL
  if (trimmed.includes('supabase.com/dashboard/project/')) {
    const parts = trimmed.split('supabase.com/dashboard/project/');
    const ref = parts[1]?.split('/')[0]?.split('?')[0];
    if (ref) return `https://${ref}.supabase.co`;
  }

  try {
    const parsed = new URL(trimmed);
    // If only project ref was given with https://<ref>
    if (!parsed.hostname.includes('.')) {
      return `https://${parsed.hostname}.supabase.co`;
    }
    // If hostname is <ref>.supabase.co, strip any /rest/v1 or trailing path
    if (parsed.hostname.endsWith('.supabase.co')) {
      return `https://${parsed.hostname}`;
    }
    // General fallback: origin only (strips /rest/v1, trailing slashes, etc.)
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function cleanSupabaseKey(rawKey: string): string {
  if (!rawKey) return '';
  return rawKey.trim().replace(/^['"]|['"]$/g, '');
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
export const supabaseUrl = cleanSupabaseUrl(rawUrl);

const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
export const serviceRoleKey = cleanSupabaseKey(rawKey);

export const isServerSupabaseConfigured = Boolean(
  supabaseUrl && 
  serviceRoleKey && 
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project')
);

export const supabaseServer = isServerSupabaseConfigured
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
