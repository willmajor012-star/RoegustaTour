import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const process: { env: Record<string, string | undefined> };

export type SupabaseEnv = {
  url: string;
  secretKey: string;
};

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!secretKey) missing.push('SUPABASE_SECRET_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required Supabase environment variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  }

  return { url: url as string, secretKey: secretKey as string };
}

/**
 * Server-only Supabase client for Netlify Functions.
 *
 * This helper uses SUPABASE_SECRET_KEY and must never be imported from browser/client code.
 */
export function createServerSupabaseClient(): SupabaseClient {
  const { url, secretKey } = getSupabaseEnv();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
