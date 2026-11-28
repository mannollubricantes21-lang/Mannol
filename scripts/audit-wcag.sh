#!/bin/bash
# Auditoría WCAG 2.2 AA con axe-core sobre MANNOL POS servido en local.
# Uso: bash /home/z/my-project/scripts/audit-wcag.sh
set -u
OUT=/home/z/my-project/Mannol/a11y-reports
mkdir -p "$OUT"
AB="agent-browser"
PORT=4173

inject_and_run() {
  # $1 = nombre de página (para el archivo), $2 = url
  $AB open "$2" >/dev/null 2>&1
  sleep 1.6
  # inyectar axe si no está
  $AB eval "(async () => { if (window.axe) return 'ok'; return new Promise((res) => { const s = document.createElement('script'); s.src='/node_modules/axe-core/axe.min.js'; s.onload=()=>res('ok'); s.onerror=()=>res('ERR: no se pudo cargar axe'); document.head.appendChild(s); }); })()" >/dev/null 2>&1
  sleep 0.6
  $AB eval "(async () => { const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }); return JSON.stringify({ url: location.pathname + location.search, viewport: innerWidth + 'x' + innerHeight, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodos: v.nodes.length, ayuda: v.help, tags: v.tags.filter(t => t.startsWith('wcag')) , muestra: v.nodes.slice(0,3).map(n => n.target.join(' ')) })) , passes: r.passes.length }); })()" > "$OUT/axe-$1.json" 2>&1
  echo "── $1: $(wc -c < "$OUT/axe-$1.json") bytes"
}

$AB set viewport 390 844 >/dev/null 2>&1
inject_and_run "01-home-movil" "http://127.0.0.1:$PORT/index.html"
inject_and_run "02-pin-movil" "http://127.0.0.1:$PORT/index.html?view=pin"
inject_and_run "04-admin-movil" "http://127.0.0.1:$PORT/admin.html"

# home en escritorio para comparar
$AB set viewport 1280 800 >/dev/null 2>&1
inject_and_run "03-home-desktop" "http://127.0.0.1:$PORT/index.html"

echo "listo → $OUT"
