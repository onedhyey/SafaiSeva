// Service-role Supabase client. This bypasses RLS by design — the API is the sole
// writer of handovers, verification events, and the credit ledger (audit C2). RLS still
// protects any future direct-from-browser access with the anon key.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, supabaseConfigured } from './env.ts';

let client: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!supabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.'
    );
  }
  if (!client) {
    client = createClient(env.supabaseUrl!, env.supabaseServiceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
