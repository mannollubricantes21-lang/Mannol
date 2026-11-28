#!/bin/bash
# Auditoría UX móvil del flujo de venta MANNOL POS (viewport 390x844, login demo PIN 2611).
# Mide axe en dashboard, tap targets pequeños, CWV de laboratorio, y deja capturas.
set -u
OUT=/home/z/my-project/Mannol/a11y-reports
SHOTS=/home/z/my-project/download/v5.39.2-etapa-a/capturas
mkdir -p "$OUT" "$SHOTS"
AB="agent-browser"
PORT=4173

$AB set viewport 390 844 >/dev/null 2>&1
$AB open "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1
sleep 1.8

# login por PIN del almacén Víbora (demo): 2 6 1 1 + Entrar
$AB eval "(() => { const fila = [...document.querySelectorAll('button, [role=\"button\"]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes('Entrar al almacén Víbora')); fila?.click(); return fila ? 'fila pulsada' : 'FILA NO ENCONTRADA'; })()" >/dev/null 2>&1
sleep 0.8
for d in 2 6 1 1; do
  $AB eval "(() => { const b = [...document.querySelectorAll('button, [role=\"button\"]')].find(x => (x.textContent || '').trim() === '$d'); b?.click(); return 'ok'; })()" >/dev/null 2>&1
done
sleep 0.3
$AB eval "(() => { const ok = document.querySelector('#pin-ok') || [...document.querySelectorAll('button, [role=\"button\"]')].find(b => (b.textContent || '').trim() === 'Entrar'); ok?.click(); return ok ? 'enviado' : 'NO ENTRAR'; })()" >/dev/null 2>&1
sleep 2.2

echo "URL tras login: $($AB get url 2>/dev/null)"

# inyectar axe y auditar el dashboard
$AB eval "(async () => { if (window.axe) return 'ok'; return new Promise((res) => { const s=document.createElement('script'); s.src='/node_modules/axe-core/axe.min.js'; s.onload=()=>res('ok'); s.onerror=()=>res('ERR axe'); document.head.appendChild(s); }); })()" >/dev/null 2>&1
sleep 0.6
$AB eval "(async () => { const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }); return JSON.stringify({ url: location.pathname + location.search, viewport: innerWidth + 'x' + innerHeight, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodos: v.nodes.length, ayuda: v.help, tags: v.tags.filter(t => t.startsWith('wcag')), muestra: v.nodes.slice(0,3).map(n => n.target.join(' ')) })), passes: r.passes.length }); })()" > "$OUT/axe-05-dashboard-movil.json" 2>&1
echo "axe dashboard: $(wc -c < "$OUT/axe-05-dashboard-movil.json") bytes"

# métricas UX: tap targets < 44px, header, sticky, CWV de laboratorio
$AB eval "(async () => {
  const pequeños = [...document.querySelectorAll('button, a, [role=\\\"button\\\"], input, select')].map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width > 0 && x.r.height > 0 && (x.r.width < 44 || x.r.height < 44)).slice(0, 12).map(x => ({ t: (x.el.textContent || x.el.getAttribute('aria-label') || x.el.tagName).trim().slice(0, 22), w: Math.round(x.r.width), h: Math.round(x.r.height) }));
  const h = document.querySelector('.app-header, .premium-header, .admin-topbar');
  const sticky = [...document.querySelectorAll('*')].filter(el => { const s = getComputedStyle(el); return (s.position === 'fixed' || s.position === 'sticky') && el.offsetHeight > 0 && el.offsetHeight < innerHeight; }).slice(0, 6).map(el => String(el.className).slice(0, 44));
  const lcp = await new Promise(r => { try { new PerformanceObserver(l => r(Math.round(l.entries[l.entries.length - 1].startTime))).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => r(-1), 1500); } catch { r(-1); } });
  return JSON.stringify({ headerPx: h ? Math.round(h.getBoundingClientRect().height) : 0, viewport: innerHeight, sticky, lcpMs: lcp, targetsMenores44: pequeños });
})()" > "$OUT/ux-dashboard-movil.json" 2>&1
echo "ux dashboard: $(wc -c < "$OUT/ux-dashboard-movil.json") bytes"

$AB screenshot "$SHOTS/06-dashboard-movil.png" 2>&1 | tail -1
echo "listo"
