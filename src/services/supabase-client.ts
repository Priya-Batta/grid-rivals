import { createClient } from "@supabase/supabase-js";

const runtimeEnv = import.meta.env || {} as ImportMetaEnv;

const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY?.trim();

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  : null;

let sessionRequest: Promise<void> | null = null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

export function getSupabaseClientIfConfigured() {
  return supabase;
}

export function getConfiguredSupabaseClient() {
  if (!supabase) {
    throw new Error("Leaderboard is not configured yet. Local scores are still saved on this device.");
  }

  return supabase;
}

export async function ensureAnonymousSession(): Promise<void> {
  const client = getConfiguredSupabaseClient();

  if (sessionRequest) return sessionRequest;

  sessionRequest = (async () => {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    if (!data.session) {
      const { error: signInError } = await client.auth.signInAnonymously();
      if (signInError) throw signInError;
    }
  })();

  try {
    await sessionRequest;
  } finally {
    sessionRequest = null;
  }
}
