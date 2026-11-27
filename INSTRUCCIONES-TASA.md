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

Después corre sola. Solo hace un cambio en el repositorio cuando la tasa cambia.

## Opcional

| Secreto | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Aviso en Telegram cuando cambia la tasa (puedes usar el bot de TiendaMax) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Guardarla también en Supabase (no hace falta) |

## Bueno saber

- El reloj de GitHub no es exacto: a veces se retrasa 5–20 minutos.
- GitHub apaga los trabajos programados si el repositorio pasa **60 días sin
  cambios**. Si pasa, entra en Actions y vuelve a activarlo.
- Si elTOQUE no responde, se mantiene la última tasa (no se rompe nada).
- Si el token falla (`HTTP 401`), lee la tasa de la página pública de elTOQUE.
