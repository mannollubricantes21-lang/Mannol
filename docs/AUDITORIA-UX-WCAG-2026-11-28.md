# 🔍 Auditoría UX móvil + WCAG 2.2 AA — MANNOL POS (28/11/2026)

> Etapa B del plan de mejoras. Auditoría realizada sobre la app servida en
> local (v5.39.2, modo demo) con navegador headless Chromium 158 en viewport
> móvil 390×844 (iPhone medio) y escritorio 1280×800 como contraste.
> Herramientas: axe-core 4.x (reglas WCAG 2.x nivel A/AA), inventario
> estático del skill WCAG, y medición directa del DOM (tamaños de toque,
> sticky, formularios). Scripts reproducibles: `scripts/audit-wcag.sh` y
> `scripts/audit-mobile.sh`; evidencia cruda en `a11y-reports/`.

## 1. Resumen ejecutivo

| Pantalla | Violaciones axe | Reglas que pasan |
|---|---|---|
| Home (móvil y escritorio) | 3 (15 nodos afectados) | 23 |
| Teclado PIN | 1 | 14 |
| Dashboard vendedor | 2 | 21 |
| Sheet de cobro (manual) | 1 hallazgo estructural | — |
| Acceso admin | 2 | 22 |

**8 violaciones** (23 nodos afectados en total) en 4 reglas WCAG distintas,
todas de impacto *serious*,
más 1 hallazgo manual (el sheet de cobro no es un `dialog` para el sistema).
Ninguna bloquea la venta por completo — el flujo funciona — pero todas
afectan a los controles que el vendedor toca cientos de veces al día: el
botón **Vender**, las filas de almacén, los botones de cobro.

**Lo que ya está bien y hay que preservar:** navegación inferior en zona de
pulgar (botones 78×64 px ✓), cabecera de solo 57 px (6.7 % del viewport ✓),
cobro con 5 campos (≤8 objetivo ✓) y `inputmode` correcto, CTA principal
abajo y grande («Registrar venta» 358×52 ✓), cero marcado heredado
obsoleto, autocompletar `off` razonable en la búsqueda rápida.

## 2. Hallazgos priorizados

### P0 — arreglar antes de seguir creciendo vistas

**P0-1 · Contraste de color insuficiente (SC 1.4.3, AA) — 10 nodos.**
`.rates-convert-btn`, `.premium-source-badge`, `.wh-row-icon` (home);
`.btn` del teclado PIN; `.fab-label` y la etiqueta del ítem activo del nav
(`.active > .nav-btn-label`) en el dashboard; `#admin-login-submit` y el
enlace de volver (`.mt-2 > a`) en admin. Impacto: en condiciones de luz
real (sol en la calle, pantalla barata) los textos pequeños de estos
controles se pierden. Arreglo: subir los tokens de texto tenue/badge a
≥ 4.5:1 sobre su fondo real (los grises de `--muted` y el blanco sobre el
verde del botón primario son los sospechosos habituales).

**P0-2 · Controles interactivos anidados (SC 4.1.2, A) — 4 nodos.**
Las filas de almacén (`.wh-row[role="button"]`) contienen el enlace
«Llamar a Víbora (+53 …)» y controles dentro del elemento clickable.
Un lector de pantalla no puede distinguir «entrar al almacén» de «llamar
por teléfono» dentro de un mismo botón, y el foco de teclado queda
ambiguo. Arreglo: la fila entera sigue siendo el botón de entrar, pero el
teléfono pasa a un elemento separado fuera del `role="button"` (por
ejemplo una fila secundaria), o se ancla aparte con `stopPropagation`
claro y `role="link"` real.

### P1 — mucho valor por poco trabajo

**P1-3 · El sheet de cobro no es un dialog (SC 4.1.2 / 2.4.3).**
El panel de cobro se monta sin `role="dialog"`, sin `aria-modal` y sin
captura de foco: con teclado se puede Tab-navegar al contenido de fondo,
y el lector de pantalla no anuncia que se abrió el cobro — justo cuando
se está cobrando dinero. Arreglo: `role="dialog"` + `aria-modal="true"`
+ `aria-labelledby` con el título, foco al primer campo al abrir, `Esc`
cierra, y devolver el foco al cerrar. Es el mismo patrón que ya usa
`showModal()` de `js/ui.js` — reutilizarlo.

