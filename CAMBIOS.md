# 📦 MANNOL POS — Actualizaciones aplicadas

## v5.23.1 (2026-11-25) — Limpieza del repositorio

- Se eliminan el asistente de configuración (`setup.html`, `js/setup-wizard.js`,
  `css/setup-wizard.css`): la conexión ya va en `js/supabase-config.js`. Los
  avisos que lo enlazaban ahora dicen qué revisar.
- Se eliminan `MEJORAS.md` y `REVIEW.md` (notas antiguas).

## v5.23.0 (2026-11-25) — Base de datos en un solo archivo + venta más clara

> ⚠️ Ejecuta **una vez** `supabase/instalar.sql` entero (Supabase → SQL Editor).
> Sirve para tu base actual: solo añade lo que falta y no borra datos.

- **`supabase/` pasa de 19 archivos a 3**: `instalar.sql` (todo; base nueva o
  existente; se puede repetir), `limpieza.sql` (opcional) y `README.md`. Se
  quitan también los datos de prueba (`seed.sql`): ya no hacen falta. Se borran `schema.sql`, `policies.sql`, `seed.sql`
  y los 15 `migration-*.sql`.
- Probado en PostgreSQL 16 con una copia del entorno de Supabase: base nueva,
  base a medio actualizar y ejecutarlo varias veces seguidas.
- Errores que tenían los SQL anteriores (corregidos dentro de `instalar.sql`):
  `schema.sql` fallaba en una base nueva (`settings` antes que `warehouses`);
  la v3 no creaba `card_movements` (tipo de `sale_id` distinto al de `sales.id`);
  la de marcas usaba `is_admin()` antes de crearla; y los permisos por columna
  de tarjetas caían si faltaba `initial_balance`.
- **Seguridad**: `card_movements` (movimientos de tarjeta) y `stock_transfers`
  (traspasos) no tenían RLS: cualquiera con la clave pública podía leerlas o
  escribirlas. Ahora solo usuarios con cuenta; el acceso por PIN solo puede
  anotar el cobro por transferencia de una venta. Ninguna tabla queda sin RLS.
- Documentación: `INSTALACION_SUPABASE.md` y `MANUAL_SETUP.md` (desactualizados)
  se sustituyen por `supabase/README.md`. El asistente de configuración y el
  admin apuntan a `instalar.sql`.
- **Catálogo de ventas en filas compactas**: miniatura, nombre, precio y stock en
  una fila; botón + grande; − y la cantidad aparecen al añadir. Caben el doble.
- **Venta en pasos**: «1 Productos» (con unidades y total) y «2 Cobro». El gestor
  y la nota quedan plegados en «Gestor y nota (opcional)» y muestran lo elegido.

## v5.22.1 (2026-11-25) — La app ya no se cae en navegadores sin notificaciones

- `push-notify.js` leía `Notification.permission` al cargar: en navegadores sin
  esa función (visores integrados, WebView de Android) la app no arrancaba y
  mostraba «No se pudo cargar la app». Ahora se comprueba antes.

## v5.22.0 (2026-11-25) — Diseño más claro, sin quitar nada

- **Almacén en 3 pestañas** en el teléfono: **Hoy** (resumen, lo ganado, pedido
  sugerido, ventas recientes) · **Inventario** (stock, otros almacenes,
  solicitudes, pedido sugerido; con el número de productos bajos) · **Caja**
  (cierre de caja; un punto avisa si falta cerrar). En PC se ve todo a la vez.
- **Resumen como tarjeta oscura** protagonista: cifras más grandes y colores
  por moneda.
- **Color propio por almacén** (inicio y cabecera del almacén), con su código.
- **Catálogo de ventas en cuadrícula**: tarjetas con foto, botones − / + grandes
  (44 px), «Agotado» / «Quedan N» sobre la foto; tocar la foto añade una unidad.
- **Venta registrada**: confirmación grande ✓ de un segundo (no bloquea) además
  del aviso con «Deshacer».
- La moneda elegida se marca con su propio color; total a cobrar más grande.

## v5.21.0 (2026-11-25) — Mejoras: recargos, traspasos al instante, historial y pedido sugerido

> ⚠️ **Ejecutar una vez** `supabase/migration-v5.21.sql` (después de la v5.20).

- **Recargos del pago mixto desde el admin** (Admin → Tasas → «Pago mixto»):
  qué botones ve el vendedor (+10, +20, +15…) y cuál viene marcado. Sin la
  migración la app sigue funcionando con +10/+20.
- **Solicitudes de traspaso**: tarjeta «Solicitudes por aprobar» en el
  Dashboard del admin y botón **Aprobar** en el aviso que aparece al llegar una
  nueva. Dos toques en el mismo botón (sin ventanas). La tabla se añade al
  tiempo real y, de respaldo, se revisa cada 45 s.
- **Historial**: en el detalle de una venta, **WhatsApp**, **Copiar ticket** y
  **Vender de nuevo** (carga los productos en el carrito con el precio de hoy).
  En pagos mixtos se ve la tasa usada en MN («1 USD = 330 MN · +10»). El acceso
  por PIN ya puede ver el Historial (sin anular ventas) y la barra de abajo
  muestra Historial para todos.
- Corregido: en el detalle, una venta en EUR/MN mostraba el total en USD con
  el símbolo de la otra moneda.
- **Pedido sugerido** en el almacén: lo agotado, bajo mínimo o que se acaba en
  menos de una semana, con la cantidad para ~2 semanas según las ventas de los
  últimos 30 días. Se puede pedir a otro almacén con un toque (cantidad ya
  puesta) o enviar la lista por WhatsApp.

## v5.20.0 (2026-11-25) — Correcciones de uso diario

> ⚠️ **Ejecutar una vez** `supabase/migration-v5.20.sql` en Supabase → SQL Editor
> (permisos de traspasos/cierre para el acceso por PIN + login con usuario).

- **Catálogo de ventas**: los productos agotados van al final (catálogo,
  búsqueda rápida e inventario del almacén).
- **Pago mixto**: al escribir lo que paga en USD (o EUR / transferencia) se
  calcula solo el resto en MN, a la tasa del día **+10 o +20 MN por cada USD**
  (selector «Tasa / +10 / +20», se recuerda por almacén). Si se escribe el MN a
  mano, manda el vendedor; vaciarlo vuelve al cálculo automático.
- **Sin ventana tras registrar la venta**: se quitó el cartel «Copiar / Nueva
  venta». Queda un aviso que no bloquea, con «Deshacer» durante 8 s.
- **Traspasos**: «Solicitar traspaso» fallaba siempre desde el PIN (el id de la
  sesión PIN no es UUID y la tabla solo aceptaba usuarios con cuenta). Además
  «Pedir desde otro almacén» llamaba a una función inexistente.
- **Cierre de caja**: el total en USD no se guardaba (`total_u_s_d`).
- **Volver** (barra del almacén): ahora sale del almacén y vuelve a la lista.
- **Barra de abajo**: «Más» (repetía el menú ☰) pasa a ser **Historial**
  (o **Estado** en el acceso por PIN).
- Se quitó el botón grande «Registrar venta» del centro: el 🛒 de abajo
  siempre está.
- **Ventas**: botón «Volver» arriba, y el botón atrás del teléfono vuelve a
  Inicio en vez de salir de la app.
- **Iniciar sesión en otros equipos**: se puede entrar con usuario o email;
  el email no distingue mayúsculas; la configuración publicada
  (`js/supabase-config.js`) manda sobre una configuración vieja guardada en el
  equipo; si la librería no carga, mensaje claro en vez de «Credenciales
  incorrectas (modo demo)»; se ocultan las credenciales demo.

## v5.19.0 (2026-11-25) — Escribir ya no se corta: el formulario no se redibuja solo

La vista de ventas se redibujaba COMPLETA cada vez que llegaban datos nuevos
(stock actualizado, productos, cola de subida). Si en ese instante estabas
escribiendo la nota, el vuelto o un monto del pago mixto, el campo se recreaba
y se perdía el foco (y el cursor). Es el refactor que estaba en la lista desde
v5.18: el render se divide en paneles y las actualizaciones automáticas ya no
tocan el formulario.

- **Datos en vivo sin redibujar**: las suscripciones (productos, stock, gestores
  y tarjetas, más vendidos, cola de subida) repintan SOLO los fragmentos que
  cambian — insignias del encabezado («En línea», «N por subir»), chips «Más
  vendidos», resultados de la búsqueda rápida, textos de stock del carrito y
  del producto mayorista. La nota, los montos y los inputs del pago no se
  recrean: lo que escribes sigue ahí, con el cursor donde estaba.
- **Búsqueda rápida más ligera**: cada tecla repinta únicamente la lista de
  resultados (antes re-renderizaba toda la venta y había que devolver el foco
  a mano — parche que desaparece).
- **La nota se guarda sola**: el borrador de la venta a medias se guarda
  mientras escribes (con un pequeño descanso), no solo al hacer otra acción.
- Todo lo demás queda igual: carrito, pago mixto, vuelto, teclado de billetes,
  validaciones, deshacer, catálogo. Verificado en navegador: escribir sin perder
  el foco, añadir desde resultados y chips, borrador al escribir, pago mixto con
  «Resto», cancelar con confirmación, pestaña mayorista — sin errores.

## v5.18.1 (2026-11-25) — El ticket ya no se comparte por WhatsApp

A petición del dueño: fuera el envío del ticket por WhatsApp/SMS.

- **Sin «Compartir» en el ticket**: al registrar la venta, el ticket se muestra con su
  texto y los botones «Copiar» (portapapeles) y «Nueva venta». Nada se manda a WhatsApp
  ni SMS; si el cliente lo pide, se pega a mano donde haga falta. La nota bajo el ticket
  ya no menciona WhatsApp.
- El «Compartir» de la tarjeta «Cierre de hoy» del dashboard sigue igual: es del cierre,
  no de la venta.

## v5.18.0 (2026-11-25) — Cobro más rápido y «¿ya se subió mi venta?» en una pantalla

Mejoras de uso diario en el mostrador y de visibilidad del estado del equipo.
Nada de flujo nuevo de venta: mismas pantallas, mismos pasos, menos toques.
Sin migración de base de datos (solo si ya instalaste v5.17, sigue igual de válido).

### En el cobro (Ventas)

- **Teclado rápido de billetes**: bajo «¿Con cuánto paga el cliente?» hay chips con los
  billetes comunes ($5/10/20/50/100, €5/10/20/50, ₱500/1000/2000/5000) y «Exacto» con el
  total convertido a la moneda elegida. Un toque llena el campo completo — se acabó
  teclear cifras en el teléfono.
- **Moneda de cobro por defecto**: la app recuerda la última moneda/método que se usó en
  cada almacén y la próxima venta abre ya preseleccionada (pago mixto incluido). Se guarda
  por almacén en este equipo; cancelar la venta no la cambia.
- **El error se ve en su campo**: si falta la tasa de una moneda o el pago mixto se pasa
  del total, el input concreto queda marcado en rojo (y se limpia solo al corregirlo). Si
  falta elegir la tarjeta de la transferencia, el foco salta al selector.
- **Deshacer con cuenta atrás**: el ticket ahora dice «Deshacer · 10 s» y va contando;
  el botón se deshabilita en cuanto la venta empieza a subirse (antes daba error al tocar).
- **Vibración al añadir** productos (desde chips, catálogo y búsqueda): confirmación
  táctil de que entró a la venta.

