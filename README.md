# 🛢️ MANNOL · Control de Ventas y Stock (PWA)

Sistema de control de ventas y stock en tiempo real para distribuidor MANNOL con múltiples almacenes. **PWA 100% estática** (HTML + CSS + JS vanilla + Firebase), instalable en móvil y funcional offline.

> ✨ **Sin build, sin Node.js** — solo abre `index.html` vía HTTP o súbelo a cualquier hosting estático (GitHub Pages, Netlify, Vercel, Firebase Hosting).

![PWA](https://img.shields.io/badge/PWA-installable-purple)
![Firebase](https://img.shields.io/badge/Firebase-12-orange)
![No build](https://img.shields.io/badge/build-no%20build%20needed-green)
![MANNOL](https://img.shields.io/badge/MANNOL-v10.2-emerald)

---

## ✨ Funcionalidades

### 🏠 Home Pública (sin login)
- **Tasas del día** (USD/MN y EUR/MN) con badge de fuente (elToque / Manual).
- **Margen aplicado** mostrado como banner amarillo ("Margen aplicado: +5% sobre tasa oficial").
- **Lista de almacenes** en cards oscuras con código, nombre, dirección y teléfono.
- Botón "Entrar al almacén" → solicita PIN.

### 🔐 Doble Sistema de Acceso
- **PIN de almacén** (por defecto `2025`): acceso rápido para vender sin cuenta. Cada almacén puede tener su propio PIN.
- **Login de admin** (usuario + contraseña): para administradores, gestores y vendedores. Acceso oculto (estilo triple-tap en logo MANNOL o vía enlace discreto).

### 🛒 Punto de Venta (POS)
- Catálogo de productos con búsqueda.
- Carrito con control de stock en tiempo real.
- **Ventas mono o multi-moneda** (USD, MN, EUR, Transferencia).
- Conversión automática usando la tasa del día.
- Asignación de tarjeta (BPA / BANDEC / BANMET) para transferencias.
- **FAB (botón flotante)** central en mobile para registrar venta rápidamente.

### 📱 Mobile Shell con Bottom Navigation
- **Bottom nav** fija con 4 secciones: Inicio, Ventas, Inventario, Más.
- **FAB central** esmeralda para registrar venta (siempre visible cuando hay sesión activa).
- **Drawer lateral** (menú hamburguesa) con todas las opciones + cierre de sesión.
- **Header sticky** con backdrop blur, logo MANNOL (gota esmeralda) y toggles de tema/refresh.

### 📦 Stock por Almacén
- Inventario independiente por almacén.
- **Descuento automático** al vender, **devolución** al cancelar.
- Alertas de stock mínimo y agotado.

### 💰 Comisiones
- **Vendedores**: porcentaje por almacén.
- **Gestores**: porcentaje independiente.
- **Cierre mensual** con marca de "pagado".

### 🏷️ Catálogo + Categorías
- Categorías y subcategorías con orden.
- Productos con SKU, precio USD, descripción e imagen.

### 💳 Transferencias
- Vista consolidada de transferencias por marca (BPA / BANDEC / BANMET).
- Filtrado por marca y estadísticas.

### 📱 PWA Offline
- **Instalable** en móvil (Add to Home Screen).
- **Funciona sin internet**: ventas en cola (IndexedDB), sincronización automática al recuperar conexión.
- Manifest con shortcuts ("Registrar venta", "Inventario").
- Iconos PWA con logo MANNOL (gota + M).

### 🌓 Modo Claro/Oscuro
- Toggle accesible en el header.
- Respeta preferencia del sistema.
- Paleta esmeralda (#10b981) como primario, con gradientes sutiles.

### 💱 Tasas elToque
- Sincronización con `api.elToque.com`.
- **Markup configurable** (% añadido a la tasa oficial).
- Fallback con tasas aproximadas si la API falla.

---

## 📁 Estructura del Proyecto

```
almacen-pos-pwa/
├── index.html                  # Página principal MANNOL
├── css/
│   └── styles.css              # Estilos + dark mode + componentes MANNOL
├── js/
│   ├── app.js                  # Bootstrap + router
│   ├── firebase.js             # Firebase SDK (CDN ESM)
│   ├── firebase-config.js      # ⚠️ TUS CREDENCIALES (gitignored)
│   ├── firebase-config.example.js  # Plantilla
│   ├── store.js                # Estado global (Zustand-like)
│   ├── auth.js                 # PIN + email/password
│   ├── firestore.js            # CRUD Firestore
│   ├── currency.js             # Conversión de monedas
│   ├── ui.js                   # Toast, modal, iconos SVG
│   └── views/
│       ├── home.js             # Home pública (tasas + almacenes)
│       ├── pin-login.js        # Login PIN de almacén
│       ├── user-login.js       # Login admin
│       ├── dashboard.js        # Mobile shell con bottom-nav + FAB + drawer
│       ├── sales.js            # POS multi-moneda
│       ├── sales-history.js    # Historial de ventas
│       ├── stock.js            # Inventario
│       ├── commissions.js      # Comisiones
│       ├── transfers.js        # Transferencias
│       ├── catalog.js          # Catálogo
│       ├── users.js            # Usuarios
│       └── settings.js         # Ajustes
├── icons/                      # favicon, icon-64/192/512, maskable
├── manifest.webmanifest
├── sw.js                       # Service Worker (offline queue)
├── offline.html                # Fallback sin conexión
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Configuración Rápida

### Paso 1: Crear proyecto Firebase
1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Crea un proyecto nuevo
3. Agrega una **Web App** (ícono `</>`) y copia la configuración
4. Habilita **Authentication → Email/Password**
5. Crea una **Cloud Firestore Database** (modo producción)
6. Habilita **Storage** para imágenes

### Paso 2: Configurar credenciales
```bash
git clone https://github.com/tu-usuario/mannol-pos.git
cd mannol-pos
cp js/firebase-config.example.js js/firebase-config.js
```

Edita `js/firebase-config.js`:
```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto-id.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:abcdef",
};
```

### Paso 3: Desplegar reglas
```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

### Paso 4: Crear el primer admin
1. En **Firebase Console → Authentication → Add user** (email + contraseña)
2. En **Firestore → users → Create document**:
   ```json
   {
     "email": "admin@mannol.com",
     "displayName": "Administrador",
     "role": "admin",
     "active": true,
     "createdAt": 1700000000000
   }
   ```

### Paso 5: Probar localmente
```bash
python3 -m http.server 8080
# Abre http://localhost:8080
```

> ⚠️ No abras `index.html` con `file://` — los módulos ESM requieren HTTP.

---

## 🚢 Despliegue

### GitHub Pages (gratis)
1. Sube el repo a GitHub
2. **Settings → Pages → Source: main branch**
3. URL: `https://tu-usuario.github.io/mannol-pos/`

### Firebase Hosting
```bash
firebase deploy --only hosting
```

### Netlify / Vercel
- Conecta el repo
- Build command: *(vacío)*
- Publish directory: `.`

---

## 👥 Roles y Permisos

| Rol | Accesos |
|-----|---------|
| **admin** | Todo: usuarios, almacenes, catálogo, stock, ventas, comisiones, transferencias, ajustes |
| **gestor** | Stock, ventas, comisiones, transferencias, catálogo |
| **vendedor** | Sus propias ventas y comisiones |
| **empleado_pin** | Solo POS (vender); accede vía PIN de almacén |

---

## 🗃️ Modelo de Datos

| Colección | Descripción |
|-----------|-------------|
| `users` | `{ email, displayName, role, active, warehouseIds, commissionRate }` |
| `warehouses` | `{ name, code, address, phone, pinCode, active, vendorCommissionRate, gestorCommissionRate }` |
| `categories` | `{ name, slug, icon, order }` |
| `subcategories` | `{ categoryId, name, slug, order }` |
| `products` | `{ name, sku, categoryId, subcategoryId, priceUSD, imageURL, active }` |
| `stock` | `{ warehouseId, productId, quantity, minQuantity, updatedAt }` |
| `sales` | `{ warehouseId, userId, items[], totalUSD, payments[], status, commissionUSD }` |
| `rates` | `{ currency, rateUSD, source, updatedAt }` |
| `commissions` | `{ userId, warehouseId, period, salesCount, totalUSD, commissionUSD, paid }` |
| `settings` | `{ pinCode, elToqueEnabled, elToqueMarkup, businessName, lastRateSync }` |

---

## 🎨 Diseño

### Paleta de colores (esmeralda)
- **Primario**: `#10b981` (esmeralda 500)
- **Primario dark**: `#34d399` (esmeralda 400, más brillante)
- **Fondo claro**: blanco cálido
- **Fondo dark**: gris azulado profundo (`oklch(0.16 0.015 220)`)
- **Acentos por moneda**: USD esmeralda, EUR violeta, MN cian, Transfer cyan
- **Warning**: ámbar para badges "Manual" y "Margen aplicado"

### Tipografía
- Sans-serif moderna (system font stack)
- Jerarquía clara con pesos 400/500/600/700

### Componentes
- **Cards** con bordes redondeados (radius 0.875rem) y sombras sutiles
- **Warehouse cards** con fondo oscuro semi-transparente + backdrop-blur (glassmorphism)
- **Bottom nav** con FAB central elevado
- **Drawer** lateral con animación slide-in

---

## 📱 PWA y Offline

### Instalación
- **Android (Chrome)**: menú ⋮ → "Agregar a pantalla de inicio"
- **iOS (Safari)**: botón compartir → "Añadir a inicio"
- **Desktop (Chrome/Edge)**: ícono de instalación en la barra de direcciones

### Modo offline
1. Service Worker cachea assets estáticos
2. Ventas offline se guardan en IndexedDB (`almacen-pos-queue`)
3. Al recuperar conexión, se sincronizan automáticamente

---

## 🛠️ Solución de Problemas

### La app no carga
- Verifica que abras vía `http://` (no `file://`)
- Revisa `js/firebase-config.js` (debe existir y tener credenciales válidas)
- Abre DevTools → Console para ver errores

### Las tasas muestran "Manual"
- La API elToque puede estar caída o rate-limited
- Se usan valores de fallback (USD=320, EUR=345 aprox.)
- Pulsa el botón 🔄 para reintentar

### No puedo iniciar sesión
- Verifica que el usuario existe en Authentication
- Verifica el documento en `users` con `active: true`
- El rol debe ser: `admin`, `gestor` o `vendedor`

### El PIN del almacén no funciona
- Por defecto es `2025` (configurable en Settings)
- Cada almacén puede tener su propio `pinCode` en Firestore

---

## 📝 Licencia

MIT License. Ver [LICENSE](LICENSE).

---

**Hecho con ❤️ para distribuidores MANNOL.**
