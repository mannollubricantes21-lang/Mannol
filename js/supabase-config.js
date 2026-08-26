// =====================================================
// Supabase Configuration — MANNOL POS
// =====================================================
// Este archivo conecta la app con tu proyecto Supabase.
// Al subirlo al repo (en js/), cualquier dispositivo que
// abra la URL tiene Supabase configurado automáticamente,
// sin tener que hacer el wizard.
//
// Seguridad:
// - La "anon publishable key" es PÚBLICA por diseño en Supabase.
//   Está hecha para ir en el frontend. Respeta las políticas RLS
//   (Row Level Security) configuradas en policies.sql:
//   - Los admin ven todo
//   - Los gestores/vededores solo ven lo que les corresponde
// - NUNCA subas la "sb_secret_..." o "service_role" key al repo.
//   Esa sí es privada y da acceso total a la base de datos.
// =====================================================

export const supabaseConfig = {
  url: "https://ightajxyvifpekuwamjz.supabase.co",
  anonKey: "sb_publishable_F0Y8L3f91V7iFgb7CqeMrQ_i3W9-FFa"
};

export const isSupabaseConfigured = true;