### En el catálogo

- **Favoritos del almacén**: al abrir el catálogo sin filtros, la primera fila son los 8
  productos que más se venden en ESE punto (con stock), y debajo «Todos los productos».

### Estado del equipo (nuevo en el menú)

- **Nueva vista «Estado del equipo»**: responde de un vistazo «¿ya se subió mi venta?».
  Muestra si hay conexión o está subiendo, cuándo fue la última subida correcta, el
  último error (con código, motivo y venta) y TODAS las ventas guardadas en este equipo
  agrupadas por almacén, cada una con su estado (en espera / subiendo / error / para
  revisar). Botones «Subir ahora» y «Ver detalle» (la lista clásica con copiar/descartar).
  Está en el menú lateral para todos los roles y en la búsqueda Ctrl+K; se actualiza viva.
  El banner de siempre sigue funcionando; esta vista es el cuadro completo.

### Dashboard

- **Cierre de hoy con un toque**: tarjeta nueva con el total del día por moneda (los
  mismos números del cierre de caja), ventas y unidades, y botón para compartirlo por
  WhatsApp (o copiarlo). Solo aparece si hubo ventas hoy.

### Admin (accesibilidad)

- Los botones de solo ícono de las tablas (desactivar usuario, stock, eliminar producto,
  revelar PIN, añadir/ajustar stock) ahora tienen `aria-label` descriptivo además del
  tooltip: los lectores de pantalla ya no leen «botón» a secas.

### Interno

- `payment-utils.js`: `billPresetsFor()` y `normalizePaymentPreference()` (puras,
  testeadas). `offline-queue.js`: `groupPendingByWarehouse()` (pura; la usan la vista
  nueva y el modal «Ventas en espera»). Nueva vista `js/views/team-status.js` en el
  precache del SW. Cache del SW → v40 (fuerza actualización en los teléfonos).

## v5.17.0 (2026-11-25) — Seguridad del PIN y de las tarjetas, sincronización a prueba de atascos y cobro más rápido

Punto de partida: la revisión externa de v5.15.0 (bugs, seguridad y diseño). Parte de eso ya
estaba en v5.16.0; esta versión cierra el resto, empezando por lo urgente.

**MIGRACIÓN OBLIGATORIA**: ejecutar una vez `supabase/migration-v5.17-seguridad.sql`
(re-ejecutable). Sin ella, el acceso por PIN sigue funcionando por compatibilidad, pero la
fuga de seguridad no queda cerrada. Instalaciones nuevas ya lo llevan todo en
`schema.sql` + `policies.sql`.

### Seguridad (lo más urgente del informe)

- **El PIN se valida en el SERVIDOR.** Antes la app comparaba el PIN contra la columna `pin`
  leída con la clave pública (cualquiera con la anon key obtenía todos los PIN de almacenes y
  el PIN global de Ajustes). Ahora:
  - Nueva RPC `verify_warehouse_pin(código, pin)`: valida en la nube (PIN propio del almacén
    o, si no tiene, el PIN global, igual que hacía la app) y devuelve solo los datos públicos
    del almacén. El PIN en claro nunca sale de la base de datos.
  - Límite de intentos en el SERVIDOR: 5 PIN incorrectos por almacén en 10 minutos → la RPC
    rechaza y dice cuánto esperar. El límite del navegador era localStorage: se saltaba.
  - Para poder entrar SIN conexión, el login correcto guarda un **hash** (SHA-256 con sal) en
    el equipo y la app revalida con WebCrypto. Sin el PIN correcto nadie obtiene el hash.
  - `anon` pierde el permiso de leer `pin`, `pin_code`, `pin_salt` y `pin_hash` (grants por
    columna). El admin sigue viendo/editando los PIN en sus paneles.
- **Tarjetas: solo los últimos 4 dígitos.** Nueva columna `last4` (calculada sola); `anon`
  ya no puede leer el número completo. Las ventas guardan solo los 4 últimos y la migración
  recorta los números completos de las ventas antiguas. El admin conserva el número completo
  para editar la tarjeta; las pantallas de vendedor muestran `···· 4567`.
- **`deduct_sale_stock` ya no se ejecuta desde anon** (cualquiera podía restar stock). Se
  revoca cuando existe `register_sale` (migration-v5.13), que es la RPC que usa la cola.
- **Las ventas insertadas desde anon exigen `warehouse_id`** (antes `with check (true)`).
- Queda documentado (nota en la migración): la LECTURA de ventas/stock por anon es el modo
  offline-first de la app; cerrarla del todo exige sesiones en el servidor (trabajo futuro).

### Sincronización (bugs de la revisión)

- **El movimiento de tarjeta ya no se pierde**: iba dentro de un `catch {}` vacío; ahora se
  reintenta 3 veces y, si sigue fallando, aparece en el error de sincronización del banner.
- **Stock descontado en falso, arreglado**: en la ruta antigua, un fallo que no era de red al
  descontar marcaba el producto como hecho igualmente. Ahora el error sube y se reintenta.
- **Los errores no-red ya no se reintentan para siempre**: tras 10 intentos la venta pasa a
  «para revisar» con el motivo visible (`sync_failed`), en vez de reintentar cada 60 s eternamente.
- **«Deshacer» una venta en espera**: el ticket tras cobrar tiene «Deshacer» mientras la venta
  siga en la cola de este equipo (la retira y devuelve el carrito, la nota y el pago tal
  cual estaban) y el botón principal pasa a «Nueva venta». Si ya se está subiendo, avisa y
  sugiere anularla desde Historial.
- **Actualización sin sustos**: el service worker nuevo ya NO toma el control solo al
  instalar (antes `skipWaiting` + recarga automática podía borrar una venta a medias).
  Espera a que la persona toque «Actualizar» en el banner. El borrador del carrito de v5.16
  queda como segunda red de seguridad.

### Cobro e interfaz

- **Cantidad editable en el carrito**: se toca el número y se escribe la cantidad (con tope
  de stock y aviso «Sin stock suficiente: quedan N»), en vez de dar «+» diez veces.
- **«Stock guardado de hace X min»**: cuando no hay conexión, el banner (y el de Ventas)
  dice la antigüedad de los datos que se ven; el service worker sirve la copia guardada y
  antes eso era invisible. Nuevo módulo `js/data-freshness.js`.
- **Accesibilidad**: `aria-label` en los botones de solo ícono del carrito y del catálogo
  (añadir/quitar unidad), y más separación entre «+», «−» y «quitar» en pantallas táctiles.
- **El drawer del dashboard se cierra con Escape** (pendiente del REVIEW.md).
- **Código muerto eliminado**: `setup-wizard-v5.0.2.js` (55 KB idénticos a `setup-wizard.js`);
  `setup.html` carga directamente el canónico.

### Notas técnicas

- `listWarehouses()` / `getSettings()` / `listCards()` usan listas de columnas seguras (con
  `select *` darían error de permiso tras la migración). Variantes nuevas solo-admin:
  `listWarehousesAdmin()`, `getSettingsAdmin()`, `listCardsAdmin()` y
  `listCardsWithBalances({ includeNumber: true })`.
- El login por PIN guarda `mannol-pin-meta-<código>` (sal, hash y longitud) para el modo sin
  conexión y el auto-envío al completar los dígitos.
- `maskCard()` ahora también formatea valores ya recortados (`···· 4567`).
- Pruebas nuevas: hash/verificación de PIN, frescura de datos, bloqueo por intentos y
  «deshacer» de la cola (se detalla al final de esta sección en el repositorio).

## v5.15.0 (2026-11-23) — Barra flotante en el teléfono y nuevo formulario de producto

- **Barra superior en el teléfono**: en v5.13.2 solo se arregló en PC. En el teléfono y la tableta
  seguía siendo una franja cuadrada pegada a los bordes. Ahora flota separada de los bordes, con
  esquinas redondeadas, borde fino y sombra, igual que en PC y que las tarjetas. Vale para todas
  las pantallas y para los temas claro y oscuro. Con la app instalada en iPhone, la franja de la
  hora queda tapada para que el contenido no asome detrás.
- **Panel admin**: su barra superior también flota, en el teléfono y en PC.
- **Marca: ahora salen todas**. Antes era un campo con sugerencias que solo mostraba las marcas
  que coincidían con lo escrito. Como un producto nuevo empezaba con «MANNOL» puesto, las demás
  marcas añadidas no salían nunca.
  - Todas las marcas (las de Admin → Marcas y las que ya tienen los productos) salen como
    botones: se toca una y queda elegida.
  - «Otra marca» sirve para escribir una nueva. Se guarda bien escrita («fuchs titan» → «Fuchs
    Titan») y se añade sola a la lista de marcas, así que la verán todos.
  - Si la marca ya existe, aunque se escriba distinto («castrol»), avisa y usa la que ya está,
    sin duplicarla.
- **Formulario de producto rediseñado** (Admin → Productos → Nuevo / Editar):
  - Está en 5 bloques con título: Producto, Precio y stock, Comisiones, Venta por caja y Foto.
  - Al escribir el nombre se eligen solos la marca, la viscosidad y el tipo. Se pueden cambiar.
  - Al poner precio y costo se ve la ganancia por unidad («Ganas 7.00 USD por unidad»), o
    «Pierdes» en rojo si el costo es mayor.
  - La comisión del vendedor va primero, porque es la que suma en «Lo que llevas ganado». Si
    queda en 0, el formulario lo avisa.
  - La venta por caja se enciende con un interruptor. Se ponen los pomos por caja y los precios
    «desde N cajas» en filas, con el total por caja ya calculado. Antes había que escribir esos
    precios a mano en formato de código (JSON).
  - Los números aceptan coma o punto (22,50 o 22.50), y en el teléfono sale el teclado numérico.
  - Cada error sale en rojo debajo de su campo y no se guarda hasta corregirlo. El precio de
    venta ahora es obligatorio (antes se podía guardar un producto a 0).
  - Si se toca fuera del formulario con cambios sin guardar, pregunta antes de cerrarlo.
  - El interruptor «Se puede vender» oculta un producto de la venta sin borrarlo.
- **Arreglos**:
  - Editar un producto lo volvía a activar siempre. Ahora respeta «Se puede vender».
  - Si se cambiaba la foto pegando otro enlace, la lista seguía mostrando la miniatura de la foto
    vieja.
  - Venta por caja: el último precio vale para cualquier cantidad mayor. Antes, pasando el tope
    del último tramo, se volvía al precio de 1 caja. Se aplica al guardar el producto.
- **Pruebas**: 262, de ellas 42 nuevas: la lógica del formulario, el formulario en pantalla
  (marcas, errores, venta por caja, guardado) y que todo lo que carga la app y el admin quede
  guardado para abrir sin conexión.

## v5.14.0 (2026-11-23) — Lo que lleva ganado el vendedor

- **El vendedor ve lo que lleva ganado** en su pantalla (al entrar con el PIN del almacén y
  también si entra con usuario). La tarjeta «Lo que llevas ganado» muestra:
  - lo del mes en curso, lo de hoy y cuántas ventas y productos cuentan;
  - **lo del mes pasado**, para saber cuánto cobrar;
  - «Ver detalle por producto», con de dónde sale cada importe.
