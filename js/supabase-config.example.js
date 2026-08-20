// =====================================================
// Supabase Configuration EXAMPLE
// =====================================================
// Copy this file to supabase-config.js and fill in your credentials.
//
// Steps:
// 1. Go to https://supabase.com and create a project
// 2. Project Settings → API:
//    - Project URL:    https://xxxxxx.supabase.co
//    - anon public key: eyJhbGc...
// 3. Replace the values below
// 4. Run supabase/schema.sql, supabase/policies.sql, supabase/seed.sql
//    in Supabase Dashboard → SQL Editor
// 5. Create the first admin user via:
//    Dashboard → Authentication → Users → "Add user" → mark as admin in users table
// =====================================================

export const supabaseConfig = {
  url: "https://TU-PROYECTO.supabase.co",
  anonKey: "TU-ANON-PUBLIC-KEY-EyJhbGciOiJIUzI1NiIs...",
};

export const isSupabaseConfigured =
  supabaseConfig.url &&
  supabaseConfig.url.startsWith("https://") &&
  !supabaseConfig.url.includes("TU-PROYECTO") &&
  !!supabaseConfig.anonKey &&
  !supabaseConfig.anonKey.startsWith("TU-");
