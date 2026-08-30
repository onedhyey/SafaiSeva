// Normalized server-side environment access. Tolerates the several names the same
// value has been given across tools (SUPABASE_URL / VITE_SUPABASE_URL / EXPO_PUBLIC_*).

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

const PLACEHOLDER = new Set(['', 'MY_GEMINI_API_KEY', 'your-api-key', 'changeme']);

export const env = {
  supabaseUrl: pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: pick('SUPABASE_SERVICE_ROLE_KEY'),

  geminiApiKey: (() => {
    const k = pick('GEMINI_API_KEY');
    return k && !PLACEHOLDER.has(k) ? k : undefined;
  })(),
  // gemini-2.5-flash is deprecated for new API keys; 3.6-flash is the current default.
  geminiModel: pick('GEMINI_MODEL') || 'gemini-3.6-flash',

  authEnabled: String(pick('VITE_AUTH_ENABLED') ?? '').toLowerCase() === 'true',
  clerkSecretKey: pick('CLERK_SECRET_KEY'),

  appUrl: pick('APP_URL'),
  qrSigningSecret: pick('QR_SIGNING_SECRET'),
};

export function supabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}

export function geminiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}