- **Cálculo**: monto fijo por cada producto vendido, el que configuras en Productos →
  «Comisión del vendedor (por unidad)», en MN o USD.
  - Cuenta lo que tenía el producto cuando se vendió: si cambias la comisión, vale para las
    ventas nuevas. En mayorista va por caja.
  - Solo cuentan las ventas completadas. Las pendientes salen aparte («por confirmar») y las
    canceladas no cuentan.
  - Las ventas hechas sin conexión cuentan, y la tarjeta avisa que están por subir.
- **Dos vendedores en un almacén** (uno de lunes a viernes y otro sábado y domingo):
  - Se configura en Admin → Almacenes → Editar → «¿Quién vende en este almacén?», con los
    nombres opcionales.
  - Cada venta cuenta para quien trabaja ese día.
  - En la pantalla salen los dos importes, con «Hoy» en el turno del día.
- **Admin → Comisiones vendedores** (antes «Comisiones locales»):
  - Muestra lo de cada almacén y turno por mes, con exportación CSV, y avisa de los productos
    sin comisión de vendedor.
  - Antes calculaba un % de lo vendido por almacén, que no es como se paga a los vendedores.
    El % es de los gestores, se configura en cada gestor y no cambia.
- **Arreglos**:
  - Guardar un almacén desde el admin (crear o editar) fallaba en silencio: el formulario
    mandaba un dato interno que la base de datos rechazaba, y aun así decía «Almacén guardado».
    Ahora guarda y, si algo falla, lo dice. Además, editar ya no manda el almacén al final de
    la lista.
  - Los totales de comisión por venta nunca llegaban a la base de datos, porque el nombre del
    campo se convertía mal. No se perdió nada: cada producto vendido guarda su comisión y de ahí
    se calcula todo. La exportación de ventas del admin también se calcula así.
- **Migración**: ejecutar una vez `supabase/migration-v5.14-vendedores.sql`, que añade 3
  columnas a almacenes y se puede repetir sin problema. Sin ella todo funciona, pero no se puede
  guardar quién vende (el admin lo avisa al guardar).
- **Pruebas**: 220, de ellas 25 nuevas (cálculo, mayorista, meses, turnos, guardado de
  almacenes). También se comprobó contra PostgREST 12, el mismo servidor de Supabase, con 2500
  ventas en un mes.

## v5.13.2 (2026-11-23) — La app en PC: menú fijo y barra superior flotante

En la computadora (pantallas de 1024 px o más) la app se veía mal: el contenido quedaba corrido a
la derecha con una franja vacía de 288 px a la izquierda, la barra superior era un bloque cuadrado
de borde a borde (desalineado con las tarjetas) y no había navegación visible (la barra inferior se
oculta en PC y el menú solo salía al tocar ☰). Causa: el CSS reservaba el sitio de un menú fijo que
la app nunca dibujaba.

- **Menú lateral fijo** a la izquierda, flotante y redondeado, oscuro como el del panel admin:
  logo, usuario, secciones (con la activa marcada), pantalla completa, cerrar sesión y atajos de
  teclado. Respeta los mismos permisos que antes. En portátiles de 768 px de alto se desplaza
  entero, así que ninguna sección queda escondida.
- **Barra superior flotante y redondeada**, alineada exactamente con el contenido; muestra la
  sección actual (Inicio, Ventas, Inventario…) en lugar de repetir el logo, que ya está en el menú.
- **Contenido centrado** con ancho máximo (antes se estiraba de lado a lado).
- **Almacén en 2 columnas** desde 1280 px: Resumen (4 cuadros en una fila) y Registrar venta a
  la izquierda, Cierre de caja a la derecha; debajo Inventario y Ventas recientes.
- **Inicio (elegir almacén)** más ancho, con los almacenes en 2 columnas y la barra flotante
  (antes era la columna del teléfono en medio de la pantalla).
- Fondo sin la banda oscura diagonal que partía la página en dos detrás de las tarjetas (como en el
  móvil desde la v5.11); un brillo verde muy suave.
- Avisos abajo a la derecha (arriba tapaban los botones de la barra). El botón flotante de kiosko
  se oculta cuando está el menú fijo (la misma opción está en el menú).
- **En el teléfono no cambia nada** (comparado píxel a píxel con la versión anterior).
- Pruebas: 195 (6 nuevas del menú en PC: fijo en PC, igual que antes en el móvil, sección activa,
  atajos, cambio PC ↔ móvil).

## v5.13.1 (2026-11-23) — Logo nuevo: gota de aceite + engranaje

- **Logo nuevo**: gota de aceite dorada sobre un engranaje blanco, con el verde de la app. Está en:
  - el ícono del teléfono al instalar la app (Android, iPhone y computadora) y en la pestaña del
    navegador;
  - la cabecera, el inicio, el menú lateral y el panel admin (antes había una gota genérica).
- Íconos preparados para cada sistema:
  - Android: ícono "a sangre" (sin bordes) para que el teléfono lo recorte con su forma (círculo,
    cuadrado redondeado…); antes el de 192 px tenía esquinas transparentes.
  - iPhone: ícono propio de 180 px y opaco; antes usaba uno con esquinas transparentes y salían negras.
  - Favicon de 32 px para la pestaña del navegador; el admin también tiene ícono ahora.
  - En tamaños pequeños el dibujo va más grande para que se distinga.
- El logo queda guardado para verse sin conexión (caché v34).
- Los 3 toques en el logo del inicio siguen abriendo el acceso admin.
- Pruebas: 189 (8 nuevas: tamaños, íconos opacos para Android/iPhone y guardado sin conexión).
- **En teléfonos que ya tienen la app instalada**:
  - Chrome en Android cambia el ícono solo en uno o dos días.
  - En iPhone y en otros navegadores (Yandex, etc.) hay que quitar el ícono de la pantalla de inicio y
    volver a agregarlo.
  - Dentro de la app el logo nuevo sale enseguida.

## v5.13.0 (2026-11-23) — Abrir y vender sin conexión, sin mezclar almacenes

- **La app abre sin internet.** La versión publicada nunca llegaba a instalar su modo sin conexión:
  el service worker se registraba al evento `load` de la página, que ya había pasado cuando cargaba
  `app.js` (verificado en el sitio publicado: 0 registros). Ahora se registra siempre.
  - La librería de Supabase va incluida en la app (`js/supabase-js.min.js`, antes venía de un CDN que
    sin internet fallaba y la app caía en **modo demo con almacenes de prueba**).
  - Sin conexión la app usa los últimos datos reales guardados en el equipo (almacenes, PIN, tasas,
    productos, stock, tipos, marcas, tarjetas, gestores). **Basta abrirla una vez con internet**: en
    segundo plano guarda lo necesario para vender en *cualquier* almacén de ese equipo.
  - El modo demo depende solo de la configuración (sin internet ya no aparecen datos de prueba).
  - Inicio sin conexión: aviso "almacenes guardados en este equipo"; si es la primera vez y no hay
    datos, lo explica con un botón Reintentar.
- **Cada venta se guarda primero en el equipo** (cola propia, ya no dentro del estado general donde
  podía pisarse; sin el tope de 500 que descartaba las más viejas) y se sube sola al volver internet
  (al reconectar, al abrir la app y cada 30 s; reintentos con espera creciente).
  - Ticket inmediato; sin conexión dice "Pendiente de subir" y a qué almacén se subirá.
  - "N por subir" en la venta; "Por subir" en el historial (sin acciones de estado hasta que suba).
  - Aviso con las ventas en espera: las de **este almacén** y, aparte, las de **otros almacenes**
    hechas en el mismo equipo. "Ver" las lista agrupadas por almacén; "Subir ahora".
  - El stock a la vista ya descuenta las ventas pendientes del mismo almacén.
- **Nunca se mezclan almacenes:**
  - Código de venta con el prefijo del almacén y sin repetirse (`VIB-2Q7P30RH`; el anterior `V-12345`
    se repetía cada 100 segundos).
  - Cada venta sube a SU almacén y descuenta SU stock, en una sola transacción en la nube (RPC
    `register_sale`, migración v5.13): o se guarda todo o nada.
  - Sin duplicados aunque la conexión se corte justo al subir (la nube reconoce la venta por su
    referencia única y no la guarda ni descuenta dos veces).
  - Ventas hechas con almacenes/productos de prueba o cuyo almacén ya no existe quedan "para revisar"
    (no se suben a otro almacén); se pueden copiar o descartar desde "Ver".
  - Antes una venta que fallaba a medias se reintentaba sin descontar el stock, y sin la librería
    cargada se daba por subida sin subirse: corregido.
- **Correcciones:**
  - Historial: con más de 50 ventas la vista fallaba (ReferenceError en la paginación).
  - Cancelar una venta completada no devolvía el stock (la función de la BD leía `productId` y las
    ventas guardan `product_id`) — corregido en la migración v5.13.
  - El indicador "Sin conexión" tapaba los botones de la cabecera; ahora cuelga bajo la cabecera y
    se oculta donde ya hay aviso. Textos de aviso con más contraste.
  - Los atajos de teclado respetan los permisos del menú (un PIN ya no abre Historial ni Gestores).
  - Doble toque en "Registrar venta" ya no puede registrar dos veces.
  - Con una hoja abierta (ticket, ventas en espera…) los avisos salen arriba: abajo tapaban el
    final del ticket.
- Pruebas: 181 (antes 139): cola, códigos, subida con nube simulada (respuesta perdida, sin red,
  almacén borrado, dos almacenes), historial. E2E con service worker real: primera visita con
  internet → sin conexión → ventas en dos almacenes → al volver internet cada una en su almacén, una
  sola vez, con el stock correcto. Migración probada en PostgreSQL 17 (dos veces seguidas, rol anon,
  concurrencia).
- **Pasos:** ejecutar `supabase/migration-v5.13-offline-sales.sql` una vez en Supabase → SQL Editor;
  luego abrir la app una vez con internet en cada equipo.

## v5.12.0 (2026-11-23) — Catálogo de venta por tipo y marca

- **Catálogo de venta con filtros de un toque** ("Abrir catálogo" / "Agregar más productos"):
  - Fila **Tipo**: Refrigerante, Líquido de freno, Filtros, Lubricantes, Aditivos y los que se creen
    en el admin. Fila **Marca**: MANNOL, Royal y las que se añadan. Cada chip dice cuántos productos
    hay; se combinan entre sí y con el buscador (p. ej. Royal + Refrigerante).
  - Los contadores se cruzan: al elegir una marca se ve cuántos hay de cada tipo en esa marca (los
    que quedan en 0 se atenúan). Tocar el chip elegido lo quita.
  - Solo aparecen tipos y marcas con productos; la fila de marcas, cuando hay 2 o más.
  - Si una búsqueda no da resultados con los filtros puestos, ofrece "Ver N en todo el catálogo".
  - El buscador ignora tildes y mayúsculas y busca todas las palabras (nombre, marca, código, viscosidad).
  - **En vivo**: lo que el admin cambia aparece en la venta sin recargar.
- **Admin → Categorías** (tipos de producto): botón "Crear las que faltan" para los 5 tipos, cuántos
  productos tiene cada uno, y al eliminar una categoría se elige a qué tipo pasan sus productos. Al
  borrar una subcategoría sus productos pasan a la principal. Ya no dice "guardada" si Supabase la
  rechazó (antes el error se perdía).
- **Admin → Marcas** (nuevo): lista con colores y orden, cuántos productos tiene cada una, "Añadir
  MANNOL y Royal" y "Añadir las marcas de tus productos". Al renombrar una marca se puede cambiar
  también en sus productos. Si falta la tabla en Supabase, explica los 4 pasos y copia el SQL.
