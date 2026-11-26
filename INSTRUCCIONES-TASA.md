# Tasa automática de elTOQUE (GitHub)

Desde la v5.34.0 la tasa se actualiza **sola cada 15 minutos** con GitHub Actions,
igual que en TiendaMax. No hace falta que nadie abra la app. Si cambia, te
avisa por Telegram (opcional).

## 1. Sube los archivos

Tienen que estar en el repositorio:

- `.github/workflows/tasa-eltoque.yml`
- `scripts/tasa-eltoque.mjs`

> Si al subir por la web la carpeta `.github` no aparece (algunos navegadores
> no suben carpetas que empiezan por punto), créala a mano: **Add file → Create
> new file**, escribe `.github/workflows/tasa-eltoque.yml` como nombre y pega el
> contenido del archivo.

## 2. Pon los secretos

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Nombre | Qué es | Dónde se saca |
|---|---|---|
| `ELTOQUE_API_KEY` | Token de la API de elTOQUE | El mismo que usas en TiendaMax |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave **service_role** | Supabase → Project Settings → API (la secreta) |
| `TELEGRAM_BOT_TOKEN` | *(opcional)* Token del bot | El mismo `BOT_TOKEN` de TiendaMax |
| `TELEGRAM_CHAT_ID` | *(opcional)* A quién avisar | Tu chat o el canal (ej. `@mi_canal` o `-100…`) |

La clave **service_role** solo va en los secretos de GitHub. **Nunca** en la app
ni en ningún archivo.

## 3. Pruébalo

**Actions → Tasa elTOQUE → Supabase → Run workflow**. En un minuto verás algo así:

```
Tasa elTOQUE API: USD 470 · EUR 520
Guardada. Al cliente: USD 480 MN · EUR 530 MN
```

El margen (+10 o +20 MN) es el de **Admin → Tasas**.

## Bueno saber

- El reloj de GitHub no es exacto: a veces se retrasa 5–20 minutos.
- GitHub apaga los trabajos programados si el repositorio pasa **60 días sin
  cambios**. Si pasa, entra en Actions y vuelve a activarlo.
- Si elTOQUE no responde, se queda la última tasa guardada (no se rompe nada).
