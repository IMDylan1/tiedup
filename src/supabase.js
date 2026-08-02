import { createClient } from '@supabase/supabase-js'

// Config comes from env vars so no keys are ever committed.
// Local: .env  ·  Netlify: Site configuration → Environment variables
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without config the app still runs — it just stays in local-only mode,
// exactly how it behaved before accounts existed.
export const isConfigured = Boolean(url && key)

export const supabase = isConfigured ? createClient(url, key) : null