- **Admin → Productos → "Tipos y marcas"** (Organizar productos): todos los productos en una lista
  con su tipo y su marca para cambiarlos de una vez; "Sugerir automáticamente" propone el tipo por el
  nombre (filtro, freno/DOT, refrigerante, aditivo, aceite/viscosidad) y la marca. Solo cambia tipo y
  marca (no toca precios ni imágenes). Unifica marcas escritas distinto ("mannol" → "MANNOL").
- Formulario de producto: la marca se elige de la lista (o se escribe una nueva, que se añade sola a
  Marcas; en minúsculas se capitaliza). El tipo muestra su ícono y las subcategorías.
- Filtros por tipo y marca también en Admin → Productos e Inventario (incluyen subcategorías; antes
  "Aceites de motor" no mostraba los productos de "Sintéticos").
- La tabla de productos del admin muestra el nombre actual de la categoría (antes, el guardado en el
  producto, que quedaba viejo al cambiarla).
- **Supabase**: `supabase/migration-v5.12-brands.sql` (una vez, en SQL Editor). Crea la tabla `brands`
  (todos leen, solo el admin escribe), añade MANNOL, Royal y las marcas de los productos, y crea los
  tipos que falten sin tocar las categorías existentes. Probado en PostgreSQL 17 con el esquema real:
  2 ejecuciones seguidas sin duplicar, permisos por rol (PIN lee; vendedor no escribe; admin sí).
- Modo demo (vista previa): categorías, marcas y productos editados en el admin quedan guardados en
  el navegador y la app los ve al instante. Datos demo con los 5 tipos y productos Royal.
- Tests: `tests/catalog-facets.test.js` (14 nuevos · 139 en total).
- Archivos: `js/catalog-facets.js` y `supabase/migration-v5.12-brands.sql` (nuevos) · `js/db.js` ·
  `js/demo-data.js` · `js/supabase.js` · `js/ui.js` · `js/views/` sales, admin, stock, catalog ·
  `css/mobile-ux.css` (§10) · `supabase/README.md` · `sw.js` (v32) · `js/version.js` · `package.json`.

## v5.11.0 (2026-11-23) — Pulido móvil: más relieve, menos peso

- **Textos apretados en una columna (0 en toda la app; antes 3)**:
  - **Admin → Transferencias → Solicitudes del personal**: el nombre del producto salía en 6 líneas
    de ~59 px y los datos en 17. Ahora cada solicitud es una ficha: producto + cantidad + estado
    arriba, origen → destino con el código como etiqueta, "Pedido por…", la nota y
    **Aprobar / Rechazar** como dos botones iguales debajo (en computadora, los botones a la derecha).
  - **Admin → Movimientos**: el aviso "¿Querés mover mercancía…?" (título en 5 líneas de 80 px)
    ahora tiene el texto a lo ancho y el botón "Nueva transferencia" debajo. Faltaba su icono.
- **Más relieve**: tres niveles de superficie en los dos temas (página → tarjeta → lo de adentro).
  Las filas dentro de una tarjeta (saldos de tarjetas, ranking, ventas recientes, solicitudes, filas
  de las tablas-tarjeta) tienen su propio tono, borde y canto de luz; en oscuro, la página es más
  oscura y las tarjetas un poco más claras, con bordes más visibles.
- **Secciones pesadas en el teléfono** (−16 % de alto en las 25 pantallas de largo fijo):
  - **Stock general**: los 4 almacenes en un carrusel que se desliza (antes uno debajo de otro);
    casillas "Solo bajo mínimo / agotados" como botones de 44 px. 3172 → 2061 px.
  - **Inventario** (app) y **Productos/Usuarios/Gestores** (admin): las tarjetas ponen los datos en
    una cuadrícula de 4 columnas según su largo (cortos de a 4, medianos de a 2, largos a lo ancho).
    Inventario 3521 → 2210 px.
  - **Movimientos**: filtros plegables (cerrados en el móvil, con el número de filtros activos).
  - **Dashboard admin**: KPIs compactos, accesos rápidos en una fila que se desliza, gráfica más
    baja; el ranking mostraba "1…" en vez del número; "Evolución" plana → una línea de texto.
  - **Inicio del vendedor**: gráfica de 7 días sin el hueco de debajo, la cifra del centro de la
    dona era ilegible (7 px) y ahora escala; KPIs compactos.
  - Pestañas de Transferencias en una fila deslizable; subtítulo genérico de la barra superior oculto.
- **Historial de ventas y Transferencias (app) en el móvil**: la tabla de 8–9 columnas escondía el
  total, el estado y las acciones fuera de la pantalla. Ahora cada venta es una ficha de 2 líneas
  (código, moneda, estado y total arriba; "Hoy, 14:05 · 3 ítems · gestor · vendedor" abajo) con un
  borde del color del estado; ocupa lo mismo que una fila de la tabla (65 px). Al tocarla se abre el detalle, que ahora trae **Completar /
  Cancelar venta / Reabrir**. En computadora sigue siendo la tabla de siempre.
- Catálogo, Usuarios y Comisiones (app) también como tarjetas en el móvil; Gestores (app): "Ver
  ventas" siempre a la derecha del nombre.
- Gráficas: etiquetas en HTML (antes texto SVG estirado e ilegible), líneas de 1–2 px reales.
- Iconos que faltaban: `info` y `activity` (dejaban un recuadro vacío).
- Tests: 4 nuevos (cuadrícula de las tarjetas y `formatWhen`) · 125 en total.
- Archivos: `css/mobile-ux.css` (§9) · `js/ui.js` · `js/charts.js` · `js/currency.js` ·
  `js/views/` admin, dashboard, sales-history, transfers, managers, catalog, users, commissions,
  warehouse-interior · `tests/pos-features.test.js` · `sw.js` (v31) · `js/version.js` · `package.json`.

## v5.10.0 (2026-11-23) — Escáner de códigos, más vendidos, conversor, cierre por WhatsApp

- **Escáner de códigos de barras con la cámara** (`js/barcode-scanner.js`, nuevo):
  - **Venta**: botón en el buscador → se escanean varios productos seguidos (pitido + vibración,
    contador, linterna si el teléfono la tiene, "Escribir código" si la cámara no está disponible).
  - **Admin → Productos → Nuevo/Editar**: botón en el campo **"SKU / código de barras"** → escanea el
    envase y guarda el código. Avisa si otro producto ya tiene ese código.
  - **Inventario**: buscar un producto escaneándolo.
  - Usa el lector nativo del teléfono (Chrome/Android) y, si no hay, **ZXing** (`js/zxing.min.js`,
    MIT, 336 KB) que solo se descarga la primera vez que se escanea en ese teléfono.
  - El código se busca en el SKU (tolera guiones/espacios y EAN-13 ↔ UPC-A).
- **Más vendidos en la venta**: hasta 6 botones con los productos que más salieron en ese almacén
  (últimos 30 días, con stock). Un toque = +1 unidad; muestra cuántas lleva la venta.
- **Conversor USD / EUR / MN en el inicio**: botón "Convertir" o tocar una tasa. Montos rápidos,
  separador de miles y las mismas tasas del día (con el margen incluido).
- **Cierre de caja por WhatsApp**: "Enviar por WhatsApp" arma el resumen del día (ventas, unidades,
  total, por moneda, más vendidos, quién cerró) y abre WhatsApp para elegir el chat. "Copiar" para
  Telegram/SMS. Muestra exactamente los montos de la tarjeta de cierre.
- **Inventario compacto en el móvil**: las 3 tarjetas de resumen en una fila (de ~700 px a 98 px),
  filtros en 2 filas y productos como tarjetas.
- **Tablas como tarjetas en el móvil** (≤ 640 px): Usuarios, Productos, Almacenes, Gestores y
  Transferencias del admin + Inventario. Cada fila es una tarjeta con etiquetas; en computadora
  siguen siendo tablas. Los reportes siguen deslizándose de lado.
- Otros: `addProduct` ya no añade productos agotados que no estaban en la venta; el icono del botón
  "Compartir" del ticket no se veía (faltaba `zap`); el service worker precarga `sales-stats.js`,
  `pin-utils.js` y `viscosity.js` (faltaban para usar la app sin conexión).
- Tests: `tests/pos-features.test.js` (14 nuevos · 121 en total).
- Archivos: `js/barcode-scanner.js` y `js/zxing.min.js` (nuevos) · `js/ui.js` · `js/currency.js` ·
  `js/sales-stats.js` · `js/app.js` · `js/admin-app.js` · `js/views/home.js` · `js/views/sales.js` ·
  `js/views/warehouse-interior.js` · `js/views/stock.js` · `js/views/admin.js` · `css/mobile-ux.css` §8 ·
  `sw.js` caché v30.

## v5.9.0 (2026-11-23) — PANEL ADMIN con el mismo estilo + tablas legibles en móvil

- **Admin con el estilo de la app**: `admin.html` ahora enlaza `css/mobile-ux.css` (después de su
  `<style>` propio). Fondo, bordes definidos y tarjetas flotantes iguales a la app; barra superior
  blanca translúcida con línea nítida; en escritorio la barra lateral flota separada de los bordes;
  accesos rápidos con relieve.
- **Tablas arregladas en móvil (admin y app)**: la regla anti-desborde de `styles.css` §17
  (`overflow-wrap:anywhere`) dejaba cada celda con ancho de UNA letra → "Producto", "Dirección"…
  se apilaban letra por letra (Productos medía 7256 px de alto, Almacenes 1941 px). Ahora cada fila
  ocupa una línea y la tabla se desliza de lado dentro de su tarjeta, con sombra que avisa que hay
  más columnas. Productos: 7256 → 1351 px; Ganancia: 5928 → 1466 px; Cierres: 3435 → 1245 px.
- **Admin táctil**: botones de 44 px en móvil (213 → 63 por debajo de 44 px en las 17 secciones),
  textos ≥ 11 px (55 → 17), KPIs en 2×2, aviso de comisiones con el botón en su propia línea,
  respeto de la muesca del iPhone (`viewport-fit=cover`).
- **Mini-gráficas del dashboard** (`js/charts.js`): el relleno usaba "x,y" donde solo va la x
  (`L97.00,17.04,30`, path inválido + 6 errores en consola). Corregido; además los puntos ya no se
  deforman en óvalos y la línea tiene grosor uniforme.
- `admin.html` · `css/mobile-ux.css` §7 · `js/charts.js` · `js/views/admin.js` (clase del aviso) ·
  `sw.js` caché v29.

## v5.8.1 (2026-11-23) — DISEÑO: líneas más definidas y tarjetas flotantes

- **Tarjetas flotantes**: sombra en capas (contacto + ambiente + caída larga y suave) en
  resumen, cierre de caja, inventario, ventas recientes, tasas, PIN y panel de venta.
  El fondo de la página baja un punto (gris azulado muy suave) para que las tarjetas
  blancas se despeguen. Las tarjetas dentro de otra tarjeta quedan planas, con borde,
  para no apilar sombras.
- **Líneas más definidas**: bordes y divisores con más contraste (`--border` 0.90 → 0.85,
  `--border-strong` 0.80 → 0.72); campos de texto con borde propio más marcado; pestañas
  activas con contorno.
- **Almacenes del inicio**: cada uno es su propia tarjeta flotante (antes una lista unida);
  al tocar, la tarjeta "baja" hacia la página (y en escritorio sube al pasar el ratón).
