# 🔥 Guía Completa: Firebase + GitHub + Sincronización

## ¿Qué necesitas?

Para que **todos los teléfonos estén sincronizados** en tiempo real, necesitas:

1. **Proyecto Firebase** (gratis) — guarda los datos en la nube
2. **Repo GitHub** (gratis) — hospeda el código de la app
3. **GitHub Pages** (gratis) — sirve la app desde GitHub

Cuando un teléfono registra una venta:
```
Teléfono A registra venta → Firebase → onSnapshot → Teléfono B, C, D ven la venta al instante
```

---

## Paso 1: Crear proyecto Firebase

1. Ve a https://console.firebase.google.com
2. Click **"Agregar proyecto"**
3. Nombre: `mannol-pos` (o el que quieras)
4. **Google Analytics**: No (no lo necesitas)
5. Click **"Crear proyecto"**

---

## Paso 2: Agregar Web App a Firebase

1. En el panel de Firebase, click **"</>"** (Web)
2. Apodo: `mannol-pos-web`
3. **NO** marques "Firebase Hosting" (usaremos GitHub Pages)
4. Click **"Registrar app"**
5. Verás un código como este:
```js
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "mannol-pos.firebaseapp.com",
  projectId: "mannol-pos",
  storageBucket: "mannol-pos.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789",
};
```
6. **Copia esos valores** — los necesitarás en el Paso 5

---

## Paso 3: Configurar servicios en Firebase

### 3a. Authentication
1. Menú lateral → **Authentication** → **Get started**
2. Tab **"Sign-in method"**
3. Habilita **"Email/Password"** → Activar → **Guardar**

### 3b. Cloud Firestore
1. Menú lateral → **Firestore Database** → **Create database**
2. **Location**: `us-central1` (o la más cercana)
3. **Modo**: **Production mode** (las reglas ya están en el proyecto)
4. Click **"Create"**

### 3c. Storage (para imágenes de productos)
1. Menú lateral → **Storage** → **Get started**
2. **Location**: misma que Firestore
3. Click **"Done"**

---

## Paso 4: Desplegar reglas de seguridad

Desde tu computadora (con Node.js instalado):

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Seleccionar tu proyecto
firebase use --add
# (escribe el ID de tu proyecto: mannol-pos)

# Desplegar reglas de seguridad
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

Esto configura quién puede leer/escribir cada colección.

---

## Paso 5: Configurar credenciales en la app

1. Descomprime el ZIP de la app
2. Copia `js/firebase-config.example.js` a `js/firebase-config.js`
3. Edita `js/firebase-config.js` con TUS credenciales:

```js
export const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "mannol-pos.firebaseapp.com",
  projectId: "mannol-pos",
  storageBucket: "mannol-pos.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789",
};

export const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("AIzaSyXXX") &&
  firebaseConfig.projectId !== "tu-proyecto-id";
```

4. **Guarda el archivo**

---

## Paso 6: Crear el primer usuario admin

1. En Firebase Console → **Authentication** → **Users** → **Add user**
2. Email: `admin@mannol.cu` (o el que quieras)
3. Password: `admin123` (o el que quieras)
4. Click **"Add user"**
5. Copia el **User UID** que aparece (ej: `abc123def456`)

6. En Firebase Console → **Firestore Database** → **Start collection**
7. Collection ID: `users`
8. Document ID: **pega el User UID** del paso anterior
9. Campos:
```
username: "admin"        (string)
displayName: "Administrador"  (string)
email: "admin@mannol.cu"      (string)
role: "admin"            (string)
active: true             (boolean)
createdAt: 1700000000000 (number — o escribe un número grande)
```
10. Click **"Save"**

---

## Paso 7: Subir a GitHub

1. Crea un repo en https://github.com/new
2. Nombre: `mannol-pos`
3. **Público** (para GitHub Pages gratis) o **Privado** (necesitas GitHub Pro)
4. Click **"Create repository"**

Desde tu computadora:

```bash
# Clonar repo
git clone https://github.com/TU_USUARIO/mannol-pos.git
cd mannol-pos

# Copiar todos los archivos de la app aquí
# (copia todo lo del ZIP excepto .git, node_modules)

# Agregar archivos
git add .

# Primer commit
git commit -m "MANNOL POS - PWA con Firebase"

# Subir
git push origin main
```

---

## Paso 8: Activar GitHub Pages

1. En tu repo GitHub → **Settings** → **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` → **/(root)**
4. Click **"Save"**
5. Espera 2-3 minutos
6. Tu app estará en: `https://TU_USUARIO.github.io/mannol-pos/`

---

## Paso 9: Instalar en los teléfonos

1. Abre `https://TU_USUARIO.github.io/mannol-pos/` en Chrome del móvil
2. Menú ⋮ → **"Agregar a pantalla de inicio"**
3. La app se instala como una app nativa

**Repite en todos los teléfonos** de todos los almacenes.

---

## ¿Cómo funciona la sincronización?

```
Teléfono A (Víbora)         Firebase (nube)         Teléfono B (Lisa)
─────────────────────        ───────────────        ─────────────────
Registra venta $25 ↓
                    →   saveSale()   →
                              ↓
                         Firestore guarda
                         la venta V-001
                              ↓
                              ↓ onSnapshot ↓
                              ↓              ↓
                              ↓         Ve V-001 al instante
                              ↓              ↓
                              ↓         Stock actualizado
                              ↓         automáticamente
```

### Tiempo real
- **Ventas**: cuando un teléfono registra una venta, TODOS los demás la ven al instante
- **Stock**: se descuenta automáticamente en todos los teléfonos
- **Tasas**: se sincronizan con elToque cada hora

### Offline
- Si un teléfono no tiene internet, las ventas se guardan localmente
- Cuando recupera conexión, se suben automáticamente a Firebase
- Todos los demás teléfonos las ven al instante

---

## Verificar que funciona

1. Abre la app en 2 dispositivos (o 2 pestañas)
2. En uno, registra una venta
3. En el otro, ve a "Ventas" → la venta aparece automáticamente

---

## Credenciales demo (sin Firebase)

Si aún no configuras Firebase, la app funciona en **modo demo**:
- **Admin**: `admin` / `admin123`
- **Vendedor Víbora**: `cen` / `central2025`
- **Vendedor Playa**: `ved` / `vedado2025`
- **PIN almacén**: `2025`

Pero los datos **NO se sincronizan** entre teléfonos en modo demo.

---

## Solución de problemas

### "Firebase no está configurado"
- Verifica que `js/firebase-config.js` existe y tiene credenciales reales
- El campo `isFirebaseConfigured` debe ser `true`

### "Permission denied"
- Despliega las reglas: `firebase deploy --only firestore:rules`
- Verifica que el usuario admin existe en Authentication + Firestore

### Las ventas no se suben
- Verifica conexión a internet
- Abre DevTools → Console para ver errores
- Verifica que las reglas de Firestore permiten escribir en `sales`

### GitHub Pages no carga
- Espera 5 minutos después de activar Pages
- Verifica que `index.html` está en la raíz del repo
- Si tu repo es privado, necesitas GitHub Pro para Pages
```
