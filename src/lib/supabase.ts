import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Browser client. Holds the anon key only. All privileged writes go through
// Netlify Functions which use the service-role key server-side.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