- **Header** blanco translúcido con línea inferior nítida (el del almacén tenía el fondo fijado
  en línea en `dashboard.js` y no respondía al CSS).
- **Teclas del PIN** con canto inferior, como botones físicos.
- **Modo oscuro**: fondo más profundo, bordes al 15 % y fondo "soft" distinto del de la tarjeta
  (antes KPIs y teclas se confundían con su tarjeta).
- `css/mobile-ux.css` §6 · `js/views/dashboard.js` · `sw.js` caché v28.

## v5.8.0 (2026-11-23) — DISEÑO: experiencia móvil (navegación, cobro, PIN, inicio)

> Medido en un teléfono de 390×844 (modo demo), mismo recorrido antes/después.

### 1. Barra inferior fija + botón de venta siempre a mano (BUG de raíz)
- **Qué pasaba**: la regla `[aria-label] { position: relative; }` (bloque «Tooltip» de
  `styles.css`) tenía la misma especificidad que `.bottom-nav` y `.fab` pero venía después,
  así que les quitaba el `position: fixed`. Resultado: Inicio / Ventas / Inventario / Más y el
  botón del carrito aparecían **al final de la página** (y=1766 px en una pantalla de 844 px).
  Ningún tooltip dependía de esa regla → eliminada.
- El header «sticky» tampoco se quedaba arriba: `.mobile-shell` tenía `overflow-x: hidden`,
  que lo convierte en contenedor de scroll y anula el sticky → `overflow-x: clip`.
- Barra con safe-area del iPhone, pestaña activa con «pill», FAB acoplado al centro; el FAB se
  oculta en Ventas (ya estás vendiendo). Al cambiar de sección se vuelve arriba.
- El botón flotante de «modo kiosko» tapaba la pestaña Inicio y en iPhone no funciona
  (Safari no tiene Fullscreen API) → pasa al menú lateral («Pantalla completa»), solo si el
  navegador lo soporta. Los atajos de teclado del menú se ocultan en pantallas táctiles.
- Toasts abajo y a todo el ancho (arriba tapaban el header).

### 2. Ventas: total y «Cobrar» siempre visibles
- Barra de cobro fija sobre la navegación (`#checkout-bar`): unidades, líneas, total y botón
  **Cobrar** que baja a la sección de pago. Se oculta sola cuando el botón real
  «Registrar venta» ya está a la vista (IntersectionObserver). Antes había que hacer ~480 px
  de scroll a ciegas para ver el total.
- Modales como **hoja inferior** en móvil (catálogo, menús, ticket): alcanzables con el pulgar.
  En táctil ya no se enfoca automáticamente el buscador (abría el teclado y tapaba el catálogo).
- Nombres de producto en 2 líneas (antes «MANNOL Ene…» no distinguía 5W-30 de 10W-40).
- Etiquetas cortas «Por unidad / Mayorista · caja» (partían en 2 líneas) y «TRANSF.» (se salía
  de la tarjeta).

### 3. Inicio compacto
- Sin el hero duplicado (logo + «MANNOL» ya están en el header) y con un solo aviso de margen.
- Almacenes como **lista táctil**: toda la fila entra (antes tarjeta de ~190 px + botón
  repetido), botón **Llamar** (`tel:`) que no dispara el PIN. Los 4 almacenes caben en la
  primera pantalla (antes 2).
- Sin la banda oscura diagonal en móvil: al ser `position: fixed` cortaba las tarjetas en
  diagonal (mitad blanca / mitad gris) y bajaba el contraste de los títulos.
- El botón ☰ del inicio no hacía nada (emitía `open-drawer` sin listener) → abre un menú
  (actualizar tasas, tema, pantalla completa, asistente) con la versión de la app.

### 4. PIN con teclado numérico propio
- Teclado 3×4 de 60 px, puntos de progreso, **envío automático** al completar los dígitos del
  PIN del almacén, vibración + «shake» al fallar. En táctil no se abre el teclado del sistema.
  Con teclado físico se sigue pudiendo escribir (input oculto accesible). Misma lógica de
  validación y límite de intentos (`pin-rate-limit.js`).
- El candado ahora se centra (faltaba la utilidad `.mx-auto`); «Volver» con área de 44 px.

### 5. Tacto y legibilidad
- Objetivos táctiles ≥ 44 px en pantallas táctiles (header, steppers, filas de stock, tabs);
  controles compactos (Hoy/Semana/Mes, filtro «bajo») con área ampliada invisible.
- Campos de texto a 16 px en táctil: iPhone ya no hace zoom al tocar buscar / vuelto / nota.
- Textos mínimos de 11 px (había badges de 8–10 px con estilo inline).

### Técnico
- `css/mobile-ux.css` (nuevo, cargado después de `styles.css`): toda la capa móvil agrupada
  por idea; solo tokens del tema (claro/oscuro).
- `css/styles.css`: eliminada la regla `[aria-label] { position: relative; }`.
- `js/views/home.js` (hero, tasas, lista de almacenes, menú), `js/views/pin-login.js`
  (teclado), `js/views/sales.js` (barra de cobro), `js/views/dashboard.js` (vista activa,
  pantalla completa en el menú), `js/ui.js` (foco de modales en táctil).
- `sw.js` caché v27 (+ `css/mobile-ux.css`). Sin migración SQL. Sin cambios en datos/lógica.

## v5.7.0 (2026-11-23) — DISEÑO: rediseño del interior del almacén

> Preview comparativo con capturas antes/después: `preview-rediseno.html` (en la carpeta de descargas).

### Qué cambió en la vista del almacén (empleado)
- **Hero de identidad**: tarjeta con gradiente esmeralda, chip del código, nombre grande y
  dirección/teléfono en una línea de metadatos (antes: texto suelto en dos líneas grises).
- **Resumen rediseñado**: el selector Hoy/Semana/Mes ahora es un segmented control DENTRO del
  card (una fila menos); KPIs en grid 2×2 — Ventas, **Total USD** (siempre visible, antes solo
  con movimiento), Unidades y **Ticket promedio** (nuevo); detalle por moneda como chips de
  color con punto del acento; estado vacío con icono y guía ("Toca Registrar venta").
- **Inventario con estados visibles**: barra de color izquierda (verde ok / ámbar bajo /
  rojo agotado), cantidad en pill del color del estado, mínimo de referencia («mín 5»),
  marca solo si es distinta de MANNOL (menos ruido) y nombre atenuado en agotados.
  La lista sube su límite de alto (18→22rem) para ver más productos de un golpe.
- **CTA «Registrar venta»** con gradiente y sombra propia; **«Cerrar caja de hoy»** se pone
  verde cuando hay ventas pendientes de cerrar.
- **Cierre de caja compacto**: stats en una fila con divisores (menos cajas dentro de cajas).
- **Ventas recientes** con borde izquierdo del color de la moneda.
- Todo con tokens del tema: respeta claro/oscuro sin duplicar estilos. Constantes sin uso
  del resumen viejo eliminadas.

### Técnico
- `css/styles.css`: nuevas clases `wh-hero`, `wh-chip`, `wh-meta`, `seg/seg-on`, `kpi-grid`,
  `kpi-cell`, `curr-chip`, `cta-sale`, `stat-row/cell`, `stock-row(.low/.out)`, `qty-pill`.
- `js/views/warehouse-interior.js`: template del dashboard/inventario reorganizado (mismos
  handlers y flujos; sin cambios de lógica de datos).
- 107 tests OK. `sw.js` caché v26. Sin migración SQL.

## v5.6.1 (2026-11-23) — FIX: PIN del almacén (incorrecto siempre + demora)

### Qué pasaba
- **"PIN incorrecto" aunque el PIN fuera correcto**: si el almacén no tenía su propio PIN y
  el row de `settings` en Supabase tenía `pinCode` en null/vacío, el valor null pisaba el
  default `2025` → el PIN esperado quedaba `null` y **ningún** PIN entraba. Además, si el PIN
  llegó a guardarse como número (columna numérica en Supabase), `"2611" !== 2611` fallaba.
- **Demora al entrar**: cada intento de PIN hacía un `await getSettings()` (viaje de red a
  Supabase) aunque el almacén ya tuviera su propio PIN. Igual en toda la app: settings y
  warehouses se re-consultaban en cada navegación.

### Arreglos
- `js/pin-utils.js` (nuevo, puro y testeado): `normalizePin`, `resolveExpectedPin`,
  `pinMatches` — comparación segura string/número y con trim de espacios.
- El login PIN ya **no consulta settings si el almacén tiene su propio PIN** (validación local,
  instantánea). El mensaje "PIN incorrecto" solo aparece cuando de verdad no coincide; si el
  almacén no tiene PIN configurado, avisa dónde configurarlo en vez de decir "incorrecto".
- **Caché TTL**: `getSettings` 60s y `listWarehouses` 30s (se invalidan al guardar) — la app
  entera deja de re-consultar Supabase en cada pantalla; el arranque en frío del plan gratis
  se siente una sola vez.
- 12 tests nuevos (107 total). `sw.js` caché v25. Sin migración SQL.

## v5.6.0 (2026-11-23) — Notificaciones en vivo + reportes de cierres

> Sin migración SQL nueva — usa las tablas de v5.5 (`transfer_requests`, `daily_closures`).
> Si vienes de v5.4 o anterior, ejecuta primero `migration-v5.5-transfers-closures.sql`.

### 🔔 Notificaciones en vivo de solicitudes
- **El admin se entera al momento**: suscripción en tiempo real (Supabase Realtime sobre
  `transfer_requests`). Cuando el personal envía una solicitud llega, sin recargar:
  beep corto (WebAudio, sin archivos), toast, banner destacado arriba del contenido con
  botón **Ver** (salta a Transferencias → Solicitudes) y el badge rojo de la sidebar se
  actualiza al instante.
- **Notification API**: si el navegador lo permite, además llega una notificación del sistema
  (con `tag` para no duplicar). Botón **"🔔 Activar notificaciones"** en la sidebar cuando el
  permiso aún no se otorgó ni se denegó.
- No notifica lo ya existente: solo solicitudes nuevas desde que abriste el panel.
- En demo el flujo completo es probabable: localStorage emite el evento `mannol-demo-requests-changed`.

### 📊 Reporte de cierres comparativo (admin → Cierres de caja)
- **Chips de período**: Esta semana (arranca lunes) / Este mes / Últimos 30 días.
- **Resumen del período**: total recaudado (+ promedio/día), ventas, unidades, cierres
  registrados y ticket promedio.
- **Comparativa por almacén** con barras (total USD) y promedio diario por local.
- **Top productos del período** agregados entre todos los cierres (máx 8).
- **Tabla por almacén** con cierres/ventas/unidades/total/prom-día/ticket-promedio y
  **export CSV del reporte** (`reporte-cierres-week|month|30d.csv`).

### 🧱 Técnico
- `sales-stats.js`: `reportPeriodRange` + `aggregateClosuresReport` + `dateKeyToMs` (puras, testeadas).
- `db.js`: `subscribeTransferRequests` (Realtime en producción, evento demo en localStorage);
  los writes demo emiten el evento para que la suscripción reaccione en vivo.
- `js/version.js` → 5.6.0 · `sw.js` CACHE v24 · 8 tests nuevos (95 total).

## v5.5.0 (2026-11-21) — FLUJO DE NEGOCIO: solicitudes de traspaso y cierre de caja