**P1-4 · El CTA «Vender» no es lo que parece (SC 2.5.3, A).**
El círculo verde del FAB es grande visualmente, pero el botón enfocable
real (`#fab-sell`) mide **24×24 px** y su nombre accesible no coincide
con el texto visible «Vender» (lo mismo pasa con `button[data-nav="wi-inv"]`).
Impacto: usuarios de control por voz que dicen «Vender» no activan el
botón, y el objetivo de toque programático es mínimo. Arreglo: que el
botón real ocupe todo el círculo (≥ 48×48), con el label visible dentro
del nombre accesible.

**P1-5 · Enlace distinguible sin color (SC 1.4.1, A) — admin.**
El enlace de volver (`.mt-2 > a`) se distingue solo por el color dentro
del bloque de texto. Arreglo: subrayado o peso; una línea de CSS.

### P2 — pulido

**P2-6 · Objetivos de toque menores de 44 px.** Los chips de periodo
«Hoy/Semana/Mes» miden 36 px de alto y «Una moneda» / «Pago mixto» 37 px.
Cumplen el mínimo AA (24 px) pero están debajo del estándar fuerte
(44×44 con 8 px de separación) — y en los botones de dinero un error de
pulgar cuesta una venta mal registrada. Arreglo: padding vertical hasta
44 px conservando el diseño.

**P2-7 · Nombre accesible ≠ texto visible en los tiles de tasa**
(`.premium-rate-tile-usd/eur`). Mismo criterio del P1-4: incluir el texto
visible en el `aria-label`.

**P2-8 · Verificación dinámica pendiente (SC 4.1.2).** El inventario
estático marca `details/summary` (nativo, bajo riesgo) y el contenedor de
toasts `#toast-container[aria-live]`. El toast renderiza bien (verificado
en navegador); queda por confirmar el anuncio real con lector de pantalla
y que `unhandledrejection` → toast se anuncie. Marcar «DYNAMIC TEST
REQUIRED» hasta esa prueba.

## 3. Etapa B — lotes propuestos

Metodología `ui-ux-pro-max`: primero tokens, después componentes, y cada
lote con criterios de aceptación verificables.

**Lote B1 — Accesibilidad rápida (solo CSS/ARIA, 1 sesión).**
Tokens de color corregidos (P0-1), subrayado del enlace admin (P1-5),
chips y modos de pago a 44 px (P2-6), `aria-label` coherentes (P2-7).
Aceptación: axe en verde en las 5 pantallas; suite 400+ tests verde;
capturas antes/después.

**Lote B2 — Semántica del flujo de venta (1 sesión).**
Dialog accesible en el cobro (P1-3, reutilizando `showModal()`), filas de
almacén sin interactivos anidados (P0-2), FAB semántico de tamaño real
(P1-4). Aceptación: recorrer «Vender → cobrar» solo con teclado; axe sin
`nested-interactive`; foco visible y ordenado en el sheet.

**Lote B3 — Sistema de tokens (1-2 sesiones).**
Extraer a `:root` la escala completa: color (marca, estados, texto en 3
niveles garantizando 4.5:1), espaciado (4/8), radios, tipografía (ya hay
Barlow Condensed para cifras). Reglas nuevas documentadas: ningún control
bajo 44 px, foco visible 2 px, todo estado error/success con texto además
de color. Esto fija la base para los temas por almacén de la v5.25 sin
que cada vista diverja.

**Métrica para la Etapa C (pendiente):** no hay datos de campo (CrUX/RUM)
por ser una PWA sin telemetría; cuando se habilite, medir p75 LCP/INP/CLS
reales de los equipos de los vendedores antes de optimizar rendimiento.

## 4. Reproducir la auditoría

```bash
# servidor local en el raíz del proyecto
python3 -m http.server 4173
# axe + capturas (requiere agent-browser)
bash scripts/audit-wcag.sh
bash scripts/audit-mobile.sh
# reports: a11y-reports/*.json
```

*Nota honesta: axe-core automatiza ~30-40 % de los criterios WCAG; este
informe declara solo lo verificado. «Sin hallazgos automatizados» no
equivale a conformidad AA completa.*

## 5. Resultado del Lote B1 (aplicado el mismo día, v5.39.3)

Re-auditoría tras aplicar B1 (contraste, targets, nombres accesibles,
enlace admin) con el mismo instrumental y viewport:

| Pantalla | Antes | Después (v5.39.3) |
|---|---|---|
| Home móvil | 3 violaciones / 15 nodos | **0** ✓ |
| Teclado PIN | 1 | **0** ✓ |
| Dashboard vendedor | 2 | **0** ✓ |
| Acceso admin | 2 | **0** ✓ |
| Home escritorio | 3 | **0** ✓ |
| Targets < 44 px | 5 | **0** ✓ |

