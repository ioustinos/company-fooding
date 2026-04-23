import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Service-role Supabase client. Server-side only — NEVER import into the
 * React bundle. Bypasses RLS; every function must enforce its own auth.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('supabaseAdmin: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }

  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