> ⚠️ **Requiere migración SQL (una vez)**: ejecutar `supabase/migration-v5.5-transfers-closures.sql`
> en Supabase → SQL Editor. Crea 2 tablas (`transfer_requests`, `daily_closures`) con RLS e índices.
> Sin la migración la app sigue funcionando; los dos flujos nuevos solo operan tras ejecutarla.

### 📦 Solicitudes de traspaso (personal ↔ admin)
- **El empleado pide mercancía**: en el interior del almacén, tab "Otros almacenes" → botón
  **Solicitar traspaso** por producto (elige almacén origen con disponibilidad, cantidad y nota).
- **"Mis solicitudes"** al pie del inventario: últimas 5 con estado (PENDIENTE / APROBADA / RECHAZADA).
- **El admin resuelve en Transferencias → "Solicitudes del personal"**: Aprobar mueve el stock
  (TRANSFERENCIA_SALIDA del origen + TRANSFERENCIA_ENTRADA al destino, con auditoría), Rechazar no
  toca stock. El badge rojo de la sidebar ahora suma transferencias + solicitudes pendientes.
- Regla anti-duplicados: índice único en BD — máx 1 solicitud PENDIENTE por (origen, destino, producto).
- Máquina de estados cerrada: PENDIENTE → {APROBADA, RECHAZADA, CANCELADA}; los finales no reabren.

### 💰 Cierre de caja diario
- **Interior del almacén → tarjeta "Cierre de caja"**: ventas/unidades/total del DÍA + desglose por
  moneda (siempre hoy, independiente del período elegido en el resumen).
- **"Cerrar caja de hoy"** guarda el snapshot; si ya había uno se actualiza con confirmación.
- **"Últimos cierres"** (7) plegable con fecha, ventas y responsable.
- **Admin → Sistema → "Cierres de caja"**: todos los almacenes con resumen por local, filtro,
  detalle por moneda y export CSV (columnas listas para Excel).

### 🧱 Técnico
- `js/sales-stats.js` nuevo: lógica pura compartida (stats de cierre + validación/máquina de estados
  de solicitudes) — testeada.
- Migración `migration-v5.5-transfers-closures.sql` + `schema.sql` actualizado para instalaciones nuevas.
- RLS por tabla: empleados escriben solicitudes y cierres; solo admins las resuelven.
- Demo: solicitudes y cierres persisten en localStorage (con seeds) para probar el flujo completo
  sin Supabase.
- `js/version.js` → 5.5.0 · `sw.js` CACHE v23 · 14 tests nuevos (87 total).

## v5.4.0 (2026-11-21) — UX: vender más rápido y panel más cómodo

### ⚡ POS (app del vendedor)
- **Búsqueda rápida inline**: en "Registrar venta" un buscador filtra productos al escribir y
  añade con un toque (Enter añade el primero). Ya no hace falta abrir el catálogo modal para
  la venta típica de 1-2 productos.
- **Calculadora de vuelto**: bajo el total, "¿Con cuánto paga el cliente?" — calcula el vuelto
  en la moneda seleccionada (efectivo, una sola moneda) o cuánto falta.
- **Ticket compartible**: al registrar la venta (online, offline o en cola) se abre un modal con
  el ticket y botones Compartir (Web Share → WhatsApp/SMS) y Copiar.
- **Comisiones solo para admins**: la línea "Comisión gestor/vendedor" de cada item del carrito
  ya solo la ve el admin — al vendedor le muestra el carrito limpio.

### 🏪 App del vendedor / interior de almacén
- **Resumen sin tiles en cero**: las KPIs muestran solo las monedas con actividad; las que están
  en 0 se resumen en una línea ("Sin movimiento: EUR · Transf.") en vez de ocupar media pantalla.
- **Badges de stock clicables**: "2 bajo" / "1 agotado" ahora FILTRAN la lista al tocarlos
  (segundo toque quita el filtro); lista vacía con CTA "Limpiar filtros".
- **Header sin código duplicado**: "Empleado · VIB · VIB" → "Empleado · Víbora".

### 🏠 Home y navegación
- **Hero compacto**: el bloque de marca ocupa una línea y las tasas/almacenes quedan visibles
  al abrir la app.
- **Banner de configuración descartable**: "No volver a mostrar" guarda la preferencia por
  dispositivo (el asistente sigue disponible en setup.html).
- **Abrir en el último destino**: la app recuerda la última vista del admin (dashboard, PIN o
  home) y reabre ahí al volver; los demás roles siguen entrando a su dashboard.

### 🖥️ Panel admin
- **Accesos rápidos compactos**: las 3 filas de tarjetas grandes se convirtieron en chips en
  una sola banda — las KPIs y gráficos quedan en la primera pantalla.
- **Tabla de Productos más densa**: la columna Marca se fusionó en el nombre y las comisiones
  G/V son un solo chip — más ancho para lo importante.
- **Sparklines con tooltip**: al pasar el mouse/dedo sobre la micro-tendencia de cada KPI se ve
  la fecha y el valor del día.
- **Export CSV en Productos y Usuarios** (además del de ventas/movimientos que ya existía):
  exporta lo filtrado, con las columnas listas para Excel.

### 🧰 Pulidos
- Targets táctiles ≥44px en botones de icono para pantallas táctiles (`pointer: coarse`).
- Búsqueda del historial ahora también cubre la **nota** y los **nombres de productos** de cada venta.

### Notas
- Sin cambios de esquema ni migración SQL en esta versión.
- `js/version.js` → 5.4.0 · `sw.js` CACHE v22 · `package.json` 5.4.0.

## v5.3.0 (2026-11-21) — MEJORAS: performance, filtros, imágenes más livianas y robustez offline

### ⚡ Performance (dashboard y consultas)
- **Dashboard ya no trae TODAS las ventas históricas**: `listSales({})` → `listSales({ from: ... })` y
  db.js filtra `created_at` EN LA BASE DE DATOS (índice `created_at`) con `.gte()/.lte()` en vez de
  traer todo y filtrar en el cliente. Con miles de ventas el panel vuelve a ser rápido.
- **Movimientos de stock**: buscador de texto (producto, usuario, nota, motivo) + **paginación**
  (50 por página con Anterior/Siguiente; las stats se calculan sobre todo el filtrado, no la página).
- `listStockMovements` acepta `from/to` en la query (server-side).

### 🖼️ Imágenes (GitHub + WebP + miniaturas)
- **Miniatura 200px automática**: al subir una imagen se generan DOS archivos WebP — la principal
  (máx 1200px) y `{nombre}-thumb.webp` (máx 200px) — en GitHub (Contents API), Supabase Storage o
  data URL según la config. Nuevo campo `products.thumb_url`.
- **La tabla de Productos ahora muestra la miniatura** de cada producto (antes texto solamente).
- Nuevo `supabase/migration-v5.3-improvements.sql` (ejecutar en SQL Editor) + `schema.sql` actualizado
  para instalaciones nuevas. Al cambiar/borrar imagen se limpia también la miniatura huérfana.

### 🎛️ Panel admin más cómodo
- **Filtros en las tablas**: Productos (buscar por nombre/marca/SKU + categoría + estado activo/inactivo),
  Usuarios (buscar + rol), Movimientos (texto libre). Los filtros restauran el foco tras re-render.
- **Precios en lote**: botón "Precios en lote" en Productos — cambia el precio de todos los productos
  filtrados a la vez (% / monto fijo / precio exacto) con vista previa y confirmación.
- **Sparklines en las KPI cards** del dashboard (Ingresos/Ventas/Unidades: micro-tendencia de `N` días,
  nuevo helper `sparkline()` en charts.js).
- **Exportar CSV del período** junto a los botones 7d/30d/90d/1 año.
- **Paleta de comandos Ctrl+K adaptada al admin**: secciones reales del panel + acciones rápidas
  (precios en lote, comparar almacenes, tema, refrescar). `global-search.js` ahora acepta
  `navItems`/`extraActions`; admin.js expone `window.__adminNavigateTo`.
- **Alertas de stock bajo al abrir el admin** (1 vez por día): toast + notificación push con los
  productos en el mínimo (`notifyLowStock` en push-notify.js).

### 📲 PWA — actualizaciones visibles
- **Banner "Nueva versión disponible"** (`js/update-banner.js`): cuando sw.js trae cambios, el
  usuario ve el banner con botón «Actualizar» (SKIP_WAITING + recarga) en vez de esperar.
  admin.html ahora TAMBIÉN registra el service worker aunque se abra directo.
- sw.js: caché v21 + handler de mensajes SKIP_WAITING.

### 🛡️ Robustez (requiere ejecutar el SQL nuevo)
- **Descuento de stock atómico al sincronizar ventas offline**: nueva RPC `deduct_sale_stock` —
  solo descuenta si hay stock suficiente, así dos puestos que vendieron lo mismo sin internet
  **ya no dejan el inventario en negativo**. Los items sin stock vuelven en `shortages` y la app
  avisa "venta sincronizada con revisión". Fallback automático al desconto clásico si la RPC no
  está instalada (instalaciones viejas siguen funcionando).
- **Auditoría de PIN**: cada intento fallido queda en la nueva tabla `pin_attempts` (best-effort,
  no bloquea nada si falla) — detección de accesos no autorizados.

### ✨ Pulido
- **Focus trap completo en modales** (Tab cicla dentro, foco restaurado al cerrar) — ui.js.
- **Copys unificados** al español neutro: eliminados los restos de voseo ("Tenés", "Seleccioná",
  "Conectá", "Volvé", "Hacé", "¿No sos administrador?"...) para la audiencia cubana.

### 🧪 Tests
- Nuevo `tests/sale-commissions.test.js` (6): helper puro `sumCartCommissions()` extraído del
  checkout retail de sales.js — el cálculo de comisiones ahora está testeado.
- Nuevo `tests/weekend-rule.test.js` (9): regla de fin de semana (`shouldRedirectWeekend` +
  `resolveEffectiveWarehouse`) — redirección, auditoría, fallbacks y días hábiles.
- Suite completa: **8 archivos, 73 tests OK**.

### ⚠️ PASO MANUAL (una vez): ejecutar `supabase/migration-v5.3-improvements.sql` en Supabase → SQL Editor.
- Añade `products.thumb_url`, la RPC `deduct_sale_stock` y la tabla `pin_attempts` (idempotente).
- Sin ejecutarlo, la app sigue funcionando (miniaturas fallan silenciosamente y el desconto usa el método clásico).

### Versiones
- sw.js: caché v21. package.json 5.3.0. js/version.js 5.3.0.

## 🆕 Archivos nuevos añadidos (v5.0.0)

| # | Archivo | Tamaño | Descripción |
|---|---------|--------|-------------|
| 1 | `setup.html` | 3 KB | Página standalone del asistente de configuración de Supabase |
| 2 | `js/setup-wizard.js` | 54 KB | Lógica del wizard: 7 pasos guiados, copiar SQL, test de conexión en vivo, generación dinámica del SQL del admin, validación de credenciales, descarga de `supabase-config.js` |
| 3 | `css/setup-wizard.css` | 16 KB | Estilos del wizard (mismo sistema de diseño OKLCH esmeralda + dark mode, responsive móvil) |

## ✏️ Archivos modificados (v5.0.0)

