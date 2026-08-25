# 📋 Pasos manuales para terminar el setup de MANNOL POS

Este documento lista las acciones que **tú debes hacer manualmente** porque requieren acceso a tu cuenta personal de GitHub, a tu proyecto de Supabase, o a tu servidor.

---

## 🔴 URGENTE (antes de usar la app en producción)

### 1. Subir el workflow de CI a GitHub

El archivo `.github/workflows/ci.yml` está en tu working tree pero **no se pudo pushear** porque la GitHub App usada por Arena no tiene permiso `workflows`. Necesitas subirlo desde tu cuenta personal.

**Opción A — Desde la web de GitHub (más fácil):**
1. Ve a https://github.com/mannollubricantes21-lang/Mannol
2. Click en "Add file" → "Upload files"
3. Arrastra el archivo `.github/workflows/ci.yml` (está en tu working tree local)
4. Click en "Commit changes"

**Opción B — Desde CLI con tu cuenta personal:**
```bash
cd /home/user/Mannol
git checkout main
git add .github/workflows/ci.yml
git commit -m "ci: añadir GitHub Actions workflow"
git push origin main
```

**Opción C — Habilitar el permiso para la GitHub App:**
1. Ve a https://github.com/settings/installations
2. Click en la GitHub App que usa Arena
3. En "Repository access" → click en el repo
4. Habilita "Workflows" en los permisos
5. Vuelve a hacer `git push`

---

### 2. Crear el proyecto en Supabase

⚠️ **Si ya lo tienes creado, sáltate este paso.**

1. Ve a https://supabase.com y crea una cuenta / inicia sesión.
2. Click en "New project".
3. Elige tu organización y configura:
   - **Name:** `mannol-pos` (o el que prefieras)
   - **Database password:** guarda esta contraseña en un lugar seguro
   - **Region:** la más cercana a Cuba (US East o South America)
4. Click "Create new project" y espera ~2 minutos a que termine el provisioning.

**Archivos a descargar:** ninguno, todo se hace en la nube.

---

### 3. Ejecutar los scripts SQL en orden

Una vez creado el proyecto en Supabase:

1. En el dashboard de Supabase, ve a **SQL Editor** (icono de base de datos en el sidebar).
2. Click en "New query".
3. Pega el contenido de cada archivo en este orden y ejecuta:

   **📄 `supabase/schema.sql`** — Crea las 14 tablas + índices + 3 RPCs.
   
   **📄 `supabase/policies.sql`** — Activa RLS + buckets de Storage + grants.
   
   **📄 `supabase/seed.sql`** — Inserta datos demo (4 almacenes, 12 productos, 4 gestores, 4 tarjetas).

4. **Orden importante:** Ejecuta los 3 scripts en este orden estricto:
   1. `schema.sql` (crea tablas)
   2. `policies.sql` (crea políticas RLS + funciones de seguridad)
   3. `seed.sql` (inserta datos demo)
   
   NO ejecutes ningún archivo `migration-*.sql` — ya no existen. Todo está consolidado en `policies.sql`.

**Archivos a descargar:** los 3 archivos de `/supabase/` (ya están en tu repo).

---

### 4. Crear el primer usuario administrador

1. En Supabase, ve a **Authentication** → **Users** → **Add user** → **Create new user**.
2. Llena:
   - **Email:** `admin@mannol.cu` (o el que prefieras)
   - **Password:** una contraseña segura (anótala)
   - **Auto Confirm User:** ✅ activado
3. Click "Create user".
4. En la lista de usuarios, **copia el UUID** del usuario recién creado (es un string largo tipo `a1b2c3d4-...`).
5. Vuelve a **SQL Editor** y ejecuta este SQL (reemplaza `<UUID>` con el que copiaste):

```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<UUID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

**Archivos a descargar:** ninguno.

---

### 5. Configurar las credenciales de Supabase en la app

1. En el dashboard de Supabase, ve a **Project Settings** (icono engranaje) → **API**.
2. Copia estos dos valores:
   - **Project URL** (ej: `https://abcdefgh.supabase.co`)
   - **anon public key** (un JWT largo)
3. En tu repo local, crea el archivo `js/supabase-config.js` (sin el `.example`):

```bash
cd /home/user/Mannol/js
cp supabase-config.example.js supabase-config.js
```

4. Edita `js/supabase-config.js` y reemplaza los placeholders:

```js
export const supabaseConfig = {
  url: "https://TU-PROYECTO.supabase.co",  // ← pega tu Project URL
  anonKey: "eyJhbGciOiJIUzI1NiIs..."         // ← pega tu anon key
};
export const isSupabaseConfigured = true;
```

⚠️ **IMPORTANTE:** El archivo `js/supabase-config.js` está en `.gitignore` (o debería estarlo). Verifica que NO se suba al repo porque contiene credenciales.

**Archivos a crear/editar:**
- `js/supabase-config.js` (nuevo, NO commitear)

---

### 6. Habilitar Realtime en las tablas

Para que las actualizaciones en vivo funcionen (sincronización entre dispositivos), las tablas deben estar en la publicación `supabase_realtime`:

1. En Supabase, ve a **Database** → **Replication**.
2. Verifica que las siguientes tablas estén en la lista "Source":
   - `sales`, `stock_movements`, `rates`, `warehouses`, `products`, `categories`, `subcategories`, `users`, `managers`, `cards`, `stock`, `settings`, `rate_config`

