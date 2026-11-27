# Tasa automática de elTOQUE (igual que en TiendaMax)

La tasa se actualiza **sola cada 15 minutos** con GitHub. Solo hay que poner
**un secreto** en GitHub, como en TiendaMax.

## 1. Pon el token de elTOQUE

1. Abre el repositorio **mannollubricantes21-lang/mannol** en GitHub.
2. **Settings → Secrets and variables → Actions → New repository secret**.
3. Name: `ELTOQUE_API_KEY` · Secret: tu token de elTOQUE (el mismo de TiendaMax).
4. **Add secret**.

Listo. No hace falta nada de Supabase.

## 2. Pruébalo (una vez)

1. Pestaña **Actions** (si sale un botón verde para activar los workflows, tócalo).
2. A la izquierda: **Tasa elTOQUE** → **Run workflow** → **Run workflow**.
3. En un minuto, dentro de la ejecución, **Leer tasa de elTOQUE** debe decir:
   ```
   Tasa elTOQUE API: USD 470 · EUR 520
   tasa.json actualizado (USD 470 · EUR 520).
   ```
4. Aparece un archivo nuevo **tasa.json** en el repositorio. En 1–2 minutos
   GitHub lo publica con la web y todos los almacenes usan esa tasa + el
   margen de **Admin → Tasas** (+10 / +20 MN).

## 3. Cómo saber si DE VERDAD funcionó

> Desde v5.39.1, si el run se ve en **rojo**, es que no consiguió la tasa
> (antes salía en verde aunque no publicara nada — no te fíes solo del ✓).

Verifica en este orden:

1. En el run, el paso **Leer tasa de elTOQUE** debe decir:
   `Tasa elTOQUE API: USD 470 · EUR 520` y después
   `tasa.json actualizado (USD 470 · EUR 520)`.
2. En la raíz del repositorio debe existir el archivo **tasa.json**
   (commit firmado por `tasa-bot`). Si el paso terminó en
   `Sin cambios en tasa.json` y el archivo NO existe, es que nunca se
   publicó la primera vez: vuelve a ejecutar **Run workflow**.
3. Espera 1–2 min al redeploy de GitHub Pages y abre en el navegador
   `https://<tu-repo>.github.io/<repo>/tasa.json` — debe devolver JSON con
   la tasa. La app lo lee de ahí.

## Errores comunes

| Mensaje en el log | Causa y arreglo |
|---|---|
| `Falta ELTOQUE_API_KEY` | El secreto no existe o está vacío. Créalo en **Settings → Secrets and variables → Actions → New repository secret**. Ojo: tiene que ser **secret de repositorio**; si lo creaste como secret de *environment*, este workflow no lo ve. Revisa que el nombre sea exactamente `ELTOQUE_API_KEY` (sin espacios). |
| `API elTOQUE: HTTP 401 / 403 / 422` | El token fue **rechazado** por elTOQUE (vencido, mal copiado o revocado). Pruébalo a mano y pide uno nuevo si falla: `curl -H "Authorization: Bearer TU_TOKEN" https://tasas.eltoque.com/v1/trmi` — debe devolver JSON con las tasas. Luego actualiza el secreto. |
| `No se pudo leer elTOQUE (fetch failed)` también en la página pública | elTOQUE bloqueó al runner (Cloudflare) y Wayback tampoco respondió. Con el token válido esto no debería pasar: la API es la fuente principal. |
| El run sale verde pero `tasa.json` no aparece | Solo pasa con versiones **anteriores** a v5.39.1. Actualiza el repo y vuelve a ejecutar. |

## Importante: el token dentro de la app (Admin → Tasas) NO funciona

Poner el token de elToque en **Admin → Tasas** de la app es inútil: el API de
elTOQUE no envía cabeceras CORS, así que **el navegador bloquea la llamada**
siempre (se ve solo en la consola como «elToque sync failed»). La única vía
válida es esta: **GitHub Actions → tasa.json**. Deja el campo del token vacío;
no hace falta nada de Supabase.

## Opcional

| Secreto | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Aviso en Telegram cuando cambia la tasa (puedes usar el bot de TiendaMax) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Guardarla también en Supabase (no hace falta) |

## Bueno saber

- El reloj de GitHub no es exacto: a veces se retrasa 5–20 minutos.
- GitHub apaga los trabajos programados si el repositorio pasa **60 días sin
  cambios**. Si pasa, entra en Actions y vuelve a activarlo.
- Si elTOQUE no responde, **el run falla en rojo** (v5.39.1) y se mantiene la
  última tasa publicada (no se rompe nada, los almacenes siguen vendiendo con
  la última).
- Si el token falla (`HTTP 401`), lee la tasa de la página pública de elTOQUE.
- Aviso automático: GitHub manda un correo cuando un workflow programado
  falla, así que te enterarás de que la tasa dejó de actualizarse.