| # | Archivo | Líneas | Cambio |
|---|---------|--------|--------|
| 1 | `js/supabase.js` | +104 | Soporte de configuración desde `localStorage` (clave `mannol-supabase-config-v1`) además del archivo. Nuevas funciones exportadas: `getStoredSupabaseConfig()`, `saveStoredSupabaseConfig()`, `clearStoredSupabaseConfig()`, `SUPABASE_CONFIG_STORAGE_KEY`. localStorage toma **precedencia** sobre el archivo (intención más reciente del usuario). |
| 2 | `js/views/home.js` | +44 | Importa `isSupabaseConfiguredAsync` y muestra banner verde "Conecta MANNOL con Supabase" cuando no está configurado, con botón directo al wizard. |
| 3 | `index.html` | +6 | Enlace al wizard (`setup.html`) en la pantalla de error de bootstrap. |

## 🐛 Fix en v5.0.1 — Aceptar nuevo formato de API key de Supabase

Supabase cambió recientemente el formato de las API keys en proyectos nuevos. Antes todas las anon keys eran JWTs empezando con `eyJ...`, pero los proyectos creados después de ~2024 usan el nuevo formato `sb_publish_...`.

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `js/setup-wizard.js` | `isValidAnonKey()` ahora acepta ambos formatos (`sb_publish_` y `eyJ`). Nueva función `isSecretKey()` detecta si alguien pega `sb_secret_` por error y muestra warning rojo. Actualizado el placeholder, hint y mensaje de error del paso 5. |

**Causa:** El usuario con un proyecto nuevo de Supabase no podía pasar la validación porque su anon key empezaba con `sb_publish_` en lugar de `eyJ`.

## 🧹 Archivos no tocados

Todos los demás archivos del repo se mantienen idénticos al upstream (`main`):
- `js/db.js`, `js/auth.js`, `js/image-upload.js`, `js/app.js`, `js/admin-app.js`
- `js/views/*.js` (14 vistas: home, dashboard, sales, stock, etc.)
- `supabase/*.sql` (schema, policies, seed, lifecycle-cleanup)
- `admin.html`, `css/styles.css`, `sw.js`, `manifest.webmanifest`, etc.

## ✅ Tests realizados

Probado con navegador headless (agent-browser):
- ✅ Wizard carga sin errores en consola
- ✅ Navegación entre los 7 pasos funciona
- ✅ Las 3 pestañas SQL cargan contenido (schema: 16,078 chars, policies: 23,489 chars, seed: 10,845 chars)
- ✅ Botón Copy funciona en cada pestaña
- ✅ El SQL del admin se actualiza dinámicamente al pegar el UUID
- ✅ Validación de credenciales: alerta roja para inválidas, verde para válidas
- ✅ Guardar credenciales las persiste en `localStorage`
- ✅ Auto-avanza al siguiente paso tras guardar
- ✅ Banner aparece/desaparece correctamente en home según estado
- ✅ Modo dark funciona
- ✅ Responsive móvil (390×844) funciona
- ✅ La app sigue funcionando en modo demo cuando no hay configuración

12 capturas de verificación disponibles en `/home/z/my-project/download/`:
- `wizard-step1-welcome.png` … `wizard-step7-done.png` (7 pasos del wizard)
- `wizard-step1-dark.png` (modo dark)
- `wizard-mobile-iphone.png`, `wizard-mobile-sql.png` (responsive móvil)
- `app-home-banner-shown.png` (banner en home sin configurar)
- `app-home-after-config.png` (home con Supabase configurado, sin banner)

---

# 🚀 v5.1.0 — Mejoras de usabilidad + imágenes en GitHub

## 🐛 Fixes

### 1. Agregar un producto se quedaba cargando y no guardaba (CRÍTICO)
**Causa raíz (2 bugs combinados):**
- El diálogo "Nuevo producto" del **Catálogo** no enviaba el campo `brand`
  (es `NOT NULL` en la BD → el INSERT fallaba con error de constraint).
- El diálogo de **Productos del admin** enviaba campos legacy
  (`commission`, `commissionCurrency`) que **no existen** en la tabla
  `products` → error PGRST204 de PostgREST.
- `saveProduct()` **tragaba** ambos errores en silencio: la UI mostraba
  "Producto guardado" pero nada se guardaba.

**Solución:**
| Archivo | Cambio |
|---|---|
| `js/db.js` | `saveProduct()` ahora sanitiza el payload contra la lista real de columnas (`PRODUCT_COLUMNS`), completa `brand` con "MANNOL" si falta, y **lanza el error real** en vez de tragárselo. |
| `js/views/catalog.js` | Campo "Marca" en el diálogo (default MANNOL), botón con estado "Guardando…", y el error real se muestra en un toast. |
| `js/views/admin.js` | Quitados los campos legacy del payload; botón con estado de guardado; errores visibles. |

### 2. Confirmar transferencias fallaba (bug oculto encontrado)
El constraint de `stock_movements.reason` no incluía los motivos
`TRANSFERENCIA_SALIDA` / `TRANSFERENCIA_ENTRADA`, así que al confirmar
una transferencia el INSERT de auditoría fallaba y el stock no se movía.

**→ Ejecutar `supabase/migration-v4-transfer-reasons.sql` en el SQL Editor
de Supabase (es idempotente, se puede correr varias veces).**
También corregido en `schema.sql` para instalaciones nuevas.

## ✨ Mejoras

### 3. Gestor que refirió = desplegable con nombres (Registrar venta)
Antes había que escribir la SIGLA a mano (CM, AR…). Ahora es un
`<select>` con todos los gestores activos: "Nombre (SIGLA)", opción
"— Sin gestor —", y debajo muestra teléfono/código del gestor elegido.
Aplica a ventas retail y mayorista. Archivo: `js/views/sales.js`.

### 4. Nueva sección "Stock general" en el Admin
Admin → Gestión → **Stock general**:
- 4 tarjetas globales: unidades totales, con stock, bajo mínimo, agotados.
- **Stock separado por almacén (local)**: una tarjeta por almacén con su
  listado de productos y cantidades.
- **Matriz producto × almacén**: filas = productos, columnas = cada local,
  con Total, mínimo y estado (OK / Bajo / Agotado).
- Filtros: búsqueda, por almacén, "solo bajo mínimo/agotados", "solo agotados".
- Exportar CSV.
Archivo: `js/views/admin.js` (`mountStockPanel`).

### 5. Transferencias multi-producto desde Movimientos
Admin → Movimientos → "Nueva transferencia": ahora elegís **almacén origen
y destino** y aparece un **desplegable/lista con TODOS los productos** con el
stock disponible en el origen, donde podés **escribir la cantidad a mover de
cada uno** (0 = no mover). Valida que no muevas más del stock disponible y
crea las transferencias en lote (cada producto = una transferencia
pendiente en el panel Transferencias). Archivo: `js/views/admin.js`.

### 6. Imágenes de productos guardadas en GitHub 🆕
Las imágenes son lo que más pesa y agotaban el free tier de Supabase (1 GB).
Ahora las imágenes se suben **a tu repo de GitHub** vía la API de Contents y
se sirven desde `raw.githubusercontent.com` (o el CDN que configures).

- **Nuevo archivo:** `js/github-storage.js` (subida/borrado/test de conexión).
- **Nuevo panel:** Admin → Sistema → **Almacenamiento**: configuras owner,
  repo, rama, carpeta y token (fine-grained con permiso *Contents: Read and
  write*). El token se guarda solo en el dispositivo (localStorage), nunca
  se sube al repo. Guía paso a paso incluida en el panel.
- **Prioridad de subida:** GitHub → (si falla) Supabase → (modo demo) dataURL.
  Nunca se pierde una imagen.
- Al reemplazar/borrar un producto, la imagen anterior se intenta borrar
  del repo automáticamente.
- Archivo de ejemplo: `js/github-config.example.js` (opcional, para
  preconfigurar owner/repo sin token).

### 7. Alineación, tipografía y anti-desborde (CSS)
Bloque de fixes al final de `css/styles.css`:
- Tablas: textos con corte limpio, celdas numéricas alineadas y con
  números tabulares; sin carteles fuera de lugar.
- Badges con elipsis, títulos con `overflow-wrap`, hijos de flex/grid con
  `min-width:0` (fix clásico de desborde), selects/inputs dentro de su
  columna, toasts y modales adaptados a pantallas angostas,
  nav del admin con elipsis, imágenes acotadas a su contenedor.

## 🔄 Otros cambios
- `sw.js`: `CACHE_VERSION` → `mannol-pos-supabase-v9` (fuerza refresco de
  la PWA) + nuevos archivos en la precache.
- `js/types.js`: etiquetas de los motivos de transferencia.
- `package.json`: versión 5.1.0.

## 📋 Pasos posteriores a la subida
1. Subir todos los archivos del zip al repo (reemplazando los existentes).
2. **Supabase → SQL Editor → ejecutar `supabase/migration-v4-transfer-reasons.sql`.**
3. En la app: Admin → Sistema → **Almacenamiento** → configurar GitHub
   (owner `mannollubricantes21-lang`, repo `Mannol`, rama `main`,
   carpeta `product-images`) + token fine-grained con
   *Contents: Read and write* → "Probar conexión".
4. Cerrar y reabrir la app dos veces para que el Service Worker
   actualice la caché (o limpiar datos del navegador).

## v5.1.1 (2026-09-11)
- FIX: el pie del menú decía "MANNOL Supabase v4" (etiqueta antigua hardcodeada que confundía al verificar la versión). Ahora usa js/version.js (única fuente de verdad): "MANNOL POS v5.1.1 · build 2026-09-11".
- sw.js: cache v10 (fuerza actualización de clientes al publicar).
- Añadido INSTALACION_SUPABASE.md: guía paso a paso para saber qué SQL ejecutar en Supabase según el estado de tu BD.

## v5.1.2 (2026-09-11)
- FIX CRÍTICO: spinner infinito en el panel de Productos del admin al añadir/editar un producto (el producto SÍ se guardaba, pero la lista no se volvía a renderizar). Causa: se llamaba a mountProductsPanel(content) sin el parámetro `gen`, por lo que el guard `gen !== tabGeneration` abortaba el render. Corregido en 16 llamadas (Usuarios, Productos, Categorías, Almacenes, Gestores, Tarjetas) + guard defensivo `gen = gen ?? tabGeneration` en cada panel.
- NUEVO: Entrada / ajuste de stock por almacén. Nuevo diálogo desde Admin → Stock (botón "Entrada de stock" y botón "Ajustar" por producto) y desde Admin → Productos (icono de cajas por producto). Elige producto + almacén, muestra el stock actual, chips rápidos (+1/+6/+12/+24, -1), motivo y nota. Usa la RPC atómica adjust_stock y registra auditoría en stock_movements.
- db.js: adjustStock ahora propaga el error real (antes lo tragaba en silencio).
- sw.js: caché v11.

## v5.1.3 (2026-09-11 / build 2026-09-12)
- FIX: tab "Otros almacenes" (interior de almacén) mostraba "Cargando..." eterno. Ahora distingue cargando / error / vacío, muestra explicación de permisos por almacén y botón Reintentar.
- Stock panel (admin): aviso amarillo si no hay ninguna fila de stock visible (permisos RLS por almacén / rol del usuario).
- CSS v5.1.3: bloque anti-desborde extra en admin (badges, tablas, KPIs, toasts, grid).
- sw.js: caché v12.

## v5.1.9 (2026-09-12) — FIX 22P02: el id "pin-..." rompía la subida de ventas

