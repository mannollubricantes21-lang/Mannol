// =====================================================
// GitHub Storage Config (OPCIONAL) — MANNOL POS
// =====================================================
// Copia este archivo a js/github-config.js para preconfigurar
// el repo donde se guardan las imágenes de productos.
// El TOKEN nunca debería ir aquí (se guarda por dispositivo en
// localStorage desde: Admin → Sistema → Almacenamiento).
//
// ¿Por qué GitHub? Las imágenes son lo que más pesa; guardarlas
// aquí evita agotar el espacio del free tier de Supabase (1 GB).
//
// owner: tu usuario u organización de GitHub
//        (en tu caso: mannollubricantes21-lang)
// repo:  el repositorio (ej: Mannol)
// branch: rama donde se commitean las imágenes (main)
// path:  carpeta dentro del repo (se crea sola al subir)
// cdnBase: opcional. Si lo dejas vacío se usa
//          https://raw.githubusercontent.com/{owner}/{repo}/{branch}/
//          Ej con CDN: https://cdn.jsdelivr.net/gh/mannollubricantes21-lang/Mannol@main
// =====================================================

export const githubConfig = {
  owner: "mannollubricantes21-lang",
  repo: "Mannol",
  branch: "main",
  path: "product-images",
  token: "", // ← dejar vacío; se configura desde el panel admin
  cdnBase: "",
};