3. Si falta alguna, ve a **SQL Editor** y ejecuta:

```sql
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.stock;
alter publication supabase_realtime add table public.stock_movements;
alter publication supabase_realtime add table public.rates;
alter publication supabase_realtime add table public.warehouses;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.subcategories;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.managers;
alter publication supabase_realtime add table public.cards;
```

**Archivos a descargar:** ninguno.

---

## 🟡 IMPORTANTE (después del setup inicial)

### 7. Configurar `.gitignore` (si no lo tienes)

Crea/edita el archivo `.gitignore` en la raíz del repo y asegúrate de que tenga:

```gitignore
# Supabase config (CONTIENE CREDENCIALES — NO COMMITAR)
js/supabase-config.js

# Dependencias
node_modules/

# Coverage
coverage/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
```

⚠️ **CRÍTICO:** Si por error ya subiste `supabase-config.js` al repo, **rótalo AHORA** en el dashboard de Supabase (Project Settings → API → Reset anon key) y súbelo de nuevo.

**Archivos a crear/editar:**
- `.gitignore` (verificar)

---

### 8. Crear el primer almacén con PIN

Una vez logueado como admin, abre la app y:

1. Click en "Almacenes" en el sidebar admin.
2. Click en "+ Nuevo".
3. Llena:
   - **Nombre:** ej. "Víbora"
   - **Código:** ej. "VIB" (3 letras)
   - **PIN:** un código de 4-8 dígitos (ej. `2611`) — esto permite a los vendedores entrar al almacén
   - **Comisión vendedor (%):** ej. 3
4. Click "Guardar".

Repite para cada almacén físico que tengas.

**Archivos a descargar:** ninguno.

---

### 9. (Opcional) Configurar la API de elToque

Para tasas automáticas actualizadas, necesitas un token de la API de elToque:

1. Ve a https://eltoque.com/api y regístrate para obtener un API Token.
2. En el panel admin, ve a **Tasas** → pega el token en "API Token (Bearer)".
3. Ajusta el markup (margen sobre la tasa oficial).

Si no tienes token, el sistema usa tasas manuales (USD = 320 MN por defecto).

**Archivos a descargar:** ninguno.

---

## 🟢 OPCIONAL (mejoras futuras)

### 10. Ejecutar el script de mantenimiento (cada 3-6 meses)

Cuando pasen 6+ meses y tengas muchas ventas, ejecuta `supabase/lifecycle-cleanup.sql` desde el SQL Editor para:
- Borrar movimientos de stock > 2 años
- Borrar ventas canceladas > 1 año
- Compactar las tablas (VACUUM)

**Archivos a usar:**
- `supabase/lifecycle-cleanup.sql`

---

### 11. Probar los tests localmente (opcional)

```bash
cd /home/user/Mannol
npm install
npm test
```

Si todo pasa, los 7 archivos de tests (~50 tests) cubren las funciones críticas: rate limit de PIN, escape HTML, helpers de mayorista, formateo de moneda, generación de IDs, etc.

**Archivos a usar:**
- `package.json` (ya existe)
- `vitest.config.js` (ya existe)
- `tests/*.test.js` (7 archivos)

---

## 📦 Resumen: archivos a descargar / subir manualmente

| # | Acción | Archivos |
|---|---|---|
| 1 | Subir CI a GitHub | `.github/workflows/ci.yml` |
| 2-4 | Setup Supabase | (todo en la nube) |
| 5 | Configurar credenciales | `js/supabase-config.js` (crear nuevo, NO commitear) |
| 6 | Habilitar Realtime | (todo en la nube) |
| 7 | Verificar .gitignore | `.gitignore` (verificar) |
| 8 | Crear almacenes | (vía la app) |
| 9 | Configurar elToque | (vía la app) |
| 10 | Mantenimiento | `supabase/lifecycle-cleanup.sql` |
| 11 | Tests locales | `npm install && npm test` |

---

## ⚠️ Lista de archivos que **NO** debes commitear

Estos archivos **nunca** deben subirse al repo (contienen credenciales o son generados):

```
js/supabase-config.js   ← CREDENCIALES de Supabase
node_modules/           ← dependencias npm
coverage/               ← reporte de cobertura
*.log                   ← logs
.DS_Store               ← macOS
```

Si por error subes `supabase-config.js`, ve inmediatamente a:
- Supabase → Project Settings → API → click "Roll" en "Project API keys" → la nueva key invalida la anterior
- Sube el nuevo `supabase-config.js` con la nueva key

---

## 🆘 Si algo falla

| Síntoma | Solución |
|---|---|
| "Cannot read property of undefined" al cargar admin | Verifica que `js/supabase-config.js` existe y tiene credenciales válidas |
| Las ventas no se sincronizan en tiempo real | Verifica que Realtime esté habilitado (paso 6) |
| "permission denied for table public.users" | Las políticas RLS no se aplicaron; re-ejecuta `policies.sql` |
| El admin no ve opciones de gestión | Recarga la página (Ctrl+Shift+R) — el SW puede tener cache viejo |
| Error "Failed to fetch" | Verifica que el proyecto Supabase está activo y las credenciales son correctas |
| Imágenes no se suben | Verifica que los buckets `products` y `images` existen en Storage |

---

**Si tienes dudas, abre un issue en GitHub con:**
- Captura de pantalla del error
- Output de la consola del navegador (F12)
- Pasos para reproducir