### Cómo se encontró (gracias al banner de errores de v5.1.8)
El banner mostró el error real: `[22P02] invalid input syntax for type uuid: "pin-1789088327857"`.
Las sesiones por PIN generan ids de usuario `pin-<timestamp>` (js/views/pin-login.js).
Ese valor viajaba a `sales.user_id`, que en la BD es columna **uuid** → Postgres
rechazaba la venta. Lo mismo rompía en silencio:
- `adjust_stock(p_user_id uuid)` → **el stock de las ventas nunca se descontaba**.
- `card_movements.user_id` / `card_movements.sale_id` (sale_id es uuid y sale.id es "S-...").
- `update_sale_status(p_user_id uuid)` al cancelar.

### FIX APP — sanitizado de UUIDs en TODAS las escrituras (db.js)
- Nuevos `isUuid()` / `nullIfNotUuid()` exportados.
- `sanitizeSaleRow`: las 6 columnas uuid de `sales` (warehouse_id, user_id,
  manager_id, card_id, original_warehouse_id, weekend_warehouse_id) ahora
  descartan valores no-uuid → la venta sube con esos campos en null y el
  nombre del usuario (text) se conserva. Las ventas atascadas suben solas.
- `adjustStock` / `updateSaleStatus`: parámetros uuid sanitizados → el stock
  vuelve a descontarse aunque el usuario sea PIN.
- `recordCardMovementForSale`: sale_id y user_id sanitizados.
- `sanitizeSettingsRow`: weekend_warehouse_id sintético descartado.
- tests/sale-row.test.js: +6 casos uuid (incluye el caso real "pin-1789088327857").
  Verificación end-to-end contra la BD real: fila con id "S-..." y sin user_id → **201 Created**.
- sw.js: caché v19. package.json 5.1.9.

## v5.1.8 (2026-09-12) — El banner muestra el error real de sincronización

### Diagnóstico confirmado (probes REST contra la BD real)
- El SQL v5.1.7 SÍ se ejecutó bien: las 5 columnas existen y la verificación
  "VENTAS EN LA NUBE 0" es normal (el editor SQL solo muestra el último resultado).
- INSERT y UPSERT anónimos a `sales` devuelven **201 Created** — la base de datos
  ya acepta ventas sin problema. NO hace falta ejecutar más SQL.
- Si las ventas siguen "pendientes", el dispositivo está ejecutando **JavaScript
  viejo desde la caché del Service Worker**. Solución: actualizar la página 2 veces
  (o limpiar datos del sitio) y verificar el pie del menú: "MANNOL POS v5.1.8".

### FIX APP — transparencia total en el banner de pendientes
- `offline-sync.js`: nuevo `getLastSyncError()` — guarda código + mensaje real del
  último fallo de subida (ej. `[PGRST204] Could not find the 'X' column...`).
- `sync-banner.js`: si hay ventas pendientes y el último intento falló, el banner
  muestra el error exacto en rojo y, si es un error de columnas/permisos
  (PGRST*/42501), añade el aviso amarillo "Actualiza esta página 2 veces".
- Así cualquier fallo futuro se puede reportar con una simple captura del banner.
- sw.js: caché v18. package.json 5.1.8.

## v5.1.7 (2026-09-12) — FIX DEFINITIVO: ventas pendientes (faltaban columnas en la BD)

### Por qué seguía fallando tras el SQL v5.1.6
Dos causas encadenadas, confirmadas con probes REST contra la BD real:

1. **Faltaban columnas en la BD** (la migración v2 de "fin de semana" nunca se ejecutó):
   `sales.weekend_redirect`, `sales.original_warehouse_id`, `sales.weekend_warehouse_id`,
   `settings.weekend_warehouse_id`, `settings.weekend_redirect_enabled`.
   Cada venta fallaba con `PGRST204: Could not find the 'weekend_redirect' column of 'sales'`.
2. **La app enviaba campos fantasma**: las ventas encoladas llevan `_syncAttempts` →
   se convertía en `_sync_attempts` (columna inexistente) → **cada reintento fallaba
   aunque todo lo demás estuviera bien**. También `settings` enviaba
   `weekend_warehouse_name` (caché solo-app).

### FIX SQL — NUEVO `supabase/migration-v5.1.7-sales-weekend.sql`
- Añade las 5 columnas faltantes (idempotente, no toca datos) + 2 índices.
- **Hay que ejecutarlo en Supabase → SQL Editor** (Paso B, script 4).
- Al ejecutarlo, las ventas atascadas en la cola suben solas en <1 min.

### FIX APP — blindaje anti columnas fantasma (db.js)
- Nuevo `sanitizeSaleRow()` (whitelist `SALE_COLUMNS`): descarta cualquier campo
  que no sea columna real de `sales` (ej. `_sync_attempts`) antes de guardar.
  Ya no puede volver a pasar el error PGRST204 en ventas, venga de la UI o de la cola offline.
- Nuevo `sanitizeSettingsRow()` (whitelist `SETTINGS_COLUMNS`): el guardado de
  configuración ya no falla por `weekend_warehouse_name`.
- `schema.sql`: instalaciones nuevas ya incluyen las columnas de fin de semana.
- tests/sale-row.test.js: 5 tests. sw.js: caché v17. package.json 5.1.7.

## v5.1.6 (2026-09-12) — FIX: las ventas ya no se quedan "pendientes" + viscosidad automática

### 1) Ventas pendientes que nunca se subían (FIX CRÍTICO, requiere SQL)
- SÍNTOMA: al registrar una venta desde un acceso por PIN, quedaba en la cola ("1 venta(s) pendiente(s)") para siempre y el admin nunca la veía.
- CAUSA RAÍZ confirmada contra la BD real: el PIN no crea sesión de Supabase (rol `anon`) y las políticas RLS de `sales` solo permitían INSERT/SELECT a `authenticated`. Cada intento fallaba con `42501 new row violates row-level security policy for table "sales"`.
- FIX (SQL): NUEVO `supabase/migration-v5.1.6-sales-pin.sql` con 2 políticas:
  - `sales_insert_pin` — permite registrar ventas desde sesiones PIN.
  - `sales_read_pin` — permite ver las ventas (dashboard del vendedor, historial) y evita duplicados en la resincronización.
- Editar/cancelar sigue por la RPC `update_sale_status` (security definer), que ya funcionaba con PIN.
- `policies.sql` incluye ambas políticas para instalaciones nuevas.
- ⚠️ ** Hay que ejecutar el SQL en Supabase (SQL Editor) — la app sola no basta.**

### 2) Productos: la viscosidad se rellena sola desde el nombre
- El nombre ya trae la viscosidad ("MANNOL 5W-30 Longlife") — ya no hay que escribirla dos veces.
- NUEVO `js/viscosity.js`: detecta 5W-30 / 10W40 / 15W/40 / SAE 30 / ISO VG 46 / ATF / DOT 4 dentro del nombre.
- Admin → Nuevo/Editar producto: al escribir el nombre, el campo Viscosidad se rellena automáticamente (editable, nunca pisa un valor escrito a mano). El campo sigue siendo opcional.
- tests/viscosity.test.js: 15 tests.
- sw.js: caché v16. package.json 5.1.6.

## v5.1.5 (2026-09-12) — NUEVO: añadir stock a cada almacén por separado (Admin → Stock)
- La sección "Stock por almacén (local)" ahora tiene entrada directa por local:
  - Botón **+** en la cabecera de cada tarjeta de almacén → abre el diálogo de entrada con ESE almacén ya preseleccionado.
  - Botón **+** junto a cada producto dentro de la tarjeta → ajusta ESE producto en ESE local (producto y almacén preseleccionados).
  - Si el local está vacío: mensaje "Sin stock en este local todavía" + botón "Añadir el primero".
- Texto de ayuda bajo el título de la sección explicando los nuevos botones.
- El diálogo sigue siendo el mismo (stock actual en vivo, chips rápidos, motivo, nota, RPC atómica adjust_stock con auditoría).
- sw.js: caché v15. package.json 5.1.5.

## v5.1.4 (2026-09-12) — FIX: el index rebotaba al admin y no dejaba entrar por PIN
- CAUSA: `app.js` redirigía automáticamente index → admin.html siempre que hubiera una sesión de admin guardada en el dispositivo (`localStorage`), y además `subscribeAuth` restauraba el admin en cada carga aunque el dispositivo estuviera en sesión PIN. El dueño no podía abrir la app de almacenes ni verificar el stock como empleado.
- FIX: eliminada la redirección automática. El index vuelve a ser el hub de entrada:
  - El admin aterriza en el home (tasas + almacenes + PIN) con un nuevo botón **"Abrir panel admin"** (solo visible con rol admin).
  - El admin puede entrar por PIN al interior de sus almacenes como antes.
  - La sesión PIN ya no es sobrescrita por la sesión de Supabase al recargar.
  - El resto de roles (gestor/vendedor) mantienen el comportamiento original (dashboard al abrir).
- `admin.html` sigue funcionando igual (acceso directo o desde el botón del home).
- sw.js: caché v14. package.json 5.1.4.

## v5.1.3b (2026-09-12) — FIX DE BASE DE DATOS: stock invisible para accesos por PIN
- CAUSA RAÍZ confirmada con la BD real: el acceso por PIN de almacén no crea sesión de Supabase (rol `anon`) y las políticas RLS de `stock` solo permitían lectura a `authenticated`. El interior del almacén veía SIEMPRE 0 filas (stock añadido invisible + "Otros almacenes" vacío/cargando).
- NUEVO `supabase/migration-v5.1.3-pin-stock.sql`: política `stock_read_pin` (lectura anon de stock, solo lectura; escribir sigue exigiendo admin/gestor) + verificaciones automáticas + secciones opcionales (movimientos por PIN, asignar almacenes al usuario yandriel).
- `policies.sql`: incluye la misma política para instalaciones nuevas.
- `INSTALACION_SUPABASE.md`: nuevo apartado "añadí stock y NO aparece / Otros almacenes carga eterno" con diagnóstico.
- sw.js: caché v13. Sin cambios funcionales en la app (el fix es 100% SQL).

## v5.16.0 — Cobro más seguro (2026-11-24)
- **Pago en varias monedas validado:** ya no se puede registrar si no cuadra con el total. Línea en vivo «Falta / Sobra / Pago completo» y botón «Resto» por moneda; el botón de registrar se deshabilita (con el motivo) hasta que cuadra.
- **Montos en su moneda:** `paidMN`/`paidEUR` se guardan en pesos/euros y `payments[].amountUSD` / `exchangeRate` llevan la conversión con la tasa del día (antes el total en USD se guardaba como MN/EUR). Sin tasa de cambio no se vende en esa moneda (USD siempre funciona).
- **Vuelto** calculado en la moneda elegida (antes comparaba contra el total en USD).
- **Errores visibles:** `handleRegister` captura excepciones y avisa; el botón muestra «Registrando…».
- **Stock** de menudeo se recomprueba al registrar. **Tarjeta obligatoria** si hay pago por transferencia.
- **Borrador del carrito** por almacén (12 h): sobrevive a recargas y actualizaciones.
- Gestores y tarjetas se reintentan si fallan al cargar.
- Nuevo `js/payment-utils.js` (+ tests) añadido a la precarga del service worker; `CACHE_VERSION` v38.
- **Pendiente (no incluido):** endurecer RLS de Supabase (PIN, `sales`, `cards` legibles por `anon`) — ver documento de revisión.