Cambios concretos: tema claro `--primary` L 0.55→0.53 y acentos
usd/cian L 0.52–0.53 (blanco sobre verde ≥4.6:1); tema oscuro con
`--accent-foreground` oscuro en vez de `white` sobre verde claro (medía
2.49:1); tinta `color-mix(45%, var(--text))` sobre tintes en
`.rates-convert-btn`, badges y `.wh-row-icon`; etiqueta activa del nav
inferior en verde claro (la barra móvil es siempre oscura); chips y
modos de pago a 44 px; FAB renombrado «Vender — registrar nueva venta»;
nav sin `aria-label` contradictorio con el badge; tiles de tasa
«USD/EUR — convertir tasa a MN»; `.mt-2 a` subrayado; CSS con
`?v=5.39.3` y Service Worker `v73` para forzar refresco. Suite 406/406
en verde y `npm run validate` OK.

Quedan abiertos para B2 (estructural): dialog accesible del sheet de
cobro, filas de almacén sin interactivos anidados, y botón enfocable del
FAB de tamaño real (24×24 px hoy). Nota de método: el primer run marcó
`nested-interactive` en las filas de almacén y el último no lo reporta —
se mantiene en B2 hasta doble verificación. La medición python de
oklch→sRGB tiene un desfase de ±0.15 frente al cálculo nativo de
Chromium; para los casos al borde (p. ej. el enlace de admin, ~4.4-4.6)
se toma como verdad el resultado de axe.

## 6. Resultado del Lote B2 (aplicado el mismo día, v5.39.4)

Corrección de método primero: el «botón enfocable del FAB de 24×24 px»
del hallazgo P1-4 era un artefacto de medición — el botón real mide
64×64 px y la lista canónica `targetsMenores44` del flujo demo queda
vacía. P1-4 se cierra con el nombre accesible corregido en B1; no hacía
falta rediseñar el FAB.

Lo que aplicó B2 sobre los hallazgos estructurales:

| Hallazgo | Aplicado en v5.39.4 |
|---|---|
| P0-2 interactivo anidado en filas | Contenedor sin `role=button`; botón nativo estirado con nombre completo + enlace de llamar como hermano encima (verificado: `nested-interactive` fuera) |
| P1-3 sheet de cobro sin dialog | Sistema de modales sobre `<dialog>`+`showModal()` nativo (catálogo, confirmaciones) y foco gestionado en el paso de cobro inline: Cobrar → `#payment-section`, volver → botón Cobrar |
| P2-7 nombres incoherentes | Tiles de tasa y chips de más vendidos pasan a nombrar por contenido visible (2.5.3 con texto dinámico) |

Auditoría extendida a estados con modales ABIERTOS (no cubiertos antes):
el catálogo abierto destapó 6 nodos de contraste (agotados a 2.45:1 por
`opacity` en el contenedor — la opacidad compone el subárbol completo,
por lo que la atenuación se movió a las fotos y el texto queda a pleno
contraste; badge del botón Catálogo a 3.43:1) y el paso de cobro 2 más
(muted sobre tarjeta seleccionada, «Cambiar» en verde puro). Todos
corregidos y re-verificados.

**Veredicto medido (v5.39.4):** axe-core 0 violaciones en 7 estados —
las 5 pantallas originales + catálogo-modal abierto + paso de cobro —,
recorrido de cobro completo solo con teclado (Cobrar → pago → Tab →
volver → foco en Cobrar), suite 406/406 y `npm run validate` OK. Los
reports quedan en `a11y-reports/axe-0*.json` y el guion de reproducción
en `scripts/verificar-b2.sh`.

**B3 aplicado (v5.39.6):** escala completa de tokens a `:root` — color ya
tokenizado desde B1, ahora espaciado 4/8 (`--space-1…8`) y tipografía
(`--text-xs…2xl`, `--leading-*`) en `css/mobile-ux.css`; radios
(`--radius-*`) y foco visible 2 px (`:focus-visible`) ya estaban
estandarizados en `styles.css` y quedan con test de regresión. Estados
error/éxito con texto además de color: toasts con icono+texto y el punto
«Caja sin cerrar» con `role="img"` + `aria-label` + `title`.
`global-search.js` migrado al dialog nativo del sistema vía `showModal()`
(sin cabecera, alineado arriba, `aria-label` «Búsqueda global») — recorrido
Ctrl+K → escribir → Enter navega y cierra, Escape cierra; axe **0
violaciones** con la paleta abierta (`a11y-reports/axe-08-b3-search.json`),
suite 418/418 (+6 tests de B3 en `tests/b3-ui.test.js`). Report de
verificación en `scripts/verificar-b3.sh`.
