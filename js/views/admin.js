// =====================================================
// Admin Panel — sidebar + 10 secciones
// Layout limpio: sidebar lateral fijo + contenido principal
// =====================================================

import { getStore } from "../store.js";
import {
  listUsers, saveUser, deleteUser,
  listWarehouses, saveWarehouse, saveWarehouseWithStock,
  listProducts, saveProduct, deleteProduct,
  listCategories, saveCategory, deleteCategory,
  listManagers, saveManager, deleteManager,
  listCards, saveCard, deleteCard,
  listWarehouseCommissions,
  listStock, listSales, adjustStock,
  getRateConfig, saveRateConfig, syncRatesFromElToque,
  listStockMovements,
  getSettings, saveSettings,
  // Nuevas funciones v5.3.0
  listCardsWithBalances, getCardBalance, addCardMovement,
  listAllStockAcrossWarehouses, listStockForProductInAllWarehouses,
  createStockTransfer, listStockTransfers, processStockTransfer,
} from "../db.js";
import { logout } from "../auth.js";
import { formatMoney, formatDate, formatDateShort } from "../currency.js";
import { toast, icon, showModal, closeModal, confirmDialog, esc } from "../ui.js";
import { CURRENCIES, CATEGORY_COLORS, STOCK_REASONS, STOCK_REASON_LABELS } from "../types.js";
import { uploadImageAsWebP, pickImageFile } from "../image-upload.js";
import { lineChart, barChart, COLORS } from "../charts.js";
import { exportToCSV, exportMultipleCSVs } from "../csv-export.js";
import { getGitHubConfig, saveGitHubConfig, testGitHubConnection, isGitHubConfigured } from "../github-storage.js";

// Secciones agrupadas por categoría para mejor organización
const NAV_SECTIONS = [
  {
    label: "Gestión",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "home" },
      { id: "users", label: "Usuarios", icon: "userCog" },
      { id: "products", label: "Productos", icon: "tags" },
      { id: "categories", label: "Categorías", icon: "tags" },
      { id: "warehouses", label: "Almacenes", icon: "store" },
      { id: "stock", label: "Stock general", icon: "boxes" },
      { id: "managers", label: "Gestores", icon: "users" },
      { id: "cards", label: "Tarjetas", icon: "creditCard" },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { id: "warehouseCommissions", label: "Comisiones locales", icon: "wallet" },
      { id: "profit", label: "Ganancia/Inversión", icon: "trendingUp" },
      { id: "rates", label: "Tasas", icon: "trendingUp" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { id: "transfers", label: "Transferencias", icon: "arrowLeftRight" },
      { id: "movements", label: "Movimientos", icon: "listTree" },
      { id: "storage", label: "Almacenamiento", icon: "cloud" },
      { id: "weekend", label: "Fin de semana", icon: "calendar" },
      { id: "audit", label: "Auditoría", icon: "receipt" },
    ],
  },
];

const ALL_TABS = NAV_SECTIONS.flatMap((s) => s.items);

// Exporta mountAdminPanel para que admin-app.js lo use
export function mountAdminPanel(container, user) {
  return mountAdminView(container, user);
}

export function mountAdminView(container, navigateOrUser) {
  // Soporta ambas firmas: (container, navigate) o (container, user)
  let user;
  let navigate = null;
  if (typeof navigateOrUser === "function") {
    navigate = navigateOrUser;
    user = getStore().getState().currentUser;
  } else {
    user = navigateOrUser;
  }

  if (!user || user.role !== "admin") {
    container.innerHTML = `<div class="empty-state">⚠️ Solo administradores pueden acceder a este panel</div>`;
    return () => {};
  }

  const store = getStore();
  let activeTab = "dashboard"; // Por defecto: dashboard con todas las opciones de gestión visibles
  let tabGeneration = 0;
  let sidebarOpen = false;
  let pendingTransfersCount = 0; // badge rojo en sidebar

  // Cargar conteo de transferencias pendientes para el badge del sidebar
  listStockTransfers({ status: "PENDING" }).then((pending) => {
    pendingTransfersCount = pending.length;
    // Actualizar solo el badge si la sidebar ya está renderizada
    const badgeEl = document.querySelector("[data-pending-count]");
    if (badgeEl) {
      badgeEl.textContent = String(pendingTransfersCount);
      badgeEl.style.display = pendingTransfersCount > 0 ? "" : "none";
    } else if (pendingTransfersCount > 0) {
      // Si el badge no existe pero hay pendientes, re-render el sidebar
      render();
    }
  }).catch(() => {});

  function render() {
    container.innerHTML = `
      <div class="admin-shell">
        <!-- Sidebar -->
        <aside class="admin-sidebar" id="admin-sidebar">
          <div class="admin-sidebar-header">
            <div class="brand-logo">${icon("droplet", 18)}</div>
            <div style="min-width:0;flex:1">
              <p class="font-bold" style="margin:0;font-size:0.875rem">MANNOL Admin</p>
              <p class="text-xs text-muted truncate" style="margin:0">${user.displayName}</p>
            </div>
          </div>
          <nav class="admin-sidebar-nav" aria-label="Navegación admin">
            ${NAV_SECTIONS.map((section) => `
              <div class="admin-nav-section-label">${section.label}</div>
              ${section.items.map((item) => `
                <button class="admin-nav-item ${activeTab === item.id ? 'active' : ''}" data-tab="${item.id}" aria-label="${item.label}">
                  <span class="admin-nav-item-icon">${icon(item.icon, 16)}</span>
                  <span>${item.label}</span>
                  ${item.id === "transfers" && pendingTransfersCount > 0 ? `
                    <span data-pending-count class="admin-nav-badge" style="
                      margin-left:auto;
                      background: var(--danger);
                      color: white;
                      font-size: 0.625rem;
                      font-weight: 700;
                      padding: 0.0625rem 0.375rem;
                      border-radius: var(--radius-full);
                      min-width: 1.125rem;
                      text-align: center;
                      box-shadow: 0 0 8px color-mix(in oklab, var(--danger) 50%, transparent);
                    ">${pendingTransfersCount}</span>
                  ` : ''}
                </button>
              `).join('')}
            `).join('')}
          </nav>
          <div class="admin-sidebar-footer">
            <a href="./index.html" class="admin-nav-item" aria-label="Volver a la app principal">
              <span class="admin-nav-item-icon">${icon("arrowLeft", 16)}</span>
              <span>App principal</span>
            </a>
            <button class="admin-nav-item" id="admin-export-all" style="width: 100%; margin-top: 0.25rem" aria-label="Exportar todos los datos">
              <span class="admin-nav-item-icon">${icon("download", 16)}</span>
              <span>Exportar todo</span>
            </button>
            <button class="admin-nav-item" id="admin-logout" style="color: var(--danger); width: 100%; margin-top: 0.25rem" aria-label="Cerrar sesión">
              <span class="admin-nav-item-icon">${icon("logout", 16)}</span>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </aside>

        <!-- Mobile overlay -->
        <div class="admin-sidebar-overlay" id="admin-sidebar-overlay"></div>

        <!-- Main -->
        <div class="admin-main">
          <header class="admin-topbar">
            <div class="flex items-center gap-2">
              <button class="btn btn-ghost btn-icon admin-sidebar-toggle" id="admin-toggle-sidebar" aria-label="Abrir menú">
                ${icon("menu", 20)}
              </button>
              <div>
                <h1 class="text-lg font-bold" style="margin:0" id="admin-page-title">${getActiveTabLabel()}</h1>
                <p class="text-xs text-muted" style="margin:0" id="admin-page-subtitle">Gestión completa del sistema</p>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button class="btn btn-ghost btn-icon" id="admin-refresh" aria-label="Refrescar" title="Refrescar">${icon("refresh", 18)}</button>
              <button class="btn btn-ghost btn-icon" id="admin-theme" aria-label="Cambiar tema" title="Tema">${store.getState().theme === 'dark' ? icon("sun", 18) : icon("moon", 18)}</button>
            </div>
          </header>
          <div class="admin-content" id="admin-tab-content"></div>
        </div>
      </div>
    `;

    // Wire up navigation
    container.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        container.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
        const titleEl = container.querySelector("#admin-page-title");
        if (titleEl) titleEl.textContent = getActiveTabLabel();
        closeSidebar();
        renderTabContent();
      });
    });

    // Mobile sidebar toggle
    const toggleBtn = container.querySelector("#admin-toggle-sidebar");
    const overlay = container.querySelector("#admin-sidebar-overlay");
    const sidebar = container.querySelector("#admin-sidebar");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        sidebarOpen = !sidebarOpen;
        sidebar.classList.toggle("open", sidebarOpen);
        overlay.classList.toggle("show", sidebarOpen);
      });
    }
    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    // Refresh
    container.querySelector("#admin-refresh")?.addEventListener("click", () => {
      const btn = container.querySelector("#admin-refresh");
      btn.innerHTML = `<div class="spinner spinner-sm"></div>`;
      setTimeout(() => {
        btn.innerHTML = icon("refresh", 18);
        renderTabContent();
      }, 400);
    });

    // Theme
    container.querySelector("#admin-theme")?.addEventListener("click", () => {
      const current = store.getState().theme;
      const next = current === 'dark' ? 'light' : 'dark';
      store.setTheme(next);
      render();
    });

    // Logout
    container.querySelector("#admin-logout")?.addEventListener("click", async () => {
      await logout();
      toast("Sesión cerrada", "info");
      window.location.href = "./index.html";
    });

    // Exportar todos los datos (backup completo por apartados)
    container.querySelector("#admin-export-all")?.addEventListener("click", async () => {
      // Confirmación con dialog mostrando qué se va a exportar
      confirmDialog(
        "<strong>Exportar todos los datos</strong><br><br>Se van a descargar múltiples archivos CSV (uno por apartado: almacenes, productos, ventas, stock, movimientos, comisiones, transferencias, tarjetas, usuarios, etc.). ¿Continuar?",
        async () => {
          toast("Preparando exportación completa...", "info", 3000);
          try {
            const { getAllDataForExport } = await import("../db.js");
            const data = await getAllDataForExport();
            if (!data) {
              toast("No se pudieron cargar los datos. ¿Supabase está configurado?", "error");
              return;
            }

            // Mapear cada apartado a un dataset con columnas legibles
            const datasets = [];

            // 1. Almacenes
            if (data.warehouses && data.warehouses.length > 0) {
              datasets.push({
                filename: "01-almacenes",
                rows: data.warehouses.map((w) => ({
                  id: w.id,
                  nombre: w.name,
                  codigo: w.code,
                  direccion: w.address,
                  telefono: w.phone,
                  activo: w.active ? "Sí" : "No",
                  pin: w.pin || "",
                  comision_vendedor_pct: w.sellerCommissionPercent,
                  moneda_comision: w.sellerCommissionCurrency,
                  fecha_creacion: w.createdAt ? new Date(w.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 2. Productos
            if (data.products && data.products.length > 0) {
              datasets.push({
                filename: "02-productos",
                rows: data.products.map((p) => ({
                  id: p.id,
                  nombre: p.name,
                  marca: p.brand,
                  sku: p.sku,
                  viscosidad: p.viscosity,
                  volumen_litros: p.volumeLiters,
                  categoria: p.categoryName,
                  precio_costo: p.costPrice,
                  precio_venta: p.salePrice,
                  stock_minimo: p.minStock,
                  comision_gestor: p.gestorCommission,
                  moneda_comision_gestor: p.gestorCommissionCurrency,
                  comision_vendedor: p.vendorCommission,
                  moneda_comision_vendedor: p.vendorCommissionCurrency,
                  unidades_por_caja: p.unitsPerBox,
                  activo: p.active ? "Sí" : "No",
                  fecha_creacion: p.createdAt ? new Date(p.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 3. Categorías
            if (data.categories && data.categories.length > 0) {
              datasets.push({
                filename: "03-categorias",
                rows: data.categories.map((c) => ({
                  id: c.id,
                  nombre: c.name,
                  slug: c.slug,
                  color: c.color,
                  icono: c.icon,
                  orden: c.sortOrder,
                  activo: c.active ? "Sí" : "No",
                })),
              });
            }

            // 4. Subcategorías
            if (data.subcategories && data.subcategories.length > 0) {
              datasets.push({
                filename: "04-subcategorias",
                rows: data.subcategories.map((c) => ({
                  id: c.id,
                  categoria_id: c.categoryId,
                  nombre: c.name,
                  slug: c.slug,
                  orden: c.sortOrder,
                  activo: c.active ? "Sí" : "No",
                })),
              });
            }

            // 5. Gestores (managers)
            if (data.managers && data.managers.length > 0) {
              datasets.push({
                filename: "05-gestores",
                rows: data.managers.map((m) => ({
                  id: m.id,
                  nombre: m.name,
                  codigo: m.code,
                  telefono: m.phone,
                  email: m.email,
                  tipo: m.managerType || "REFERRER",
                  almacen_id: m.warehouseId || "",
                  tipo_comision: m.commissionType || "PERCENT",
                  comision: m.commission,
                  moneda_comision: m.commissionCurrency || "USD",
                  notas: m.notes || "",
                  activo: m.active ? "Sí" : "No",
                  fecha_creacion: m.createdAt ? new Date(m.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 6. Tarjetas
            if (data.cards && data.cards.length > 0) {
              datasets.push({
                filename: "06-tarjetas",
                rows: data.cards.map((c) => ({
                  id: c.id,
                  nombre: c.name,
                  numero: c.number,
                  banco: c.bank,
                  saldo_inicial: c.initialBalance,
                  moneda_saldo: c.balanceCurrency,
                  activa: c.active ? "Sí" : "No",
                  fecha_creacion: c.createdAt ? new Date(c.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 7. Usuarios
            if (data.users && data.users.length > 0) {
              datasets.push({
                filename: "07-usuarios",
                rows: data.users.map((u) => ({
                  id: u.id,
                  username: u.username,
                  nombre: u.displayName,
                  email: u.email,
                  rol: u.role,
                  activo: u.active ? "Sí" : "No",
                  almacen_id: u.warehouseId || "",
                  nombre_almacen: u.warehouseName,
                  codigo_almacen: u.warehouseCode,
                  fecha_creacion: u.createdAt ? new Date(u.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 8. Ventas
            if (data.sales && data.sales.length > 0) {
              datasets.push({
                filename: "08-ventas",
                rows: data.sales.map((s) => ({
                  id: s.id,
                  codigo: s.code,
                  almacen_id: s.warehouseId,
                  almacen_nombre: s.warehouseName,
                  almacen_codigo: s.warehouseCode,
                  usuario_id: s.userId,
                  usuario_nombre: s.userName,
                  gestor_id: s.managerId,
                  gestor_nombre: s.managerName,
                  gestor_codigo: s.managerCode,
                  tipo_venta: s.saleType || "RETAIL",
                  cliente_ref: s.clientRef || "",
                  total_amount: s.totalAmount,
                  moneda: s.currency,
                  modo_pago: s.paymentMode,
                  paid_usd: s.paidUSD,
                  paid_mn: s.paidMN,
                  paid_eur: s.paidEUR,
                  paid_transfer: s.paidTransfer,
                  metodo_pago: s.paymentMethod,
                  tarjeta_id: s.cardId,
                  tarjeta_numero: s.cardNumber,
                  tarjeta_nombre: s.cardName,
                  comision_gestor_usd: s.gestorCommissionUSD,
                  comision_gestor_mn: s.gestorCommissionMN,
                  comision_vendedor_usd: s.vendorCommissionUSD,
                  comision_vendedor_mn: s.vendorCommissionMN,
                  cajas: s.boxes || "",
                  precio_por_caja: s.pricePerBox || "",
                  comision_vendedor_por_caja: s.vendorCommissionPerBox || "",
                  comision_gestor_por_caja: s.gestorCommissionPerBox || "",
                  dia_semana: s.dayOfWeek,
                  redirigido_fin_semana: s.weekendRedirect ? "Sí" : "No",
                  almacen_origen_id: s.originalWarehouseId,
                  estado: s.status,
                  nota: s.note,
                  fecha_creacion: s.createdAt ? new Date(s.createdAt).toLocaleString("es-ES") : "",
                  fecha_completado: s.completedAt ? new Date(s.completedAt).toLocaleString("es-ES") : "",
                  fecha_cancelado: s.cancelledAt ? new Date(s.cancelledAt).toLocaleString("es-ES") : "",
                  motivo_cancelacion: s.cancelReason,
                  fecha_sync: s.syncedAt ? new Date(s.syncedAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 9. Stock (inventario actual)
            if (data.stock && data.stock.length > 0) {
              datasets.push({
                filename: "09-stock",
                rows: data.stock.map((s) => ({
                  id: s.id,
                  almacen_id: s.warehouseId,
                  producto_id: s.productId,
                  cantidad: s.quantity,
                  precio_local: s.localPrice,
                  stock_minimo: s.minStock,
                  fecha_actualizacion: s.updatedAt ? new Date(s.updatedAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 10. Movimientos de stock (auditoría)
            if (data.stockMovements && data.stockMovements.length > 0) {
              datasets.push({
                filename: "10-movimientos-stock",
                rows: data.stockMovements.map((m) => ({
                  id: m.id,
                  almacen_id: m.warehouseId,
                  producto_id: m.productId,
                  delta: m.delta,
                  motivo: m.reason,
                  nota: m.note,
                  usuario_id: m.userId,
                  usuario_nombre: m.userName,
                  fecha: m.createdAt ? new Date(m.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 11. Movimientos de tarjetas
            if (data.cardMovements && data.cardMovements.length > 0) {
              datasets.push({
                filename: "11-movimientos-tarjetas",
                rows: data.cardMovements.map((m) => ({
                  id: m.id,
                  tarjeta_id: m.cardId,
                  tipo_movimiento: m.movementType,
                  monto: m.amount,
                  moneda: m.currency,
                  nota: m.note,
                  venta_id: m.saleId,
                  usuario_id: m.userId,
                  usuario_nombre: m.userName,
                  fecha: m.createdAt ? new Date(m.createdAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 12. Transferencias entre almacenes
            if (data.stockTransfers && data.stockTransfers.length > 0) {
              datasets.push({
                filename: "12-transferencias",
                rows: data.stockTransfers.map((t) => ({
                  id: t.id,
                  codigo: t.code,
                  almacen_origen_id: t.fromWarehouseId,
                  almacen_destino_id: t.toWarehouseId,
                  producto_id: t.productId,
                  producto_nombre: t.productName,
                  cantidad: t.quantity,
                  estado: t.status,
                  nota: t.note,
                  solicitado_por_id: t.requestedBy,
                  solicitado_por_nombre: t.requestedByName,
                  procesado_por_id: t.processedBy,
                  procesado_por_nombre: t.processedByName,
                  fecha_procesado: t.processedAt ? new Date(t.processedAt).toLocaleString("es-ES") : "",
                  fecha_creacion: t.createdAt ? new Date(t.createdAt).toLocaleString("es-ES") : "",
                  fecha_actualizacion: t.updatedAt ? new Date(t.updatedAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 13. Pagos de comisiones
            if (data.commissionPayouts && data.commissionPayouts.length > 0) {
              datasets.push({
                filename: "13-pagos-comisiones",
                rows: data.commissionPayouts.map((p) => ({
                  id: p.id,
                  gestor_id: p.managerId,
                  anio: p.year,
                  mes: p.month,
                  pagado_por_id: p.paidBy,
                  fecha_pago: p.paidAt ? new Date(p.paidAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 14. Configuración
            if (data.settings && data.settings.length > 0) {
              datasets.push({
                filename: "14-configuracion",
                rows: data.settings.map((s) => ({
                  id: s.id,
                  pin: s.pinCode,
                  nombre_negocio: s.businessName,
                  eltoque_habilitado: s.elToqueEnabled ? "Sí" : "No",
                  eltoque_markup: s.elToqueMarkup,
                  ultima_sync_tasas: s.lastRateSync ? new Date(s.lastRateSync).toLocaleString("es-ES") : "",
                  fin_semana_habilitado: s.weekendRedirectEnabled ? "Sí" : "No",
                  fin_semana_almacen_id: s.weekendWarehouseId,
                })),
              });
            }

            // 15. Tasas
            if (data.rates && data.rates.length > 0) {
              datasets.push({
                filename: "15-tasas",
                rows: data.rates.map((r) => ({
                  id: r.id,
                  moneda: r.currency,
                  tasa_usd: r.rateUSD,
                  fuente: r.source,
                  fecha_actualizacion: r.updatedAt ? new Date(r.updatedAt).toLocaleString("es-ES") : "",
                })),
              });
            }

            // 16. Configuración de tasas (elToque)
            if (data.rateConfig && data.rateConfig.length > 0) {
              datasets.push({
                filename: "16-config-tasas",
                rows: data.rateConfig.map((r) => ({
                  id: r.id,
                  token: r.elToqueToken ? "(oculto por seguridad)" : "",
                  markup: r.elToqueMarkup,
                  ultima_sync: r.lastSync ? new Date(r.lastSync).toLocaleString("es-ES") : "",
                })),
              });
            }

            const prefix = `mannol-backup-${new Date().toISOString().slice(0, 10)}`;
            const count = await exportMultipleCSVs(datasets, prefix);
            if (count === 0) {
              toast("No se encontraron datos para exportar", "error");
            } else {
              toast(`Exportación completa: ${count} archivos CSV descargados`, "success", 4000);
            }
          } catch (err) {
            console.error("Export all failed:", err);
            toast("Error al exportar: " + (err.message || "desconocido"), "error");
          }
        }
      );
    });

    renderTabContent();
  }

  function closeSidebar() {
    sidebarOpen = false;
    const sidebar = container.querySelector("#admin-sidebar");
    const overlay = container.querySelector("#admin-sidebar-overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  }

  function getActiveTabLabel() {
    const tab = ALL_TABS.find((t) => t.id === activeTab);
    return tab ? tab.label : "Admin";
  }

  function renderTabContent() {
    const content = container.querySelector("#admin-tab-content");
    if (!content) return;
    const myGen = ++tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner spinner-lg"></div><p class="text-sm text-muted mt-2">Cargando…</p></div>`;

    switch (activeTab) {
      case "dashboard": mountAnalyticsDashboard(content, myGen); break;
      case "users": mountUsersPanel(content, myGen); break;
      case "products": mountProductsPanel(content, myGen); break;
      case "categories": mountCategoriesPanel(content, myGen); break;
      case "warehouses": mountWarehousesPanel(content, myGen); break;
      case "stock": mountStockPanel(content, myGen); break;
      case "managers": mountManagersPanel(content, myGen); break;
      case "cards": mountCardsPanel(content, myGen); break;
      case "warehouseCommissions": mountWarehouseCommissionsPanel(content, myGen); break;
      case "weekend": mountWeekendPanel(content, myGen); break;
      case "transfers": mountTransfersPanel(content, myGen); break;
      case "movements": mountMovementsPanel(content, myGen); break;
      case "storage": mountStoragePanel(content, myGen); break;
      case "rates": mountRatesPanel(content, myGen); break;
      case "profit": mountProfitPanel(content, myGen); break;
      case "audit": mountAuditPanel(content, myGen); break;
    }
  }

  // ===== DASHBOARD ANALÍTICO (admin) =====
  // Vista por defecto al entrar al admin: muestra analíticas + acceso
  // rápido a TODAS las opciones de gestión (usuarios, productos, etc.)
  // Renderiza el widget de tarjetas con saldo para el dashboard admin
  function renderCardsWidget(cards) {
    if (!cards || cards.length === 0) {
      return `
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3 class="card-title flex items-center gap-1">${icon("creditCard", 14)} Saldos de tarjetas</h3>
          </div>
          <div class="card-content" style="padding:1.5rem;text-align:center">
            <div class="empty-state-icon" style="color:var(--text-muted)">${icon("creditCard", 24)}</div>
            <p class="empty-state-title text-sm">Sin tarjetas</p>
            <p class="empty-state-desc text-xs">Creá tarjetas desde la sección "Tarjetas" para ver su saldo acá.</p>
            <button class="btn btn-outline btn-sm" data-jump="cards" style="margin-top:0.75rem">${icon("plus", 12)} Crear tarjeta</button>
          </div>
        </div>
      `;
    }

    // Calcular totales por moneda
    const totalsByCurrency = {};
    cards.forEach((c) => {
      const cur = c.currency || "USD";
      if (!totalsByCurrency[cur]) totalsByCurrency[cur] = 0;
      totalsByCurrency[cur] += (c.balance || 0);
    });

    // Identificar la tarjeta con mayor saldo absoluto para mostrarle un mini-gráfico
    const topCard = cards.slice().sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0))[0];

    return `
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3 class="card-title flex items-center gap-1">${icon("creditCard", 14)} Saldos de tarjetas</h3>
          <button class="btn btn-ghost btn-sm" data-jump="cards" style="font-size:0.75rem">${icon("chevronRight", 12)} Ver detalle</button>
        </div>
        <div class="card-content" style="padding:0.875rem;display:flex;flex-direction:column;gap:0.625rem">
          <!-- Totales por moneda -->
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            ${Object.entries(totalsByCurrency).map(([cur, total]) => {
              const color = cur === "USD" ? "var(--accent-usd)" : cur === "MN" ? "var(--accent-mn)" : "var(--accent-eur)";
              const symbol = cur === "USD" ? "$" : cur === "MN" ? "₱" : "€";
              return `
                <div style="flex:1;min-width:8rem;padding:0.5rem 0.75rem;background:color-mix(in oklab, ${color} 8%, var(--bg-soft));border:1px solid color-mix(in oklab, ${color} 25%, transparent);border-radius:var(--radius)">
                  <div class="text-xs" style="color:${color};font-weight:700;letter-spacing:0.04em">${cur}</div>
                  <div class="text-lg font-bold" style="color:${color}">${symbol} ${formatMoney(total, cur)}</div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Mini-gráfico de evolución de la tarjeta con mayor saldo -->
          ${topCard ? `
            <div id="card-balance-chart-container" style="padding:0.5rem 0.25rem 0.25rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-soft)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;padding:0 0.25rem">
                <div class="text-xs text-muted" style="font-weight:600">Evolución · ${esc(topCard.name)}</div>
                <div class="text-xs text-muted">últimos 30 días</div>
              </div>
              <div id="card-balance-chart" style="padding:0 0.25rem;min-height:60px">
                <div class="text-xs text-muted text-center" style="padding:1.5rem 0">
                  <div class="spinner spinner-sm" style="margin:0 auto 0.5rem"></div>
                  Cargando evolución...
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Lista de tarjetas (resumen) -->
          <div style="display:flex;flex-direction:column;gap:0.375rem">
            ${cards.slice(0, 5).map((c) => {
              const color = (c.balance || 0) >= 0 ? 'var(--primary)' : 'var(--danger)';
              const bankColor = c.bank === 'BPA' ? 'var(--primary)' : c.bank === 'BANDEC' ? 'var(--accent-mn)' : 'var(--accent-eur)';
              return `
                <div data-card-click="${esc(c.id)}" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.625rem;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;transition:border-color 0.15s,background 0.15s" onmouseover="this.style.borderColor='color-mix(in oklab, var(--primary) 40%, transparent)';this.style.background='var(--bg-soft)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent'">
                  <div style="width:1.875rem;height:1.875rem;background:color-mix(in oklab, ${bankColor} 12%, var(--bg-soft));color:${bankColor};border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    ${icon("creditCard", 14)}
                  </div>
                  <div style="flex:1;min-width:0">
                    <div class="text-xs font-medium truncate">${esc(c.name)}</div>
                    <div class="text-xs text-muted">
                      <code style="font-family:ui-monospace,monospace;font-size:0.6875rem">${esc(c.number || '').slice(0, 4)}···${esc(c.number || '').slice(-4)}</code>
                      ${c.bank ? ` · ${esc(c.bank)}` : ''}
                    </div>
                  </div>
                  <div style="text-align:right">
                    <div class="text-sm font-bold" style="color:${color}">${formatMoney(c.balance || 0, c.currency || "USD")}</div>
                    ${c.salesCount > 0 ? `<div class="text-xs text-muted">${c.salesCount} venta(s)</div>` : ''}
                  </div>
                  <div style="color:var(--text-muted);flex-shrink:0">${icon("chevronRight", 14)}</div>
                </div>
              `;
            }).join('')}
            ${cards.length > 5 ? `
              <button class="btn btn-ghost btn-sm" data-jump="cards" style="font-size:0.75rem;align-self:center">${icon("chevronRight", 12)} Ver ${cards.length - 5} tarjetas más</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // Carga async del mini-gráfico de evolución de la tarjeta top (llamar después de render)
  async function loadCardBalanceChart(cardId) {
    try {
      const { getCardBalanceHistory } = await import("../db.js");
      const history = await getCardBalanceHistory(cardId, 30);
      const chartEl = document.getElementById("card-balance-chart");
      if (!chartEl) return;
      if (!history || history.length === 0) {
        chartEl.innerHTML = '<div class="text-xs text-muted text-center" style="padding:1rem">Sin datos suficientes para mostrar evolución.</div>';
        return;
      }
      // Usar lineChart de charts.js (ya importado arriba)
      const card = (dataCache?.cards || []).find((c) => c.id === cardId);
      const cardColor = card?.currency === "MN" ? COLORS.mn : card?.currency === "EUR" ? COLORS.eur : COLORS.usd;
      chartEl.innerHTML = `
        <div style="background:transparent">
          ${lineChart(history, {
            height: 60,
            color: cardColor,
            formatValue: (v) => formatMoney(v, card?.currency || "USD"),
          })}
        </div>
      `;
    } catch (err) {
      console.error("loadCardBalanceChart failed:", err);
      const chartEl = document.getElementById("card-balance-chart");
      if (chartEl) chartEl.innerHTML = '<div class="text-xs text-muted text-center" style="padding:1rem">Error al cargar evolución.</div>';
    }
  }

  // Modal: ver evolución detallada del saldo de una tarjeta (90 días)
  function showCardEvolutionModal(cardId) {
    const card = (dataCache?.cards || []).find((c) => c.id === cardId);
    if (!card) return;
    const close = showModal({
      title: `${esc(card.name)} · Evolución del saldo`,
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
            <div>
              <div class="text-xs text-muted">Saldo actual</div>
              <div class="text-xl font-bold" style="color:${(card.balance || 0) >= 0 ? 'var(--primary)' : 'var(--danger)'}">
                ${formatMoney(card.balance || 0, card.currency || "USD")}
              </div>
            </div>
            <div style="text-align:right">
              <div class="text-xs text-muted">Tarjeta</div>
              <div class="text-sm font-semibold">
                <code style="font-family:ui-monospace,monospace;font-size:0.75rem">${esc(card.number || '')}</code>
              </div>
              <div class="text-xs text-muted">${esc(card.bank || '—')} · ${card.salesCount || 0} venta(s) con transf.</div>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted" style="margin-bottom:0.375rem;font-weight:600">Evolución últimos 90 días</div>
            <div id="modal-card-chart" style="background:var(--bg-soft);padding:0.875rem;border-radius:var(--radius);min-height:180px">
              <div class="text-xs text-muted text-center" style="padding:3rem 0">
                <div class="spinner spinner-sm" style="margin:0 auto 0.5rem"></div>
                Cargando evolución...
              </div>
            </div>
          </div>
          <div id="modal-card-stats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem"></div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="modal-card-close">Cerrar</button>`,
    });
    document.querySelector("#modal-card-close").addEventListener("click", close);

    // Cargar evolución de 90 días
    import("../db.js").then(async ({ getCardBalanceHistory }) => {
      const history = await getCardBalanceHistory(cardId, 90);
      const chartEl = document.querySelector("#modal-card-chart");
      const statsEl = document.querySelector("#modal-card-stats");
      if (!chartEl) return;
      if (!history || history.length === 0) {
        chartEl.innerHTML = '<div class="empty-state text-xs">Sin movimientos en los últimos 90 días.</div>';
        if (statsEl) statsEl.innerHTML = '';
        return;
      }
      const cardColor = card?.currency === "MN" ? COLORS.mn : card?.currency === "EUR" ? COLORS.eur : COLORS.usd;
      chartEl.innerHTML = `
        <div style="background:transparent">
          ${lineChart(history, {
            height: 180,
            color: cardColor,
            formatValue: (v) => formatMoney(v, card?.currency || "USD"),
          })}
        </div>
      `;
      // Stats: máximo, mínimo, promedio
      if (statsEl) {
        const values = history.map((h) => h.value || 0);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        statsEl.innerHTML = `
          <div style="padding:0.5rem;background:var(--bg-soft);border-radius:var(--radius);border:1px solid var(--border);text-align:center">
            <div class="text-xs text-muted" style="font-weight:600">Máximo</div>
            <div class="text-sm font-bold text-accent">${formatMoney(max, card.currency || "USD")}</div>
          </div>
          <div style="padding:0.5rem;background:var(--bg-soft);border-radius:var(--radius);border:1px solid var(--border);text-align:center">
            <div class="text-xs text-muted" style="font-weight:600">Mínimo</div>
            <div class="text-sm font-bold text-danger">${formatMoney(min, card.currency || "USD")}</div>
          </div>
          <div style="padding:0.5rem;background:var(--bg-soft);border-radius:var(--radius);border:1px solid var(--border);text-align:center">
            <div class="text-xs text-muted" style="font-weight:600">Promedio</div>
            <div class="text-sm font-bold">${formatMoney(avg, card.currency || "USD")}</div>
          </div>
        `;
      }
    }).catch((err) => {
      console.error("showCardEvolutionModal load failed:", err);
      const chartEl = document.querySelector("#modal-card-chart");
      if (chartEl) chartEl.innerHTML = '<div class="empty-state text-xs">Error al cargar evolución.</div>';
    });
  }


  // Renderiza el widget de transferencias pendientes para el dashboard admin
  function renderTransfersWidget(pendingTransfers) {
    if (!pendingTransfers || pendingTransfers.length === 0) {
      return '';  // No mostrar nada si no hay pendientes (dashboard más limpio)
    }

    return `
      <div class="card" style="border-color: color-mix(in oklab, var(--warning) 35%, transparent)">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;background: color-mix(in oklab, var(--warning) 5%, transparent);border-bottom-color: color-mix(in oklab, var(--warning) 20%, transparent)">
          <h3 class="card-title flex items-center gap-1" style="color:var(--warning)">${icon("arrowLeftRight", 14)} Transferencias pendientes</h3>
          <button class="btn btn-ghost btn-sm" data-jump="transfers" style="font-size:0.75rem">${icon("chevronRight", 12)} Ver todas</button>
        </div>
        <div class="card-content" style="padding:0.625rem;display:flex;flex-direction:column;gap:0.375rem">
          <div class="text-xs text-muted" style="padding:0.25rem 0.5rem">${pendingTransfers.length} transferencia(s) esperando confirmación</div>
          ${pendingTransfers.slice(0, 5).map((t) => `
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.625rem;border:1px solid var(--border);border-radius:var(--radius);background: color-mix(in oklab, var(--warning) 3%, var(--bg-soft))">
              <div style="width:2rem;height:2rem;background: color-mix(in oklab, var(--warning) 12%, var(--bg-soft));color: var(--warning);border-radius: var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${icon("arrowLeftRight", 14)}
              </div>
              <div style="flex:1;min-width:0">
                <div class="text-xs font-medium truncate">${esc(t.productName || 'Producto')}</div>
                <div class="text-xs text-muted">
                  <span class="font-mono" style="font-size:0.6875rem">${esc(t.code || '')}</span>
                  · <strong>${t.quantity}</strong> u
                  ${t.requestedByName ? ` · ${esc(t.requestedByName)}` : ''}
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-jump="transfers" style="padding:0.25rem 0.5rem;font-size:0.625rem;white-space:nowrap">Revisar</button>
            </div>
          `).join('')}
          ${pendingTransfers.length > 5 ? `
            <button class="btn btn-ghost btn-sm" data-jump="transfers" style="font-size:0.75rem;align-self:center">${icon("chevronRight", 12)} Ver ${pendingTransfers.length - 5} pendientes más</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  function mountAnalyticsDashboard(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner spinner-lg"></div><p class="text-sm text-muted mt-2">Cargando panel…</p></div>`;
    let range = 30; // días
    let dataCache = null;

    async function load() {
      if (gen !== tabGeneration) return;
      // Renderizar primero el shell con acceso rápido, luego cargar datos
      content.innerHTML = renderShell();
      wireQuickAccess();
      try {
        const [allSales, cardsWithBalances, unpaidReminder, pendingTransfers] = await Promise.all([
          listSales({}),
          listCardsWithBalances(),
          import("../db.js").then((m) => m.getUnpaidCommissionsFromPreviousMonth()),
          listStockTransfers({ status: "PENDING" }),
        ]);
        if (gen !== tabGeneration) return;
        const now = Date.now();
        const from = now - range * 86400000;
        dataCache = { allSales, filtered: allSales.filter((s) => s.createdAt >= from), cards: cardsWithBalances, unpaidReminder, pendingTransfers };
        renderDashboard();
      } catch (err) {
        console.error("Dashboard load failed:", err);
        if (gen !== tabGeneration) return;
        // Mostrar acceso rápido aunque falle la carga de datos
        const inner = content.querySelector("#dashboard-content");
        if (inner) inner.innerHTML = `<div class="card" style="background: var(--bg-soft); padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.875rem">No se pudieron cargar las analíticas. Usa las opciones de gestión abajo para empezar.</div>`;
      }
    }

    /**
     * Shell con título + botones de rango + grid de acceso rápido
     * (todos los paneles de gestión visibles de un vistazo).
     */
    function renderShell() {
      return `<div style="display:flex;flex-direction:column;gap:1rem">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 class="text-lg font-bold flex items-center gap-2">${icon("home", 20)} Panel de administración</h2>
            <p class="text-xs text-muted">Resumen del negocio y acceso rápido a todas las secciones</p>
          </div>
          <div class="flex gap-1">
            <button class="btn ${range === 7 ? 'btn-primary' : 'btn-outline'} btn-sm" data-range="7">7d</button>
            <button class="btn ${range === 30 ? 'btn-primary' : 'btn-outline'} btn-sm" data-range="30">30d</button>
            <button class="btn ${range === 90 ? 'btn-primary' : 'btn-outline'} btn-sm" data-range="90">90d</button>
            <button class="btn ${range === 365 ? 'btn-primary' : 'btn-outline'} btn-sm" data-range="365">1 año</button>
          </div>
        </div>

        <!-- ACCESO RÁPIDO: todas las opciones de gestión visibles al entrar -->
        <div>
          <p class="text-xs font-semibold text-muted" style="text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.5rem">Acceso rápido · Gestión</p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <button class="quick-access-card" data-jump="users" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:var(--primary-tint);color:var(--primary);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("userCog", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Usuarios</div>
                  <div class="text-xs text-muted">Admin, gestores, vendedores</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="products" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:var(--primary-tint);color:var(--primary);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("tags", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Productos</div>
                  <div class="text-xs text-muted">Catálogo e imágenes</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="categories" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:var(--primary-tint);color:var(--primary);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("tags", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Categorías</div>
                  <div class="text-xs text-muted">Organizar catálogo</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="warehouses" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:var(--primary-tint);color:var(--primary);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("store", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Almacenes</div>
                  <div class="text-xs text-muted">Sucursales y comisiones</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="managers" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:var(--primary-tint);color:var(--primary);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("users", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Gestores</div>
                  <div class="text-xs text-muted">Referidores y comisiones</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="cards" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:var(--primary-tint);color:var(--primary);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("creditCard", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Tarjetas</div>
                  <div class="text-xs text-muted">Cuentas para transferencias</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- ACCESO RÁPIDO: finanzas -->
        <div>
          <p class="text-xs font-semibold text-muted" style="text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.5rem">Acceso rápido · Finanzas</p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <button class="quick-access-card" data-jump="warehouseCommissions" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:color-mix(in oklab, var(--accent-usd) 15%, transparent);color:var(--accent-usd);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("wallet", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Comisiones locales</div>
                  <div class="text-xs text-muted">Pagos a vendedores</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="profit" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:color-mix(in oklab, var(--accent-usd) 15%, transparent);color:var(--accent-usd);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("trendingUp", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Ganancia/Inversión</div>
                  <div class="text-xs text-muted">Margen y retorno</div>
                </div>
              </div>
            </button>
            <button class="quick-access-card" data-jump="rates" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:color-mix(in oklab, var(--accent-usd) 15%, transparent);color:var(--accent-usd);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("trendingUp", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Tasas elToque</div>
                  <div class="text-xs text-muted">Conversión de moneda</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- ACCESO RÁPIDO: sistema -->
        <div>
          <p class="text-xs font-semibold text-muted" style="text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.5rem">Acceso rápido · Sistema</p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <button class="quick-access-card" data-jump="audit" style="border:1px solid var(--border);background:var(--bg-elevated);border-radius:var(--radius-lg);padding:0.875rem;text-align:left;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:2.5rem;height:2.5rem;background:color-mix(in oklab, var(--info) 15%, transparent);color:var(--info);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon("receipt", 18)}</div>
                <div style="min-width:0">
                  <div class="font-semibold text-sm">Auditoría</div>
                  <div class="text-xs text-muted">Movimientos de stock</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Sección analítica: se carga después de las tarjetas -->
        <div id="dashboard-content">
          <div class="empty-state"><div class="spinner"></div><p class="text-sm text-muted mt-2">Cargando analíticas…</p></div>
        </div>
      </div>`;
    }

    /**
     * Conecta los handlers de las tarjetas de acceso rápido para
     * saltar a la sección correspondiente.
     */
    function wireQuickAccess() {
      content.querySelectorAll("[data-jump]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.jump;
          // Cambiar tab activo en el sidebar y re-renderizar contenido
          activeTab = target;
          // Actualizar sidebar highlight
          const sidebarItems = container.querySelectorAll("[data-tab]");
          sidebarItems.forEach((b) => b.classList.toggle("active", b.dataset.tab === target));
          // Actualizar título
          const titleEl = container.querySelector("#admin-page-title");
          if (titleEl) titleEl.textContent = getActiveTabLabel();
          // Cerrar sidebar en mobile
          closeSidebar();
          // Renderizar el panel correspondiente
          renderTabContent();
          // Hacer scroll al top
          const main = container.querySelector(".admin-main");
          if (main) main.scrollTop = 0;
        });

        // Efecto hover
        btn.addEventListener("mouseenter", () => {
          btn.style.transform = "translateY(-2px)";
          btn.style.boxShadow = "var(--shadow-md)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.transform = "";
          btn.style.boxShadow = "";
        });
      });

      // Botones de rango temporal
      content.querySelectorAll("[data-range]").forEach((btn) => {
        btn.addEventListener("click", () => {
          range = parseInt(btn.dataset.range) || 30;
          content.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("btn-primary", parseInt(b.dataset.range) === range));
          content.querySelectorAll("[data-range]").forEach((b) => { if (parseInt(b.dataset.range) !== range) b.classList.add("btn-outline"); });
          load();
        });
      });
    }

    function renderDashboard() {
      if (!dataCache) return;
      const { filtered } = dataCache;
      const completed = filtered.filter((s) => s.status === "COMPLETADA");
      const cancelled = filtered.filter((s) => s.status === "CANCELADA");
      const pending = filtered.filter((s) => s.status === "PENDIENTE");

      // Hook: después de renderizar, cargar el mini-gráfico de evolución de la tarjeta top
      setTimeout(() => {
        const topCard = (dataCache.cards || []).slice().sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0))[0];
        if (topCard) loadCardBalanceChart(topCard.id);
      }, 100);

      // Hook: cablear clicks en las tarjetas del widget para abrir modal con su evolución
      setTimeout(() => {
        document.querySelectorAll("[data-card-click]").forEach((el) => {
          el.addEventListener("click", () => showCardEvolutionModal(el.dataset.cardClick));
        });
      }, 100);

      const totalRevenue = completed.reduce((s, x) => s + x.totalAmount, 0);
      const totalUnits = completed.reduce((s, x) => s + x.items.reduce((a, i) => a + i.quantity, 0), 0);
      const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;
      const cancelRate = filtered.length > 0 ? Math.round((cancelled.length / filtered.length) * 100) : 0;

      // Comparativa con período anterior
      const now = Date.now();
      const prevFrom = now - range * 2 * 86400000;
      const prevTo = now - range * 86400000;
      const prevSales = dataCache.allSales.filter((s) => s.createdAt >= prevFrom && s.createdAt < prevTo && s.status === "COMPLETADA");
      const prevRevenue = prevSales.reduce((s, x) => s + x.totalAmount, 0);
      const revenueChange = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;
      const prevCount = prevSales.length;
      const countChange = prevCount > 0 ? Math.round(((completed.length - prevCount) / prevCount) * 100) : 0;

      // Ventas por día
      const days = [];
      const nowDate = new Date();
      nowDate.setHours(0, 0, 0, 0);
      for (let i = range - 1; i >= 0; i--) {
        const day = new Date(nowDate);
        day.setDate(day.getDate() - i);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        const total = completed
          .filter((s) => s.createdAt >= day.getTime() && s.createdAt < next.getTime())
          .reduce((sum, s) => sum + s.totalAmount, 0);
        const label = day.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
        days.push({ label, value: total });
      }

      // Top productos (últimos N días)
      const productStats = {};
      for (const s of completed) {
        for (const item of s.items) {
          if (!productStats[item.productId]) {
            productStats[item.productId] = { name: item.name || item.productName, units: 0, revenue: 0 };
          }
          productStats[item.productId].units += item.quantity;
          productStats[item.productId].revenue += item.subtotal || (item.unitPrice * item.quantity);
        }
      }
      const topProducts = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      // Por moneda
      const byCurrency = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
      for (const s of completed) {
        if (s.currency && byCurrency[s.currency] !== undefined) {
          byCurrency[s.currency] += s.totalAmount;
        }
      }

      const inner = content.querySelector("#dashboard-content");
      if (!inner) return;
      inner.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem;padding-top:0.5rem;border-top:1px solid var(--border);margin-top:0.5rem">
          <p class="text-xs font-semibold text-muted" style="text-transform:uppercase;letter-spacing:0.05em;margin:0">Analíticas · ${range} días</p>

          <!-- Banner recordatorio: comisiones no pagadas del mes anterior -->
          ${dataCache.unpaidReminder?.hasUnpaid ? `
            <div style="background: linear-gradient(135deg, color-mix(in oklab, var(--warning) 12%, var(--bg-elevated)) 0%, var(--bg-elevated) 100%); border: 1px solid color-mix(in oklab, var(--warning) 40%, transparent); border-radius: var(--radius-xl); padding: 0.875rem 1rem; display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
              <div style="width:2.5rem;height:2.5rem;background:var(--warning);color:var(--warning-foreground);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${icon("alertTriangle", 18)}
              </div>
              <div style="flex:1;min-width:0">
                <div class="font-bold text-sm" style="color:var(--warning);margin:0 0 0.125rem">Comisiones pendientes de pago · ${esc(dataCache.unpaidReminder.monthLabel)}</div>
                <div class="text-xs text-muted" style="margin:0">
                  Tenés <strong>${dataCache.unpaidReminder.gestores} gestor(es)</strong> con comisiones sin marcar como pagadas del mes anterior.
                  ${dataCache.unpaidReminder.totalUSD > 0 ? ` · USD: ${formatMoney(dataCache.unpaidReminder.totalUSD, "USD")}` : ''}
                  ${dataCache.unpaidReminder.totalMN > 0 ? ` · MN: ${formatMoney(dataCache.unpaidReminder.totalMN, "MN")}` : ''}
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-jump="warehouseCommissions" style="background:var(--warning);color:var(--warning-foreground);white-space:nowrap">
                ${icon("chevronRight", 12)} Ir a comisiones
              </button>
            </div>
          ` : ''}

          <!-- KPIs principales -->
          <div class="grid grid-cols-2 gap-2">
            <div class="stat-card">
              <div class="stat-label">${icon("dollar", 14)} Ingresos (${range}d)</div>
              <div class="stat-value" style="color:var(--accent-usd)">${formatMoney(totalRevenue, "USD")}</div>
              <div class="stat-sub ${revenueChange > 0 ? 'text-accent' : revenueChange < 0 ? 'text-danger' : ''}">
                ${revenueChange > 0 ? '▲' : revenueChange < 0 ? '▼' : '–'} ${Math.abs(revenueChange)}% vs período anterior
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">${icon("cart", 14)} Ventas completadas</div>
              <div class="stat-value">${completed.length}</div>
              <div class="stat-sub ${countChange > 0 ? 'text-accent' : countChange < 0 ? 'text-danger' : ''}">
                ${countChange > 0 ? '▲' : countChange < 0 ? '▼' : '–'} ${Math.abs(countChange)}% · ${formatMoney(avgTicket, "USD")} promedio
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">${icon("boxes", 14)} Unidades vendidas</div>
              <div class="stat-value">${totalUnits}</div>
              <div class="stat-sub">${completed.length} transacciones</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--danger)">${icon("ban", 14)} Canceladas</div>
              <div class="stat-value text-danger">${cancelled.length}</div>
              <div class="stat-sub">${cancelRate}% tasa cancelación · ${pending.length} pendientes</div>
            </div>
          </div>

          <!-- ===== Widget de tarjetas con saldo ===== -->
          ${renderCardsWidget(dataCache.cards)}

          <!-- ===== Widget de transferencias pendientes ===== -->
          ${renderTransfersWidget(dataCache.pendingTransfers || [])}

          <!-- Gráfico de línea de ventas por día -->
          <div class="card">
            <div class="card-header"><h3 class="card-title">${icon("trendingUp", 14)} Ventas por día (últimos ${range} días)</h3></div>
            <div class="card-content">
              <div style="background: var(--bg-soft); padding: 1rem; border-radius: var(--radius)">
                ${lineChart(days, { height: 200, color: COLORS.primary, formatValue: (v) => formatMoney(v, "USD") })}
              </div>
            </div>
          </div>

          <div class="grid md:grid-cols-2 gap-3">
            <!-- Top productos -->
            <div class="card">
              <div class="card-header"><h3 class="card-title">${icon("tags", 14)} Top 5 productos (por ingresos)</h3></div>
              <div class="card-content" style="display:flex;flex-direction:column;gap:0.5rem">
                ${topProducts.length === 0 ? '<p class="text-xs text-muted">Sin ventas en este período</p>' :
                  topProducts.map((p, i) => `
                    <div class="flex items-center justify-between" style="padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
                      <div class="flex items-center gap-2" style="flex:1;min-width:0">
                        <span class="badge ${i === 0 ? 'badge-accent' : 'badge-outline'}" style="font-size:0.6875rem;width:1.5rem;justify-content:center">${i + 1}</span>
                        <div style="min-width:0">
                          <div class="text-sm font-medium truncate">${esc(p.name)}</div>
                          <div class="text-xs text-muted">${p.units} unidades</div>
                        </div>
                      </div>
                      <div class="text-sm font-bold">${formatMoney(p.revenue, "USD")}</div>
                    </div>
                  `).join('')
                }
              </div>
            </div>

            <!-- Por moneda -->
            <div class="card">
              <div class="card-header"><h3 class="card-title">${icon("wallet", 14)} Por moneda</h3></div>
              <div class="card-content" style="display:flex;flex-direction:column;gap:0.5rem">
                ${Object.entries(byCurrency).filter(([_, v]) => v > 0).map(([curr, amount]) => `
                  <div class="flex items-center justify-between" style="padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
                    <span class="badge ${curr === 'USD' ? 'badge-accent' : ''}" style="font-size:0.6875rem">${esc(curr)}</span>
                    <span class="font-bold">${formatMoney(amount, curr)}</span>
                  </div>
                `).join('') || '<p class="text-xs text-muted">Sin ventas en este período</p>'}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    load();
  }

  // ===== USERS =====
  function mountUsersPanel(content, gen) {
    gen = gen ?? tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listUsers().then((users) => {
      if (gen !== tabGeneration) return;
      content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Usuarios (${users.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-user">${icon("plus", 14)} Nuevo</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Almacén</th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${users.map((u) => `
                  <tr>
                    <td class="font-medium">${esc(u.displayName)}</td>
                    <td class="text-xs text-muted">${esc(u.username)}</td>
                    <td><span class="badge badge-outline">${esc(u.role)}</span></td>
                    <td class="text-xs">${esc(u.warehouseName || u.warehouseCode || '—')}</td>
                    <td class="text-center">${u.active ? `<span class="badge badge-accent">Activo</span>` : `<span class="badge">Inactivo</span>`}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-edit-user="${esc(u.id)}">Editar</button>
                      <button class="btn btn-ghost btn-sm text-danger" data-delete-user="${esc(u.id)}" title="Desactivar">${icon("trash", 12)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-user").addEventListener("click", () => showUserDialog(null, () => mountUsersPanel(content, tabGeneration)));
      content.querySelectorAll("[data-edit-user]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const u = users.find((x) => x.id === btn.dataset.editUser);
          if (u) showUserDialog(u, () => mountUsersPanel(content, tabGeneration));
        });
      });
      content.querySelectorAll("[data-delete-user]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const u = users.find((x) => x.id === btn.dataset.deleteUser);
          if (!u) return;
          confirmDialog(`¿Desactivar a ${esc(u.displayName)}? No podrá iniciar sesión.`, async () => {
            try {
              await deleteUser(u.id);
              toast("Usuario desactivado", "success");
              mountUsersPanel(content, tabGeneration);
            } catch (err) {
              toast(err.message || "Error al desactivar", "error");
            }
          });
        });
      });
    });
  }

  function showUserDialog(user, onSaved) {
    const isNew = !user;
    const u = user || {};
    const close = showModal({
      title: isNew ? "Nuevo usuario" : "Editar usuario",
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="u-name" value="${esc(u.displayName || '')}" /></div>
            <div><label class="label label-xs">Usuario *</label><input class="input" id="u-username" value="${esc(u.username || '')}" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Email</label><input class="input" type="email" id="u-email" value="${esc(u.email || '')}" /></div>
            <div><label class="label label-xs">${isNew ? 'Contraseña *' : 'Nueva contraseña (vacío = no cambiar)'}</label><input class="input" type="password" id="u-password" placeholder="••••••" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Rol *</label>
              <select class="select" id="u-role">
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
                <option value="warehouse" ${u.role === 'warehouse' ? 'selected' : ''}>Vendedor de local</option>
                <option value="gestor" ${u.role === 'gestor' ? 'selected' : ''}>Gestor</option>
              </select>
            </div>
            <div><label class="label label-xs">Estado</label>
              <select class="select" id="u-active"><option value="true" ${u.active !== false ? 'selected' : ''}>Activo</option><option value="false" ${u.active === false ? 'selected' : ''}>Inactivo</option></select>
            </div>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="u-cancel">Cancelar</button><button class="btn btn-primary" id="u-save">Guardar</button>`,
    });
    document.querySelector("#u-cancel").addEventListener("click", close);
    document.querySelector("#u-save").addEventListener("click", async () => {
      const data = {
        ...(u.id ? { id: u.id } : {}),
        displayName: document.querySelector("#u-name").value.trim(),
        username: document.querySelector("#u-username").value.trim().toLowerCase(),
        email: document.querySelector("#u-email").value.trim(),
        role: document.querySelector("#u-role").value,
        active: document.querySelector("#u-active").value === "true",
      };
      if (!data.displayName || !data.username) { toast("Nombre y usuario son obligatorios", "error"); return; }
      // Validar email si se proporciona
      if (data.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) { toast("Email inválido", "error"); return; }
      }
      await saveUser(data);
      toast("Usuario guardado", "success");
      close();
      onSaved();
    });
  }

  // ===== PRODUCTS =====
  function mountProductsPanel(content, gen) {
    gen = gen ?? tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    Promise.all([listProducts(), listCategories()]).then(([products, categories]) => {
      if (gen !== tabGeneration) return;
      content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Productos (${products.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-product">${icon("plus", 14)} Nuevo</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Marca</th><th>Categoría</th><th class="text-right">Precio</th><th class="text-right">Comisiones<br><span class="text-xs text-muted">G/V</span></th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${products.map((p) => `
                  <tr>
                    <td class="font-medium">${esc(p.name)}</td>
                    <td class="text-xs">${esc(p.brand)}</td>
                    <td class="text-xs text-muted">${esc(p.categoryName || '—')}</td>
                    <td class="text-right">${formatMoney(p.salePrice, "USD")}</td>
                    <td class="text-right text-xs">
                      <div>G: ${p.gestorCommission ?? p.commission ?? 0} ${p.gestorCommissionCurrency ?? p.commissionCurrency ?? "USD"}</div>
                      <div style="color:var(--text-muted)">V: ${p.vendorCommission ?? 0} ${p.vendorCommissionCurrency ?? "MN"}</div>
                    </td>
                    <td class="text-center">${p.active ? `<span class="badge badge-accent">Activo</span>` : `<span class="badge">Inactivo</span>`}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-stock-product="${esc(p.id)}" title="Añadir / ajustar stock por almacén">${icon("boxes", 12)}</button>
                      <button class="btn btn-ghost btn-sm" data-edit-product="${esc(p.id)}">Editar</button>
                      <button class="btn btn-ghost btn-sm text-danger" data-delete-product="${esc(p.id)}" title="Eliminar producto y su imagen">${icon("trash", 12)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-product").addEventListener("click", () => showProductDialog(null, categories, () => mountProductsPanel(content, tabGeneration)));
      content.querySelectorAll("[data-edit-product]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = products.find((x) => x.id === btn.dataset.editProduct);
          if (p) showProductDialog(p, categories, () => mountProductsPanel(content, tabGeneration));
        });
      });
      content.querySelectorAll("[data-stock-product]").forEach((btn) => {
        btn.addEventListener("click", () => {
          listWarehouses().then((whs) => {
            showStockEntryDialog({
              products,
              warehouses: whs,
              presetProductId: btn.dataset.stockProduct,
              onSaved: () => mountProductsPanel(content, tabGeneration),
            });
          });
        });
      });
      content.querySelectorAll("[data-delete-product]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = products.find((x) => x.id === btn.dataset.deleteProduct);
          if (!p) return;
          confirmDialog(`¿Eliminar ${p.name}?`, async () => {
            await deleteProduct(p.id);
            toast("Producto eliminado", "success");
            mountProductsPanel(content, tabGeneration);
          });
        });
      });
    });
  }

  function showProductDialog(product, categories, onSaved) {
    const isNew = !product;
    const p = product || {};
    const close = showModal({
      title: isNew ? "Nuevo producto" : "Editar producto",
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="p-name" value="${esc(p.name || '')}" /></div>
            <div><label class="label label-xs">Marca *</label><input class="input" id="p-brand" value="${esc(p.brand || '')}" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">SKU</label><input class="input" id="p-sku" value="${esc(p.sku || '')}" /></div>
            <div><label class="label label-xs">Viscosidad</label><input class="input" id="p-viscosity" value="${esc(p.viscosity || '')}" placeholder="5W-30" /></div>
          </div>
          <div><label class="label label-xs">Categoría</label>
            <select class="select" id="p-category">
              <option value="">(sin categoría)</option>
              ${categories.filter(c => !c.parentId).map((c) => `
                <option value="${esc(c.id)}" ${p.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>
              `).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Precio USD *</label><input class="input" type="number" step="0.01" id="p-price" value="${p.salePrice || ''}" /></div>
            <div><label class="label label-xs">Stock mínimo</label><input class="input" type="number" id="p-minStock" value="${p.minStock ?? 5}" /></div>
          </div>

          <hr class="separator" />
          <p class="text-xs font-semibold text-muted" style="margin:0 0 0.25rem">Comisión del gestor (por unidad)</p>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Monto *</label><input class="input" type="number" step="0.01" id="p-gestorCommission" value="${p.gestorCommission ?? p.commission ?? 1}" /></div>
            <div><label class="label label-xs">Moneda</label>
              <select class="select" id="p-gestorCommissionCurrency">
                <option value="USD" ${p.gestorCommissionCurrency === 'USD' ? 'selected' : ''}>USD</option>
                <option value="MN" ${p.gestorCommissionCurrency === 'MN' ? 'selected' : ''}>MN</option>
              </select>
            </div>
          </div>

          <p class="text-xs font-semibold text-muted" style="margin:0.5rem 0 0.25rem">Comisión del vendedor (por unidad)</p>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Monto *</label><input class="input" type="number" step="0.01" id="p-vendorCommission" value="${p.vendorCommission ?? 0}" /></div>
            <div><label class="label label-xs">Moneda</label>
              <select class="select" id="p-vendorCommissionCurrency">
                <option value="USD" ${p.vendorCommissionCurrency === 'USD' ? 'selected' : ''}>USD</option>
                <option value="MN" ${p.vendorCommissionCurrency === 'MN' ? 'selected' : ''}>MN</option>
              </select>
            </div>
          </div>

          <hr class="separator" />
          <div style="background: color-mix(in oklab, var(--primary) 5%, transparent); padding: 0.5rem 0.75rem; border-radius: var(--radius); border: 1px dashed color-mix(in oklab, var(--primary) 30%, transparent);">
            <p class="text-xs font-semibold" style="color: var(--primary); margin: 0 0 0.25rem">${icon("boxes", 12)} Venta mayorista (opcional)</p>
            <p class="text-xs text-muted" style="margin: 0 0 0.5rem">Configura cajas y precios escalonados. Si dejas "pomos por caja" vacío, el producto no se vende al por mayor.</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label label-xs">Pomos por caja</label>
              <input class="input" type="number" min="1" id="p-unitsPerBox" value="${p.unitsPerBox ?? ''}" placeholder="Ej: 6 (vacío = no mayorista)" />
            </div>
            <div>
              <label class="label label-xs">Costo USD (para cálculo de ganancia)</label>
              <input class="input" type="number" step="0.01" id="p-costPrice" value="${p.costPrice ?? ''}" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label class="label label-xs">Tiers de precio mayorista (JSON)</label>
            <p class="text-xs text-muted" style="margin-bottom: 0.25rem">Formato: <code>[{"minBoxes":1,"maxBoxes":5,"pricePerUnit":22,"vendorCommission":0.5,"gestorCommission":0.3}]</code></p>
            <textarea class="textarea" id="p-wholesaleTiers" style="min-height:5rem;font-family:ui-monospace,monospace;font-size:0.75rem" placeholder='[{"minBoxes":1,"maxBoxes":5,"pricePerUnit":22,"vendorCommission":0.5,"gestorCommission":0.3}]'>${p.wholesaleTiers ? JSON.stringify(p.wholesaleTiers, null, 2) : ''}</textarea>
            <div id="p-wholesaleTiers-error" class="text-xs text-danger" style="margin-top:0.25rem;display:none"></div>
          </div>
          <div>
            <label class="label label-xs">Imagen del producto</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
              <div id="p-image-preview" style="width:3rem;height:3rem;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" style="width:100%;height:100%;object-fit:cover" />` : icon("tags", 20)}
              </div>
              <div style="flex:1;display:flex;flex-direction:column;gap:0.25rem">
                <button type="button" class="btn btn-outline btn-sm" id="p-upload-btn">
                  ${icon("download", 12)} Subir imagen
                </button>
                <input class="input" id="p-image" value="${p.imageUrl || ''}" placeholder="URL o sube archivo" style="font-size:0.75rem" />
                <p class="text-xs text-muted" id="p-image-info" style="margin:0">Se convierte a WebP automáticamente</p>
              </div>
            </div>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="p-cancel">Cancelar</button><button class="btn btn-primary" id="p-save">Guardar</button>`,
    });
    document.querySelector("#p-cancel").addEventListener("click", close);

    // ===== Upload de imagen con conversión a WebP =====
    const uploadBtn = document.querySelector("#p-upload-btn");
    const imageInput = document.querySelector("#p-image");
    const imagePreview = document.querySelector("#p-image-preview");
    const imageInfo = document.querySelector("#p-image-info");
    let uploadedImageUrl = p.imageUrl || null;

    if (uploadBtn) {
      uploadBtn.addEventListener("click", async () => {
        try {
          uploadBtn.disabled = true;
          uploadBtn.innerHTML = `<div class="spinner spinner-sm"></div> Convirtiendo...`;
          const file = await pickImageFile("image/jpeg,image/png,image/webp,image/jpg");
          uploadBtn.innerHTML = `<div class="spinner spinner-sm"></div> Subiendo...`;

          const result = await uploadImageAsWebP(file, "products");
          uploadedImageUrl = result.url;

          // Actualizar UI
          imageInput.value = result.url;
          imagePreview.innerHTML = `<img src="${result.url}" style="width:100%;height:100%;object-fit:cover" />`;
          const savedText = result.savedPct > 0 ? ` · ${result.savedPct}% más pequeño` : "";
          imageInfo.innerHTML = `<span style="color:var(--accent)">WebP ${formatBytes(result.webpSize)}${savedText}</span>`;
          toast(`Imagen convertida a WebP${savedText}`, "success");
        } catch (err) {
          if (err.message !== "No se seleccionó ningún archivo") {
            toast("Error al subir imagen: " + err.message, "error");
          }
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = `${icon("download", 12)} Subir imagen`;
        }
      });
    }

    document.querySelector("#p-save").addEventListener("click", async () => {
      // Parsear wholesaleTiers
      const tiersText = document.querySelector("#p-wholesaleTiers").value.trim();
      let wholesaleTiers = [];
      if (tiersText) {
        try {
          wholesaleTiers = JSON.parse(tiersText);
          if (!Array.isArray(wholesaleTiers)) {
            throw new Error("Debe ser un array");
          }
          // Validar cada tier
          for (const tier of wholesaleTiers) {
            if (typeof tier.minBoxes !== "number") throw new Error("Cada tier debe tener minBoxes (número)");
            if (typeof tier.pricePerUnit !== "number") throw new Error("Cada tier debe tener pricePerUnit (número)");
          }
        } catch (err) {
          const errBox = document.querySelector("#p-wholesaleTiers-error");
          if (errBox) {
            errBox.textContent = "JSON inválido: " + err.message;
            errBox.style.display = "block";
          }
          toast("Revisa el formato de los tiers", "error");
          return;
        }
      }
      const unitsPerBoxVal = document.querySelector("#p-unitsPerBox").value.trim();
      const costPriceVal = document.querySelector("#p-costPrice").value.trim();

      const data = {
        ...(p.id ? { id: p.id } : {}),
        name: document.querySelector("#p-name").value.trim(),
        brand: document.querySelector("#p-brand").value.trim(),
        sku: document.querySelector("#p-sku").value.trim() || null,
        viscosity: document.querySelector("#p-viscosity").value.trim() || null,
        categoryId: document.querySelector("#p-category").value || null,
        salePrice: parseFloat(document.querySelector("#p-price").value) || 0,
        minStock: parseInt(document.querySelector("#p-minStock").value) || 0,
        costPrice: costPriceVal ? parseFloat(costPriceVal) : 0,
        // 2 comisiones separadas: gestor y vendedor
        gestorCommission: parseFloat(document.querySelector("#p-gestorCommission").value) || 0,
        gestorCommissionCurrency: document.querySelector("#p-gestorCommissionCurrency").value,
        vendorCommission: parseFloat(document.querySelector("#p-vendorCommission").value) || 0,
        vendorCommissionCurrency: document.querySelector("#p-vendorCommissionCurrency").value,
        // Mayorista
        unitsPerBox: unitsPerBoxVal ? parseInt(unitsPerBoxVal) : null,
        wholesaleTiers: wholesaleTiers,
        imageUrl: document.querySelector("#p-image").value.trim() || null,
        active: true,
      };
      if (!data.name || !data.brand) { toast("Nombre y marca son obligatorios", "error"); return; }
      // Validar coherencia: si hay tiers, debe haber unitsPerBox
      if (wholesaleTiers.length > 0 && !data.unitsPerBox) {
        toast("Para usar tiers mayorista, define 'pomos por caja'", "error");
        return;
      }
      // Estado de guardado + error real en pantalla (antes fallaba en silencio)
      const saveBtn = document.querySelector("#p-save");
      const cancelBtn = document.querySelector("#p-cancel");
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      saveBtn.innerHTML = `<div class="spinner spinner-sm"></div> Guardando...`;
      try {
        await saveProduct(data);
        toast("Producto guardado", "success");
        close();
        onSaved();
      } catch (err) {
        console.error("Error al guardar producto:", err);
        toast("No se pudo guardar: " + (err.message || "error desconocido"), "error", 6000);
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        saveBtn.innerHTML = `${icon("save", 14)} Guardar`;
      }
    });
  }

  // ===== CATEGORIES =====
  function mountCategoriesPanel(content, gen) {
    gen = gen ?? tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listCategories().then((categories) => {
      if (gen !== tabGeneration) return;
      const parents = categories.filter((c) => !c.parentId);
      const children = categories.filter((c) => c.parentId);
      content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Categorías (${parents.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-cat">${icon("plus", 14)} Nueva</button>
          </div>
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
            ${parents.map((c) => {
              const subs = children.filter((s) => s.parentId === c.id);
              return `
                <div class="border rounded p-3" style="border-color:var(--border)">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span style="font-size:1.25rem">${esc(c.icon || '📁')}</span>
                      <span class="font-semibold">${esc(c.name)}</span>
                      <span class="badge badge-outline" style="font-size:0.5625rem">${esc(c.color || 'slate')}</span>
                    </div>
                    <div class="flex gap-1">
                      <button class="btn btn-ghost btn-sm" data-edit-cat="${esc(c.id)}">Editar</button>
                      <button class="btn btn-ghost btn-sm text-danger" data-delete-cat="${esc(c.id)}">${icon("trash", 12)}</button>
                    </div>
                  </div>
                  ${subs.length > 0 ? `
                    <div style="display:flex;flex-direction:column;gap:0.25rem;padding-left:1.5rem">
                      ${subs.map((s) => `
                        <div class="flex items-center justify-between text-xs">
                          <span>${esc(s.name)}</span>
                          <button class="btn btn-ghost btn-icon btn-sm text-danger" data-delete-sub="${esc(s.id)}">${icon("trash", 12)}</button>
                        </div>
                      `).join('')}
                    </div>
                  ` : '<div class="text-xs text-muted">Sin subcategorías</div>'}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      content.querySelector("#new-cat").addEventListener("click", () => showCategoryDialog(null, () => mountCategoriesPanel(content, tabGeneration)));
      content.querySelectorAll("[data-edit-cat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = categories.find((x) => x.id === btn.dataset.editCat);
          if (c) showCategoryDialog(c, () => mountCategoriesPanel(content, tabGeneration));
        });
      });
      content.querySelectorAll("[data-delete-cat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          confirmDialog("¿Eliminar categoría?", async () => {
            await deleteCategory(btn.dataset.deleteCat);
            toast("Categoría eliminada", "success");
            mountCategoriesPanel(content, tabGeneration);
          });
        });
      });
      content.querySelectorAll("[data-delete-sub]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await deleteCategory(btn.dataset.deleteSub);
          toast("Subcategoría eliminada", "success");
          mountCategoriesPanel(content, tabGeneration);
        });
      });
    });
  }

  function showCategoryDialog(category, onSaved) {
    const isNew = !category;
    const c = category || {};
    const close = showModal({
      title: isNew ? "Nueva categoría" : "Editar categoría",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div><label class="label label-xs">Nombre *</label><input class="input" id="c-name" value="${esc(c.name || '')}" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Ícono (emoji)</label><input class="input" id="c-icon" value="${esc(c.icon || '')}" placeholder="🛢️" /></div>
            <div><label class="label label-xs">Color</label>
              <select class="select" id="c-color">
                ${CATEGORY_COLORS.map((col) => `<option value="${esc(col)}" ${c.color === col ? 'selected' : ''}>${esc(col)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div><label class="label label-xs">Orden</label><input class="input" type="number" id="c-sort" value="${c.sortOrder ?? 0}" /></div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="c-cancel">Cancelar</button><button class="btn btn-primary" id="c-save">Guardar</button>`,
    });
    document.querySelector("#c-cancel").addEventListener("click", close);
    document.querySelector("#c-save").addEventListener("click", async () => {
      const data = {
        ...(c.id ? { id: c.id } : {}),
        name: document.querySelector("#c-name").value.trim(),
        slug: document.querySelector("#c-name").value.trim().toLowerCase().replace(/\s+/g, "-"),
        icon: document.querySelector("#c-icon").value || null,
        color: document.querySelector("#c-color").value,
        sortOrder: parseInt(document.querySelector("#c-sort").value) || 0,
        parentId: null,
        active: true,
      };
      if (!data.name) { toast("Nombre obligatorio", "error"); return; }
      await saveCategory(data);
      toast("Categoría guardada", "success");
      close();
      onSaved();
    });
  }

  // ===== WAREHOUSES =====
  function mountWarehousesPanel(content, gen) {
    gen = gen ?? tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listWarehouses().then((warehouses) => {
      if (gen !== tabGeneration) return;
      const pinRevealState = new Set(); // IDs de almacenes con PIN visible
      function render() {
        content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Almacenes (${warehouses.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-wh">${icon("plus", 14)} Nuevo</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Código</th><th>Dirección</th><th class="text-right">Comisión vendedor</th><th class="text-center">PIN de acceso</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${warehouses.map((w) => {
                  const pinVisible = pinRevealState.has(w.id);
                  return `
                  <tr>
                    <td class="font-medium">${esc(w.name)}</td>
                    <td><span class="badge badge-outline">${esc(w.code)}</span></td>
                    <td class="text-xs text-muted">${esc(w.address || '—')}</td>
                    <td class="text-right text-xs">${w.sellerCommissionPercent}% ${esc(w.sellerCommissionCurrency || 'USD')}</td>
                    <td class="text-center">
                      ${w.pin ? `
                        <div style="display:inline-flex;align-items:center;gap:0.375rem">
                          <code class="font-mono" style="font-size:0.875rem;font-weight:700;color:var(--primary);background:var(--bg-soft);padding:0.125rem 0.5rem;border-radius:var(--radius-sm)">
                            ${pinVisible ? esc(w.pin) : '••••'}
                          </code>
                          <button class="btn btn-ghost btn-sm" data-reveal-pin="${esc(w.id)}" title="${pinVisible ? 'Ocultar' : 'Revelar'} PIN" style="padding:0.25rem 0.5rem">
                            ${icon(pinVisible ? "eyeOff" : "eye", 12)}
                          </button>
                        </div>
                      ` : `<span class="badge">Sin PIN (acceso libre)</span>`}
                    </td>
                    <td class="text-right">
                      <div style="display:flex;gap:0.25rem;justify-content:flex-end">
                        ${w.pin ? `<button class="btn btn-outline btn-sm" data-change-pin="${esc(w.id)}" title="Cambiar PIN">${icon("key", 12)} PIN</button>` : ''}
                        <button class="btn btn-ghost btn-sm" data-edit-wh="${esc(w.id)}">Editar</button>
                      </div>
                    </td>
                  </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
        // Wire buttons
        content.querySelector("#new-wh").addEventListener("click", () => showWarehouseDialog(null, () => mountWarehousesPanel(content, tabGeneration)));
        content.querySelectorAll("[data-edit-wh]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const w = warehouses.find((x) => x.id === btn.dataset.editWh);
            if (w) showWarehouseDialog(w, () => mountWarehousesPanel(content, tabGeneration));
          });
        });
        content.querySelectorAll("[data-reveal-pin]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.revealPin;
            if (pinRevealState.has(id)) pinRevealState.delete(id);
            else pinRevealState.add(id);
            render();
          });
        });
        content.querySelectorAll("[data-change-pin]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const w = warehouses.find((x) => x.id === btn.dataset.changePin);
            if (w) showChangePinDialog(w, () => mountWarehousesPanel(content, tabGeneration));
          });
        });
      }
      render();
    });
  }

  // Modal: cambiar solo el PIN de un almacén (sin tocar los demás campos)
  function showChangePinDialog(warehouse, onSaved) {
    const close = showModal({
      title: `Cambiar PIN de ${warehouse.name}`,
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div style="background:var(--bg-soft);padding:0.625rem 0.75rem;border-radius:var(--radius);border:1px solid var(--border)">
            <div class="text-xs text-muted">PIN actual</div>
            <code class="font-mono" style="font-size:1.125rem;font-weight:700;color:var(--primary)">${esc(warehouse.pin || '—')}</code>
          </div>
          <div>
            <label class="label label-xs">Nuevo PIN (4-8 dígitos) *</label>
            <input class="input" id="cp-pin" type="text" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="Ej: 1234" autofocus />
            <p class="text-xs text-muted" style="margin-top:0.25rem">Solo números, entre 4 y 8 dígitos. Los vendedores usan este PIN para entrar al almacén.</p>
          </div>
          <div>
            <label class="label label-xs">Confirmar nuevo PIN</label>
            <input class="input" id="cp-pin-confirm" type="text" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="Repetí el PIN" />
            <div id="cp-pin-match-error" style="display:none" class="text-xs text-danger" >${"Los PINs no coinciden"}</div>
          </div>
          <div style="background: color-mix(in oklab, var(--warning) 8%, transparent); border: 1px solid color-mix(in oklab, var(--warning) 25%, transparent); border-radius: var(--radius); padding: 0.5rem 0.75rem; display:flex;gap:0.375rem;align-items:flex-start">
            <div style="flex-shrink:0;color:var(--warning);margin-top:0.125rem">${icon("alertTriangle", 14)}</div>
            <div class="text-xs" style="color:var(--text-soft);line-height:1.5">
              Al cambiar el PIN, los vendedores que entraban con el PIN anterior no van a poder entrar más. Avisales el nuevo PIN.
            </div>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="cp-cancel">Cancelar</button><button class="btn btn-primary" id="cp-save">${icon("key", 12)} Guardar nuevo PIN</button>`,
    });
    document.querySelector("#cp-cancel").addEventListener("click", close);

    // Validar match en tiempo real
    const pinInput = document.querySelector("#cp-pin");
    const confirmInput = document.querySelector("#cp-pin-confirm");
    const errEl = document.querySelector("#cp-pin-match-error");
    function validateMatch() {
      const p1 = pinInput.value.trim();
      const p2 = confirmInput.value.trim();
      if (!p2) { errEl.style.display = 'none'; return true; }
      if (p1 !== p2) {
        errEl.style.display = 'block';
        return false;
      }
      errEl.style.display = 'none';
      return true;
    }
    confirmInput.addEventListener("input", validateMatch);
    pinInput.addEventListener("input", validateMatch);

    document.querySelector("#cp-save").addEventListener("click", async () => {
      const newPin = pinInput.value.trim();
      const confirm = confirmInput.value.trim();
      if (!newPin) { toast("Ingresá un PIN nuevo", "error"); return; }
      if (!/^\d{4,8}$/.test(newPin)) {
        toast("El PIN debe tener entre 4 y 8 dígitos numéricos", "error");
        return;
      }
      if (newPin !== confirm) {
        errEl.style.display = 'block';
        toast("Los PINs no coinciden", "error");
        return;
      }
      try {
        await saveWarehouse({ ...warehouse, pin: newPin });
        toast(`PIN de ${warehouse.name} actualizado`, "success");
        close();
        onSaved();
      } catch (err) {
        toast("Error al actualizar PIN: " + (err.message || "desconocido"), "error");
      }
    });
  }

  function showWarehouseDialog(warehouse, onSaved) {
    const isNew = !warehouse;
    const w = warehouse || {};

    // Cargar productos y stock actual (si es edición) en paralelo
    Promise.all([
      listProducts(),
      isNew ? Promise.resolve([]) : listStock(w.id),
    ]).then(([products, currentStock]) => {
      const stockMap = new Map(currentStock.map((s) => [s.productId, s]));

      const close = showModal({
        title: isNew ? "Nuevo almacén" : "Editar almacén",
        size: "lg",
        body: `
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            <div class="grid grid-cols-2 gap-2">
              <div><label class="label label-xs">Nombre *</label><input class="input" id="w-name" value="${esc(w.name || '')}" /></div>
              <div><label class="label label-xs">Código *</label><input class="input" id="w-code" value="${esc(w.code || '')}" placeholder="VIB" /></div>
            </div>
            <div><label class="label label-xs">Dirección</label><input class="input" id="w-address" value="${esc(w.address || '')}" /></div>
            <div><label class="label label-xs">Teléfono</label><input class="input" id="w-phone" value="${esc(w.phone || '')}" /></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="label label-xs">Comisión vendedor (%)</label><input class="input" type="number" step="0.1" id="w-commission" value="${w.sellerCommissionPercent ?? 3}" /></div>
              <div><label class="label label-xs">Moneda comisión</label>
                <select class="select" id="w-currency">
                  <option value="USD" ${w.sellerCommissionCurrency === 'USD' ? 'selected' : ''}>USD</option>
                  <option value="MN" ${w.sellerCommissionCurrency === 'MN' ? 'selected' : ''}>MN</option>
                </select>
              </div>
            </div>
            <div><label class="label label-xs">PIN (vacío = acceso libre, mínimo 4 dígitos)</label><input class="input" id="w-pin" value="${esc(w.pin || '')}" placeholder="2025" minlength="4" maxlength="8" pattern="[0-9]{4,8}" inputmode="numeric" /></div>

            <!-- Stock inicial por producto -->
            <div style="margin-top:0.5rem;padding-top:0.625rem;border-top:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                <div>
                  <p class="text-xs font-semibold" style="margin:0;color:var(--text)">${icon("boxes", 14)} Stock inicial por producto</p>
                  <p class="text-xs text-muted" style="margin:0.25rem 0 0">
                    ${isNew
                      ? "Cargá la cantidad inicial de cada producto. Después podés ajustarlo desde la vista del almacén."
                      : "Stock actual. Si cambiás una cantidad, se ajustará el stock (se registrará como movimiento de inventario)."}
                  </p>
                </div>
                <button class="btn btn-outline btn-sm" id="w-expand-stock" type="button" style="font-size:0.75rem">
                  ${icon("chevronDown", 12)} Mostrar productos
                </button>
              </div>
              <div id="w-stock-section" style="display:none;max-height:24rem;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:0.5rem;display:flex;flex-direction:column;gap:0.25rem">
                ${products.length === 0 ? `
                  <div class="empty-state text-xs" style="padding:1rem">Sin productos en el catálogo. Creá productos primero desde la sección Productos.</div>
                ` : products.map((p) => {
                  const s = stockMap.get(p.id);
                  const currentQty = s?.quantity ?? 0;
                  const currentPrice = s?.localPrice ?? p.salePrice ?? '';
                  return `
                    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.375rem;border:1px solid var(--border);border-radius:var(--radius)">
                      <div style="flex:1;min-width:0">
                        <div class="text-xs font-medium truncate">${esc(p.name)}</div>
                        <div class="text-xs text-muted">${esc(p.brand || '')}</div>
                      </div>
                      <input class="input" type="number" min="0" step="1" id="w-stock-${esc(p.id)}" value="${currentQty}" placeholder="0" style="width:5rem;text-align:right;padding:0.375rem 0.5rem;font-size:0.875rem" />
                      <input class="input" type="number" min="0" step="0.01" id="w-price-${esc(p.id)}" value="${currentPrice}" placeholder="precio" style="width:6rem;text-align:right;padding:0.375rem 0.5rem;font-size:0.75rem" title="Precio local (opcional)" />
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `,
        footer: `<button class="btn btn-outline" id="w-cancel">Cancelar</button><button class="btn btn-primary" id="w-save">Guardar</button>`,
      });

      document.querySelector("#w-cancel").addEventListener("click", close);

      // Toggle expandir/contraer sección de stock
      const expandBtn = document.querySelector("#w-expand-stock");
      const stockSection = document.querySelector("#w-stock-section");
      let stockExpanded = false;
      expandBtn.addEventListener("click", () => {
        stockExpanded = !stockExpanded;
        stockSection.style.display = stockExpanded ? 'flex' : 'none';
        expandBtn.innerHTML = stockExpanded
          ? `${icon("chevronUp", 12)} Ocultar productos`
          : `${icon("chevronDown", 12)} Mostrar productos`;
      });

      document.querySelector("#w-save").addEventListener("click", async () => {
        const pin = document.querySelector("#w-pin").value.trim();
        const data = {
          ...(w.id ? { id: w.id } : {}),
          name: document.querySelector("#w-name").value.trim(),
          code: document.querySelector("#w-code").value.trim().toUpperCase(),
          address: document.querySelector("#w-address").value.trim() || null,
          phone: document.querySelector("#w-phone").value.trim() || null,
          sellerCommissionPercent: parseFloat(document.querySelector("#w-commission").value) || 0,
          sellerCommissionCurrency: document.querySelector("#w-currency").value,
          pin: pin || null,
          active: true,
          _createdBy: getStore().getState().currentUser,
        };
        if (!data.name || !data.code) { toast("Nombre y código son obligatorios", "error"); return; }
        if (data.pin && !/^\d{4,8}$/.test(data.pin)) {
          toast("El PIN debe tener entre 4 y 8 dígitos numéricos", "error");
          return;
        }

        // Recoger el stock inicial de los productos (solo los que tienen cantidad > 0 o que cambiaron)
        const stockItems = [];
        if (stockExpanded) {
          for (const p of products) {
            const qtyInput = document.querySelector(`#w-stock-${CSS.escape(p.id)}`);
            const priceInput = document.querySelector(`#w-price-${CSS.escape(p.id)}`);
            if (!qtyInput) continue;
            const qty = parseInt(qtyInput.value) || 0;
            const price = priceInput ? parseFloat(priceInput.value) : null;
            const existing = stockMap.get(p.id);
            // Solo incluir si hay cantidad o si cambió respecto al stock actual
            if (qty > 0 || (existing && existing.quantity !== qty)) {
              stockItems.push({
                productId: p.id,
                quantity: qty,
                localPrice: price,
              });
            }
          }
        }

        try {
          // Si hay stock inicial, usar saveWarehouseWithStock; si no, saveWarehouse
          if (stockItems.length > 0) {
            await saveWarehouseWithStock(data, stockItems);
          } else {
            await saveWarehouse(data);
          }
          toast("Almacén guardado" + (stockItems.length > 0 ? ` · ${stockItems.length} productos con stock` : ""), "success");
          close();
          onSaved();
        } catch (err) {
          toast("Error al guardar almacén: " + (err.message || "desconocido"), "error");
        }
      });
    }).catch((err) => {
      console.error("showWarehouseDialog load failed:", err);
      toast("Error al cargar datos del almacén", "error");
    });
  }

  // ===== MANAGERS =====
  function mountManagersPanel(content, gen) {
    gen = gen ?? tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listManagers().then((managers) => {
      if (gen !== tabGeneration) return;
      content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Gestores (${managers.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-mg">${icon("plus", 14)} Nuevo</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Código</th><th>Tipo</th><th>Almacén</th><th class="text-right">Comisión</th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${managers.map((m) => {
                  const typeLabel = m.managerType === "LOCAL" ? "Local" : "Referidor";
                  const typeBadge = m.managerType === "LOCAL" ? "badge-accent" : "badge-outline";
                  const whLabel = m.managerType === "LOCAL" ? (esc(m.warehouseName || '—') + (m.warehouseCode ? ` <span class="text-muted">(${esc(m.warehouseCode)})</span>` : '')) : '—';
                  const commLabel = (m.commissionType || "PERCENT") === "PERCENT"
                    ? `${m.commission}%`
                    : `${formatMoney(m.commission, m.commissionCurrency || "USD")}`;
                  return `
                    <tr>
                      <td class="font-medium">${esc(m.name)}</td>
                      <td><span class="badge badge-outline">${esc(m.code)}</span></td>
                      <td class="text-xs"><span class="badge ${typeBadge}">${typeLabel}</span></td>
                      <td class="text-xs">${whLabel}</td>
                      <td class="text-right text-xs">${commLabel}</td>
                      <td class="text-center">${m.active ? `<span class="badge badge-accent">Activo</span>` : `<span class="badge">Inactivo</span>`}</td>
                      <td class="text-right"><button class="btn btn-ghost btn-sm" data-edit-mg="${esc(m.id)}">Editar</button></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-mg").addEventListener("click", () => showManagerDialog(null, () => mountManagersPanel(content, tabGeneration)));
      content.querySelectorAll("[data-edit-mg]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const m = managers.find((x) => x.id === btn.dataset.editMg);
          if (m) showManagerDialog(m, () => mountManagersPanel(content, tabGeneration));
        });
      });
    });
  }

  function showManagerDialog(manager, onSaved) {
    const isNew = !manager;
    const m = manager || {};
    // Cargar warehouses para el dropdown si el gestor es LOCAL
    listWarehouses().then((warehouses) => {
      // Si es nuevo, por defecto REFERRER (referidor que lleva clientes)
      const managerType = m.managerType || "REFERRER";
      const commissionType = m.commissionType || "PERCENT";
      const commissionCurrency = m.commissionCurrency || "USD";
      const close = showModal({
        title: isNew ? "Nuevo gestor" : "Editar gestor",
        body: `
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            <div class="grid grid-cols-2 gap-2">
              <div><label class="label label-xs">Nombre *</label><input class="input" id="m-name" value="${esc(m.name || '')}" /></div>
              <div><label class="label label-xs">Código (sigla) *</label><input class="input" id="m-code" value="${esc(m.code || '')}" placeholder="CM" /></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="label label-xs">Teléfono</label><input class="input" id="m-phone" value="${esc(m.phone || '')}" /></div>
              <div><label class="label label-xs">Email</label><input class="input" type="email" id="m-email" value="${esc(m.email || '')}" /></div>
            </div>

            <div style="margin-top:0.25rem;padding-top:0.5rem;border-top:1px solid var(--border)">
              <p class="text-xs font-semibold" style="margin:0 0 0.5rem;color:var(--text-soft)">Tipo de gestor</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="flex items-start gap-2 p-2 rounded cursor-pointer" style="border:1px solid var(--border);background:var(--bg-soft)">
                  <input type="radio" name="m-managerType" value="REFERRER" ${managerType === 'REFERRER' ? 'checked' : ''} style="margin-top:0.25rem" />
                  <div>
                    <div class="text-xs font-semibold">Referidor</div>
                    <div class="text-xs text-muted">Lleva clientes a la tienda. Comisión por venta referida (en cualquier almacén).</div>
                  </div>
                </label>
                <label class="flex items-start gap-2 p-2 rounded cursor-pointer" style="border:1px solid var(--border);background:var(--bg-soft)">
                  <input type="radio" name="m-managerType" value="LOCAL" ${managerType === 'LOCAL' ? 'checked' : ''} style="margin-top:0.25rem" />
                  <div>
                    <div class="text-xs font-semibold">Local</div>
                    <div class="text-xs text-muted">Trabaja en un almacén específico. Comisión sobre las ventas de ese local.</div>
                  </div>
                </label>
              </div>
            </div>

            <div id="m-warehouse-group" style="${managerType === 'LOCAL' ? '' : 'display:none'}">
              <label class="label label-xs">Almacén del gestor local</label>
              <select class="select" id="m-warehouseId">
                <option value="">— Seleccionar —</option>
                ${warehouses.map((w) => `<option value="${w.id}" ${m.warehouseId === w.id ? 'selected' : ''}>${esc(w.name)} (${esc(w.code)})</option>`).join('')}
              </select>
              <p class="text-xs text-muted" style="margin-top:0.25rem">Solo las ventas de este almacén cuentan para la comisión de este gestor.</p>
            </div>

            <div style="margin-top:0.25rem;padding-top:0.5rem;border-top:1px solid var(--border)">
              <p class="text-xs font-semibold" style="margin:0 0 0.5rem;color:var(--text-soft)">Comisión</p>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="label label-xs">Tipo</label>
                  <select class="select" id="m-commissionType">
                    <option value="PERCENT" ${commissionType === 'PERCENT' ? 'selected' : ''}>Porcentaje %</option>
                    <option value="FIXED" ${commissionType === 'FIXED' ? 'selected' : ''}>Valor fijo</option>
                  </select>
                </div>
                <div>
                  <label class="label label-xs" id="m-commission-label">Comisión ${commissionType === 'PERCENT' ? '%' : '$'}</label>
                  <input class="input" type="number" step="0.01" id="m-commission" value="${m.commission ?? 5}" />
                </div>
                <div>
                  <label class="label label-xs">Moneda</label>
                  <select class="select" id="m-commissionCurrency">
                    <option value="USD" ${commissionCurrency === 'USD' ? 'selected' : ''}>USD</option>
                    <option value="MN" ${commissionCurrency === 'MN' ? 'selected' : ''}>MN</option>
                  </select>
                </div>
              </div>
              <p class="text-xs text-muted" style="margin-top:0.25rem" id="m-commission-hint">
                ${commissionType === 'PERCENT'
                  ? 'Porcentaje aplicado al total vendido (ej: 3 = 3% del total).'
                  : 'Valor fijo pagado por cada venta completada (ej: 5 = $5 por venta).'}
              </p>
            </div>

            <div>
              <label class="label label-xs">Notas (opcional)</label>
              <textarea class="textarea" id="m-notes" placeholder="Ej: Lleva clientes de la zona de La Lisa" rows="2">${esc(m.notes || '')}</textarea>
            </div>
          </div>
        `,
        footer: `<button class="btn btn-outline" id="m-cancel">Cancelar</button><button class="btn btn-primary" id="m-save">Guardar</button>`,
      });

      // Toggle de tipo de gestor: mostrar/ocultar el campo almacén
      const radios = document.querySelectorAll('input[name="m-managerType"]');
      radios.forEach((r) => {
        r.addEventListener("change", () => {
          const whGroup = document.getElementById("m-warehouse-group");
          if (r.value === "LOCAL" && r.checked) {
            whGroup.style.display = '';
          } else if (r.value === "REFERRER" && r.checked) {
            whGroup.style.display = 'none';
            // Limpiar el warehouse seleccionado si era REFERRER
            const whSel = document.getElementById("m-warehouseId");
            if (whSel) whSel.value = '';
          }
        });
      });

      // Toggle de tipo de comisión: cambiar label y hint
      const commTypeSel = document.getElementById("m-commissionType");
      commTypeSel.addEventListener("change", () => {
        const type = commTypeSel.value;
        const label = document.getElementById("m-commission-label");
        const hint = document.getElementById("m-commission-hint");
        if (type === "PERCENT") {
          label.textContent = "Comisión %";
          hint.textContent = "Porcentaje aplicado al total vendido (ej: 3 = 3% del total).";
        } else {
          label.textContent = "Comisión $";
          hint.textContent = "Valor fijo pagado por cada venta completada (ej: 5 = $5 por venta).";
        }
      });

      document.querySelector("#m-cancel").addEventListener("click", close);
      document.querySelector("#m-save").addEventListener("click", async () => {
        const data = {
          ...(m.id ? { id: m.id } : {}),
          name: document.querySelector("#m-name").value.trim(),
          code: document.querySelector("#m-code").value.trim().toUpperCase(),
          phone: document.querySelector("#m-phone").value.trim() || null,
          email: document.querySelector("#m-email").value.trim() || null,
          // Nuevos campos
          managerType: document.querySelector('input[name="m-managerType"]:checked')?.value || "REFERRER",
          commissionType: document.querySelector("#m-commissionType").value,
          commissionCurrency: document.querySelector("#m-commissionCurrency").value,
          commission: parseFloat(document.querySelector("#m-commission").value) || 0,
          warehouseId: document.querySelector("#m-warehouseId")?.value || null,
          notes: document.querySelector("#m-notes").value.trim() || null,
          active: true,
        };
        if (!data.name || !data.code) { toast("Nombre y código son obligatorios", "error"); return; }
        if (data.managerType === "LOCAL" && !data.warehouseId) {
          toast("Seleccioná el almacén del gestor local", "error");
          return;
        }
        if (data.commissionType === "PERCENT" && (data.commission < 0 || data.commission > 100)) {
          toast("El porcentaje debe estar entre 0 y 100", "error");
          return;
        }
        await saveManager(data);
        toast("Gestor guardado", "success");
        close();
        onSaved();
      });
    });
  }

  // ===== TRANSFERS (panel de transferencias entre almacenes — vista admin) =====
  function mountTransfersPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    Promise.all([
      listStockTransfers({}),
      listWarehouses(),
    ]).then(([transfers, warehouses]) => {
      if (gen !== tabGeneration) return;
      const whMap = new Map(warehouses.map((w) => [w.id, w]));
      const pending = transfers.filter((t) => t.status === "PENDING");
      const completed = transfers.filter((t) => t.status === "COMPLETED");
      const rejected = transfers.filter((t) => t.status === "REJECTED" || t.status === "CANCELLED");

      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("arrowLeftRight", 24)} Transferencias</h1>
            <p class="text-sm text-muted">Movimientos de mercancía entre almacenes · ${transfers.length} en total</p>
          </div>

          <!-- Stats -->
          <div class="grid md:grid-cols-3 gap-3">
            <div class="stat-card">
              <div class="stat-label" style="color:var(--warning)">${icon("clock", 14)} Pendientes</div>
              <div class="stat-value text-warning">${pending.length}</div>
              <div class="stat-sub">Esperando confirmación</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--accent)">${icon("check", 14)} Completadas</div>
              <div class="stat-value text-accent">${completed.length}</div>
              <div class="stat-sub">Stock ya actualizado</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--danger)">${icon("x", 14)} Rechazadas / Canceladas</div>
              <div class="stat-value text-danger">${rejected.length}</div>
              <div class="stat-sub">No se movió stock</div>
            </div>
          </div>

          <!-- Filtros rápidos -->
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-primary btn-sm" data-transfer-filter="all">Todas (${transfers.length})</button>
            <button class="btn btn-outline btn-sm" data-transfer-filter="PENDING">Pendientes (${pending.length})</button>
            <button class="btn btn-outline btn-sm" data-transfer-filter="COMPLETED">Completadas (${completed.length})</button>
            <button class="btn btn-outline btn-sm" data-transfer-filter="REJECTED">Rechazadas (${rejected.length})</button>
          </div>

          <!-- Tabla -->
          <div class="card">
            <div class="overflow-x-auto">
              ${transfers.length === 0 ? `
                <div class="empty-state" style="padding:2rem">
                  <div class="empty-state-icon">${icon("arrowLeftRight", 24)}</div>
                  <p class="empty-state-title">Sin transferencias</p>
                  <p class="empty-state-desc">Las transferencias se crean desde la vista de cada almacén (tab "Transferir").</p>
                </div>
              ` : `
                <table class="table" id="transfers-table">
                  <thead><tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Estado</th>
                    <th>Solicitado por</th>
                    <th>Fecha</th>
                    <th class="text-right">Acciones</th>
                  </tr></thead>
                  <tbody>
                    ${transfers.map((t) => {
                      const fromWh = whMap.get(t.fromWarehouseId);
                      const toWh = whMap.get(t.toWarehouseId);
                      const statusBadge = { PENDING: 'badge-warning', COMPLETED: 'badge-accent', REJECTED: 'badge-danger', CANCELLED: '' }[t.status] || '';
                      const statusLabel = { PENDING: 'Pendiente', COMPLETED: 'Completada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' }[t.status] || t.status;
                      const canProcess = t.status === "PENDING";
                      return `
                        <tr data-transfer-row data-status="${esc(t.status)}">
                          <td class="font-mono text-xs">${esc(t.code || '—')}</td>
                          <td class="font-medium">
                            ${esc(t.productName || '—')}
                            ${t.note ? `<div class="text-xs text-muted" style="font-style:italic">"${esc(t.note)}"</div>` : ''}
                          </td>
                          <td class="text-center"><strong>${t.quantity}</strong></td>
                          <td class="text-xs">
                            ${fromWh ? `${esc(fromWh.name)} <span class="badge badge-outline" style="font-size:0.5625rem">${esc(fromWh.code)}</span>` : '—'}
                          </td>
                          <td class="text-xs">
                            ${toWh ? `${esc(toWh.name)} <span class="badge badge-outline" style="font-size:0.5625rem">${esc(toWh.code)}</span>` : '—'}
                          </td>
                          <td class="text-center"><span class="badge ${statusBadge}" style="font-size:0.6875rem">${statusLabel}</span></td>
                          <td class="text-xs text-muted">${esc(t.requestedByName || '—')}</td>
                          <td class="text-xs text-muted">${formatDate(t.createdAt)}</td>
                          <td class="text-right">
                            ${canProcess ? `
                              <div style="display:flex;gap:0.25rem;justify-content:flex-end">
                                <button class="btn btn-primary btn-sm" data-admin-confirm-transfer="${esc(t.id)}" title="Confirmar y mover stock">${icon("check", 12)} Confirmar</button>
                                <button class="btn btn-outline btn-sm text-danger" data-admin-reject-transfer="${esc(t.id)}" title="Rechazar">${icon("x", 12)}</button>
                              </div>
                            ` : '<span class="text-xs text-muted">—</span>'}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </div>
      `;

      // Filtros rápidos
      content.querySelectorAll("[data-transfer-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const filter = btn.dataset.transferFilter;
          content.querySelectorAll("[data-transfer-filter]").forEach((b) => {
            b.classList.toggle("btn-primary", b === btn);
            b.classList.toggle("btn-outline", b !== btn);
          });
          content.querySelectorAll("[data-transfer-row]").forEach((row) => {
            const status = row.dataset.status;
            row.style.display = (filter === "all" || filter === status) ? "" : "none";
          });
        });
      });

      // Confirmar / rechazar
      const user = getStore().getState().currentUser;
      async function refreshPendingBadge() {
        try {
          const pending = await listStockTransfers({ status: "PENDING" });
          pendingTransfersCount = pending.length;
          render();
        } catch {}
      }
      content.querySelectorAll("[data-admin-confirm-transfer]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.adminConfirmTransfer;
          try {
            await processStockTransfer(id, "COMPLETED", user);
            toast("Transferencia confirmada. Stock movido.", "success");
            mountTransfersPanel(content, tabGeneration);
            refreshPendingBadge();
          } catch (err) {
            toast("Error: " + (err.message || "desconocido"), "error");
          }
        });
      });
      content.querySelectorAll("[data-admin-reject-transfer]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.adminRejectTransfer;
          confirmDialog("¿Rechazar esta transferencia? No se moverá stock.", async () => {
            try {
              await processStockTransfer(id, "REJECTED", user);
              toast("Transferencia rechazada", "info");
              mountTransfersPanel(content, tabGeneration);
              refreshPendingBadge();
            } catch (err) {
              toast("Error: " + (err.message || "desconocido"), "error");
            }
          });
        });
      });
    });
  }

  // ===== ENTRADA / AJUSTE DE STOCK (diálogo compartido) =====
  // Permite sumar (o restar con negativo) stock de un producto en un almacén.
  // Usado desde: panel Stock general y panel Productos.
  function showStockEntryDialog({ products, warehouses, presetProductId = "", presetWarehouseId = "", onSaved }) {
    const activeProducts = (products || []).filter((p) => p.active !== false);
    const activeWhs = (warehouses || []).filter((w) => w.active !== false);
    if (activeProducts.length === 0 || activeWhs.length === 0) {
      toast("Necesitas al menos un producto y un almacén activos", "warning");
      return;
    }

    const close = showModal({
      title: "Entrada / ajuste de stock",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div>
            <label class="label label-xs">Producto *</label>
            <select class="select" id="se-product">
              ${activeProducts.map((p) => `<option value="${esc(p.id)}" ${p.id === presetProductId ? "selected" : ""}>${esc(p.name)}${p.sku ? ` (${esc(p.sku)})` : ""}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="label label-xs">Almacén (local) *</label>
            <select class="select" id="se-warehouse">
              ${activeWhs.map((w) => `<option value="${esc(w.id)}" ${w.id === presetWarehouseId ? "selected" : ""}>${esc(w.name)} (${esc(w.code)})</option>`).join("")}
            </select>
          </div>
          <div class="text-sm" style="background:var(--bg-soft);padding:0.5rem 0.75rem;border-radius:var(--radius)" id="se-current">Stock actual: —</div>
          <div>
            <label class="label label-xs">Cantidad a añadir * <span class="text-muted">(usa negativo para restar)</span></label>
            <input class="input" id="se-qty" type="number" step="any" placeholder="0" style="font-variant-numeric:tabular-nums" />
            <div style="display:flex;gap:0.375rem;flex-wrap:wrap;margin-top:0.5rem">
              ${["-1", "+1", "+6", "+12", "+24"].map((v) => `<button type="button" class="btn btn-outline btn-xs" data-se-chip="${v}">${v}</button>`).join("")}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label label-xs">Motivo</label>
              <select class="select" id="se-reason">
                ${STOCK_REASONS.map((r) => `<option value="${r}" ${r === "AJUSTE_MANUAL" ? "selected" : ""}>${STOCK_REASON_LABELS[r] || r}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="label label-xs">Nota (opcional)</label>
              <input class="input" id="se-note" placeholder="Factura #, proveedor..." />
            </div>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="se-cancel">Cancelar</button><button class="btn btn-primary" id="se-save">${icon("check", 14)} Aplicar</button>`,
    });

    let currentQty = 0;
    async function refreshCurrent() {
      const pid = document.querySelector("#se-product")?.value;
      const wid = document.querySelector("#se-warehouse")?.value;
      const el = document.querySelector("#se-current");
      if (!el) return;
      if (!pid || !wid) { el.textContent = "Stock actual: —"; return; }
      currentQty = 0;
      el.textContent = "Stock actual: cargando…";
      try {
        const stockRows = await listStock(wid);
        const r = stockRows.find((s) => s.productId === pid);
        currentQty = r ? Number(r.quantity) || 0 : 0;
        if (el) el.innerHTML = `Stock actual: <strong style="font-variant-numeric:tabular-nums">${currentQty}</strong> uds`;
      } catch {
        if (el) el.textContent = "Stock actual: —";
      }
    }
    setTimeout(refreshCurrent, 0);
    document.querySelector("#se-product").addEventListener("change", refreshCurrent);
    document.querySelector("#se-warehouse").addEventListener("change", refreshCurrent);

    document.querySelectorAll("[data-se-chip]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const input = document.querySelector("#se-qty");
        const v = (parseFloat(input.value) || 0) + parseFloat(chip.dataset.seChip);
        input.value = String(Math.round(v * 100) / 100);
      });
    });

    document.querySelector("#se-cancel").addEventListener("click", close);
    document.querySelector("#se-save").addEventListener("click", async () => {
      const productId = document.querySelector("#se-product").value;
      const warehouseId = document.querySelector("#se-warehouse").value;
      const qty = parseFloat(document.querySelector("#se-qty").value);
      const reason = document.querySelector("#se-reason").value;
      const note = document.querySelector("#se-note").value.trim() || null;
      if (!productId || !warehouseId) { toast("Elige producto y almacén", "warning"); return; }
      if (!qty || qty === 0) { toast("La cantidad no puede ser 0", "warning"); return; }

      const saveBtn = document.querySelector("#se-save");
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<div class="spinner spinner-sm"></div> Aplicando…`;
      try {
        const user = getStore().getState().currentUser;
        await adjustStock(warehouseId, productId, qty, reason, note, user?.id, user?.displayName);
        toast(`Stock actualizado: ${currentQty} → ${currentQty + qty} uds`, "success");
        close();
        onSaved?.();
      } catch (err) {
        console.error("stock entry failed:", err);
        toast("No se pudo ajustar el stock: " + (err.message || "error desconocido"), "error", 6000);
        saveBtn.disabled = false;
        saveBtn.innerHTML = `${icon("check", 14)} Aplicar`;
      }
    });
  }

  // ===== STOCK GENERAL (vista global + separada por almacén) =====
  function mountStockPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    let allWarehouses = [];
    let allProducts = [];
    let allStock = [];
    let search = "";
    let whFilter = "";
    let onlyLow = false;
    let onlyOutOfStock = false;

    async function load() {
      try {
        const [warehouses, products, stock] = await Promise.all([
          listWarehouses(),
          listProducts(),
          listAllStockAcrossWarehouses(),
        ]);
        if (gen !== tabGeneration) return;
        allWarehouses = warehouses;
        allProducts = products;
        allStock = stock;
        render();
      } catch (err) {
        console.error("mountStockPanel load failed:", err);
        if (gen !== tabGeneration) return;
        content.innerHTML = `<div class="empty-state text-danger">Error al cargar stock: ${esc(err.message || 'desconocido')}</div>`;
      }
    }

    function render() {
      const activeWhs = allWarehouses.filter((w) => w.active !== false);

      // Mapa cantidad: productId -> { warehouseId: qty }
      const qtyMap = new Map();
      for (const r of allStock) {
        if (!qtyMap.has(r.productId)) qtyMap.set(r.productId, {});
        const m = qtyMap.get(r.productId);
        m[r.warehouseId] = (m[r.warehouseId] || 0) + (Number(r.quantity) || 0);
      }

      // Totales por almacén y global
      const totalsByWh = {};
      for (const w of activeWhs) totalsByWh[w.id] = 0;
      let grandTotal = 0;
      let productsWithStock = 0;
      let productsOut = 0;
      let productsLow = 0;

      const prodRows = allProducts.map((p) => {
        const m = qtyMap.get(p.id) || {};
        const byWh = {};
        let total = 0;
        for (const w of activeWhs) {
          const q = m[w.id] || 0;
          byWh[w.id] = q;
          total += q;
        }
        // Si hay un almacén filtrado, el "total efectivo" es solo el de ese local
        const effTotal = whFilter ? (byWh[whFilter] || 0) : total;
        const minStock = p.minStock ?? 0;
        let status = "ok";
        if (effTotal <= 0) status = "out";
        else if (minStock > 0 && effTotal <= minStock) status = "low";
        return { p, byWh, total, effTotal, status, minStock };
      });

      for (const r of prodRows) {
        if (!r.p.active && r.effTotal <= 0) continue; // inactivos sin stock no cuentan
        grandTotal += r.effTotal;
        if (r.effTotal > 0) productsWithStock++;
        for (const w of activeWhs) totalsByWh[w.id] += r.byWh[w.id] || 0;
        if (r.status === "out") productsOut++;
        else if (r.status === "low") productsLow++;
      }

      // Filtros
      let filtered = prodRows;
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((r) =>
          (r.p.name || "").toLowerCase().includes(q) ||
          (r.p.sku || "").toLowerCase().includes(q) ||
          (r.p.brand || "").toLowerCase().includes(q));
      }
      if (onlyLow) filtered = filtered.filter((r) => r.status === "low" || r.status === "out");
      if (onlyOutOfStock) filtered = filtered.filter((r) => r.status === "out");
      // Ordenar: primero problemáticos, luego alfabético
      filtered.sort((a, b) => {
        const rank = { out: 0, low: 1, ok: 2 };
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return (a.p.name || "").localeCompare(b.p.name || "");
      });

      const statusBadge = (status) => status === "out"
        ? `<span class="badge badge-danger" style="font-size:0.625rem">Agotado</span>`
        : status === "low"
          ? `<span class="badge badge-warning" style="font-size:0.625rem">${icon("alertTriangle", 10)} Bajo</span>`
          : `<span class="badge badge-accent" style="font-size:0.625rem">OK</span>`;

      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div style="min-width:0">
              <h1 class="text-2xl font-bold flex items-center gap-2">${icon("boxes", 24)} Stock general</h1>
              <p class="text-sm text-muted">Visión global y por almacén (local) de todo el inventario.</p>
            </div>
            <button class="btn btn-outline btn-sm" id="stk-export-csv">${icon("download", 12)} Exportar CSV</button>
          </div>

          <!-- Stats globales -->
          <div class="grid md:grid-cols-4 gap-3">
            <div class="stat-card">
              <div class="stat-label">${icon("boxes", 14)} Unidades totales</div>
              <div class="stat-value">${grandTotal}</div>
              <div class="stat-sub">${whFilter ? 'en el almacén seleccionado' : 'sumando todos los almacenes'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--accent)">${icon("check", 14)} Con stock</div>
              <div class="stat-value text-accent">${productsWithStock}</div>
              <div class="stat-sub">productos disponibles</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--warning)">${icon("alertTriangle", 14)} Bajo mínimo</div>
              <div class="stat-value text-warning">${productsLow}</div>
              <div class="stat-sub">conviene reponer</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--danger)">${icon("x", 14)} Agotados</div>
              <div class="stat-value text-danger">${productsOut}</div>
              <div class="stat-sub">sin unidades en ningún local</div>
            </div>
          </div>

          <!-- Stock separado por almacén -->
          <div>
            <h2 class="text-base font-semibold flex items-center gap-2" style="margin:0 0 0.5rem">${icon("store", 16)} Stock por almacén (local)</h2>
            <p class="text-xs text-muted" style="margin:0 0 0.625rem">Usa el botón <strong>+</strong> de cada local para añadir stock directamente a ese almacén, o toca un producto para ajustarlo en ese local.</p>
            <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              ${activeWhs.map((w) => `
                <div class="card" style="min-width:0">
                  <div class="card-header flex justify-between items-center" style="gap:0.5rem">
                    <h3 class="card-title text-sm flex items-center gap-2" style="min-width:0">
                      <span class="truncate">${esc(w.name)}</span>
                      <span class="badge badge-outline" style="font-size:0.5625rem;flex-shrink:0">${esc(w.code)}</span>
                    </h3>
                    <div style="display:flex;align-items:center;gap:0.375rem;flex-shrink:0">
                      <span class="badge badge-accent">${totalsByWh[w.id] || 0} u.</span>
                      <button class="btn btn-primary btn-xs" data-stk-wh-entry="${esc(w.id)}" title="Añadir stock a ${esc(w.name)}" style="white-space:nowrap">${icon("plus", 12)}</button>
                    </div>
                  </div>
                  <div class="card-content" style="padding:0.75rem;max-height:16rem;overflow-y:auto">
                    ${(() => {
                      const items = prodRows.filter((r) => (r.byWh[w.id] || 0) > 0).sort((a, b) => b.byWh[w.id] - a.byWh[w.id]);
                      if (items.length === 0) return `<div class="text-xs text-muted" style="display:flex;flex-direction:column;gap:0.5rem;align-items:flex-start">Sin stock en este local todavía.<button class="btn btn-outline btn-xs" data-stk-wh-entry="${esc(w.id)}">${icon("plus", 10)} Añadir el primero</button></div>`;
                      return items.map((r) => `
                        <div class="flex items-center justify-between gap-2" style="padding:0.25rem 0;border-bottom:1px solid var(--border)">
                          <span class="text-xs truncate" style="min-width:0" title="${esc(r.p.name)}">${esc(r.p.name)}</span>
                          <span style="display:flex;align-items:center;gap:0.25rem;flex-shrink:0">
                            <span class="text-xs font-bold ${r.byWh[w.id] <= (r.minStock || 0) ? 'text-warning' : ''}">${r.byWh[w.id]}</span>
                            <button class="btn btn-ghost btn-xs" data-stk-wh-adjust data-wh="${esc(w.id)}" data-pid="${esc(r.p.id)}" title="Ajustar ${esc(r.p.name)} en ${esc(w.name)}" style="padding:0.125rem 0.375rem">${icon("plus", 10)}</button>
                          </span>
                        </div>
                      `).join("");
                    })()}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Filtros -->
          <div class="card">
            <div class="card-content" style="padding:0.875rem;display:flex;flex-direction:column;gap:0.625rem">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div style="position:relative">
                  <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 14)}</span>
                  <input class="input" id="stk-search" placeholder="Buscar producto, SKU, marca..." value="${esc(search)}" style="padding-left:2.25rem" />
                </div>
                <div>
                  <select class="select" id="stk-warehouse">
                    <option value="">Todos los almacenes</option>
                    ${activeWhs.map((w) => `<option value="${esc(w.id)}" ${whFilter === w.id ? 'selected' : ''}>${esc(w.name)} (${esc(w.code)})</option>`).join('')}
                  </select>
                </div>
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                  <input type="checkbox" id="stk-only-low" ${onlyLow ? 'checked' : ''} />
                  Solo bajo mínimo / agotados
                </label>
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                  <input type="checkbox" id="stk-only-out" ${onlyOutOfStock ? 'checked' : ''} />
                  Solo agotados
                </label>
              </div>
            </div>
          </div>

          <!-- Matriz producto × almacén -->
          <div class="card">
            ${allStock.length === 0 ? `
              <div style="margin:0.75rem;padding:0.625rem 0.75rem;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.45);border-radius:var(--radius);font-size:0.75rem;color:var(--text-soft);display:flex;gap:0.5rem;align-items:flex-start">
                <span style="flex-shrink:0">${icon("alertTriangle", 14)}</span>
                <div>No hay ninguna fila de stock visible para tu usuario. Si acabas de añadir stock y no aparece, tu usuario quizá no tenga rol <strong>admin</strong> o no tenga asignado ese almacén (permisos por almacén). Ejecuta el SQL de verificación de <strong>INSTALACION_SUPABASE.md</strong> (tabla public.users → role, warehouse_ids).</div>
              </div>
            ` : ''}
            <div class="card-header flex justify-between" style="gap:0.5rem">
              <h2 class="card-title">Detalle por producto (${filtered.length})</h2>
              <button class="btn btn-primary btn-sm" id="stk-new-entry" style="white-space:nowrap">${icon("plus", 14)} Entrada de stock</button>
            </div>
            <div class="overflow-x-auto">
              ${filtered.length === 0 ? `
                <div class="empty-state" style="padding:2rem">
                  <div class="empty-state-icon">${icon("boxes", 24)}</div>
                  <p class="empty-state-title">Sin productos</p>
                  <p class="empty-state-desc">No hay productos que coincidan con los filtros.</p>
                </div>
              ` : `
                <table class="table">
                  <thead><tr>
                    <th>Producto</th>
                    ${activeWhs.map((w) => `<th class="text-center">${esc(w.code)}</th>`).join('')}
                    <th class="text-center">Total</th>
                    <th class="text-center">Mín.</th>
                    <th class="text-center">Estado</th>
                    <th class="text-right">Acciones</th>
                  </tr></thead>
                  <tbody>
                    ${filtered.map((r) => `
                      <tr>
                        <td style="max-width:16rem">
                          <div class="font-medium text-sm truncate" title="${esc(r.p.name)}">${esc(r.p.name)}</div>
                          <div class="text-xs text-muted truncate">${esc(r.p.brand || '')}${r.p.sku ? ` · ${esc(r.p.sku)}` : ''}</div>
                        </td>
                        ${activeWhs.map((w) => {
                          const q = r.byWh[w.id] || 0;
                          const cls = q <= 0 ? 'text-muted' : q <= (r.minStock || 0) ? 'text-warning' : '';
                          return `<td class="text-center font-semibold ${cls}">${q > 0 ? q : '·'}</td>`;
                        }).join('')}
                        <td class="text-center font-bold">${r.effTotal}</td>
                        <td class="text-center text-xs text-muted">${r.minStock || '—'}</td>
                        <td class="text-center">${statusBadge(r.status)}</td>
                        <td class="text-right">
                          <button class="btn btn-outline btn-sm" data-stk-adjust="${esc(r.p.id)}" title="Añadir / ajustar stock de este producto">${icon("boxes", 12)} Ajustar</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </div>
      `;

      const searchInput = content.querySelector("#stk-search");
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        render();
        const newInput = content.querySelector("#stk-search");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(search.length, search.length); }
      });
      content.querySelector("#stk-warehouse").addEventListener("change", (e) => {
        whFilter = e.target.value;
        // Filtrar por almacén: la columna Total pasa a mostrar solo ese almacén
        render();
      });
      content.querySelector("#stk-only-low").addEventListener("change", (e) => {
        onlyLow = e.target.checked;
        render();
      });
      content.querySelector("#stk-only-out").addEventListener("change", (e) => {
        onlyOutOfStock = e.target.checked;
        render();
      });

      // Añadir / ajustar stock
      content.querySelector("#stk-new-entry").addEventListener("click", () => {
        showStockEntryDialog({
          products: allProducts,
          warehouses: activeWhs,
          presetWarehouseId: whFilter || "",
          onSaved: () => load(),
        });
      });
      content.querySelectorAll("[data-stk-adjust]").forEach((btn) => {
        btn.addEventListener("click", () => {
          showStockEntryDialog({
            products: allProducts,
            warehouses: activeWhs,
            presetProductId: btn.dataset.stkAdjust,
            presetWarehouseId: whFilter || "",
            onSaved: () => load(),
          });
        });
      });
      // v5.1.5: entrada de stock directa en un almacén concreto (tarjeta del local)
      content.querySelectorAll("[data-stk-wh-entry]").forEach((btn) => {
        btn.addEventListener("click", () => {
          showStockEntryDialog({
            products: allProducts,
            warehouses: activeWhs,
            presetWarehouseId: btn.dataset.stkWhEntry,
            onSaved: () => load(),
          });
        });
      });
      // v5.1.5: ajustar un producto concreto dentro de un local concreto
      content.querySelectorAll("[data-stk-wh-adjust]").forEach((btn) => {
        btn.addEventListener("click", () => {
          showStockEntryDialog({
            products: allProducts,
            warehouses: activeWhs,
            presetProductId: btn.dataset.pid,
            presetWarehouseId: btn.dataset.wh,
            onSaved: () => load(),
          });
        });
      });

      // Export CSV
      content.querySelector("#stk-export-csv").addEventListener("click", () => {
        const rowsOut = filtered.map((r) => {
          const row = {
            producto: r.p.name,
            marca: r.p.brand || '',
            sku: r.p.sku || '',
          };
          for (const w of activeWhs) row[`stock_${(w.code || w.name).toLowerCase()}`] = r.byWh[w.id] || 0;
          row.total = r.effTotal;
          row.total_global = r.total;
          row.minimo = r.minStock || 0;
          row.estado = r.status === 'out' ? 'AGOTADO' : r.status === 'low' ? 'BAJO' : 'OK';
          return row;
        });
        exportToCSV('stock-general', rowsOut);
        toast(`${rowsOut.length} productos exportados`, "success");
      });
    }

    load();
  }

  // ===== MOVIMENTS (historial de movimientos de stock — vista admin) =====
  function mountMovementsPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    let filterWarehouse = "";
    let filterReason = "";
    let filterProduct = "";
    let filterFrom = "";
    let filterTo = "";
    let allMovements = [];
    let allWarehouses = [];
    let allProducts = [];

    async function load() {
      try {
        const [movements, warehouses, products] = await Promise.all([
          listStockMovements({ limit: 500 }),
          listWarehouses(),
          listProducts(),
        ]);
        if (gen !== tabGeneration) return;
        allMovements = movements;
        allWarehouses = warehouses;
        allProducts = products;
        render();
      } catch (err) {
        console.error("mountMovementsPanel load failed:", err);
        if (gen !== tabGeneration) return;
        content.innerHTML = `<div class="empty-state text-danger">Error al cargar movimientos: ${esc(err.message || 'desconocido')}</div>`;
      }
    }

    function render() {
      const whMap = new Map(allWarehouses.map((w) => [w.id, w]));
      const prodMap = new Map(allProducts.map((p) => [p.id, p]));

      // Aplicar filtros
      let filtered = allMovements;
      if (filterWarehouse) filtered = filtered.filter((m) => m.warehouseId === filterWarehouse);
      if (filterReason) filtered = filtered.filter((m) => m.reason === filterReason);
      if (filterProduct) filtered = filtered.filter((m) => m.productId === filterProduct);
      if (filterFrom) filtered = filtered.filter((m) => m.createdAt >= new Date(filterFrom).getTime());
      if (filterTo) filtered = filtered.filter((m) => m.createdAt <= new Date(filterTo).getTime() + 86400000);

      // Stats
      const totalIn = filtered.filter((m) => (m.delta || 0) > 0).reduce((s, m) => s + m.delta, 0);
      const totalOut = filtered.filter((m) => (m.delta || 0) < 0).reduce((s, m) => s + Math.abs(m.delta), 0);
      const totalMovements = filtered.length;

      const reasonLabels = {
        AJUSTE_MANUAL: "Ajuste manual",
        INVENTARIO: "Inventario",
        MERMA: "Merma",
        DEVOLUCION: "Devolución",
        VENTA: "Venta",
        CANCELACION: "Cancelación",
        REABRIR: "Reabrir",
        TRANSFERENCIA_SALIDA: "Transferencia salida",
        TRANSFERENCIA_ENTRADA: "Transferencia entrada",
      };
      const reasonColors = {
        AJUSTE_MANUAL: "badge-outline",
        INVENTARIO: "badge-outline",
        MERMA: "badge-danger",
        DEVOLUCION: "badge-accent",
        VENTA: "badge-warning",
        CANCELACION: "badge-danger",
        REABRIR: "badge-accent",
        TRANSFERENCIA_SALIDA: "badge-danger",
        TRANSFERENCIA_ENTRADA: "badge-accent",
      };

      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("listTree", 24)} Movimientos de stock</h1>
            <p class="text-sm text-muted">Auditoría completa · ${totalMovements} movimientos (mostrando últimos 500)</p>
          </div>

          <!-- Stats -->
          <div class="grid md:grid-cols-3 gap-3">
            <div class="stat-card">
              <div class="stat-label" style="color:var(--accent)">${icon("arrowDown", 14)} Entradas</div>
              <div class="stat-value text-accent">+${totalIn}</div>
              <div class="stat-sub">unidades que entraron</div>
            </div>
            <div class="stat-card">
              <div class="stat-label" style="color:var(--danger)">${icon("arrowUp", 14)} Salidas</div>
              <div class="stat-value text-danger">−${totalOut}</div>
              <div class="stat-sub">unidades que salieron</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">${icon("listTree", 14)} Total movimientos</div>
              <div class="stat-value">${totalMovements}</div>
              <div class="stat-sub">en el período filtrado</div>
            </div>
          </div>

          <!-- Aclaración + acción de nueva transferencia -->
          <div style="background: color-mix(in oklab, var(--info) 8%, var(--bg-elevated)); border: 1px solid color-mix(in oklab, var(--info) 25%, transparent); border-radius: var(--radius); padding: 0.75rem 1rem; display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
            <div style="width:2rem;height:2rem;background: color-mix(in oklab, var(--info) 15%, transparent); color: var(--info); border-radius: var(--radius); display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${icon("info", 16)}
            </div>
            <div style="flex:1;min-width:0">
              <div class="text-sm font-semibold">¿Querés mover mercancía entre almacenes?</div>
              <div class="text-xs text-muted">Una transferencia descuenta del almacén origen y suma al destino automáticamente. Queda registrada acá en el historial.</div>
            </div>
            <button class="btn btn-primary btn-sm" id="mv-new-transfer">${icon("arrowLeftRight", 12)} Nueva transferencia</button>
          </div>

          <!-- Filtros -->
          <div class="card">
            <div class="card-content" style="padding:0.875rem;display:flex;flex-direction:column;gap:0.625rem">
              <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                <div>
                  <label class="label label-xs">Almacén</label>
                  <select class="select" id="mv-filter-warehouse">
                    <option value="">Todos</option>
                    ${allWarehouses.map((w) => `<option value="${w.id}" ${filterWarehouse === w.id ? 'selected' : ''}>${esc(w.name)} (${esc(w.code)})</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="label label-xs">Producto</label>
                  <select class="select" id="mv-filter-product">
                    <option value="">Todos</option>
                    ${allProducts.map((p) => `<option value="${p.id}" ${filterProduct === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(p.brand || '')}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="label label-xs">Motivo</label>
                  <select class="select" id="mv-filter-reason">
                    <option value="">Todos</option>
                    ${Object.entries(reasonLabels).map(([val, label]) => `<option value="${val}" ${filterReason === val ? 'selected' : ''}>${label}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="label label-xs">Desde</label>
                  <input class="input" type="date" id="mv-filter-from" value="${filterFrom}" />
                </div>
                <div>
                  <label class="label label-xs">Hasta</label>
                  <input class="input" type="date" id="mv-filter-to" value="${filterTo}" />
                </div>
              </div>
              <div class="flex gap-2 flex-wrap">
                <button class="btn btn-primary btn-sm" id="mv-apply-filters">${icon("search", 12)} Aplicar filtros</button>
                <button class="btn btn-outline btn-sm" id="mv-clear-filters">Limpiar</button>
                <button class="btn btn-outline btn-sm" id="mv-export-csv" title="Exportar movimientos filtrados a CSV">${icon("download", 12)} Exportar CSV</button>
              </div>
            </div>
          </div>

          <!-- Tabla -->
          <div class="card">
            <div class="overflow-x-auto">
              ${filtered.length === 0 ? `
                <div class="empty-state" style="padding:2rem">
                  <div class="empty-state-icon">${icon("listTree", 24)}</div>
                  <p class="empty-state-title">Sin movimientos</p>
                  <p class="empty-state-desc">No hay movimientos que coincidan con los filtros seleccionados.</p>
                </div>
              ` : `
                <table class="table">
                  <thead><tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th>Motivo</th>
                    <th class="text-right">Delta</th>
                    <th>Usuario</th>
                    <th>Nota</th>
                  </tr></thead>
                  <tbody>
                    ${filtered.map((m) => {
                      const wh = whMap.get(m.warehouseId);
                      const prod = prodMap.get(m.productId);
                      const isPositive = (m.delta || 0) > 0;
                      const isZero = (m.delta || 0) === 0;
                      const reasonBadge = reasonColors[m.reason] || 'badge-outline';
                      const reasonLabel = reasonLabels[m.reason] || m.reason;
                      return `
                        <tr>
                          <td class="text-xs text-muted">${formatDateShort(m.createdAt)}</td>
                          <td class="font-medium text-sm">${esc(prod?.name || 'Producto eliminado')}</td>
                          <td class="text-xs">
                            ${wh ? `${esc(wh.name)} <span class="badge badge-outline" style="font-size:0.5625rem">${esc(wh.code)}</span>` : '—'}
                          </td>
                          <td><span class="badge ${reasonBadge}" style="font-size:0.625rem">${esc(reasonLabel)}</span></td>
                          <td class="text-right font-bold ${isZero ? '' : isPositive ? 'text-accent' : 'text-danger'}">
                            ${isZero ? '0' : (isPositive ? '+' : '−') + Math.abs(m.delta || 0)}
                          </td>
                          <td class="text-xs text-muted">${esc(m.userName || '—')}</td>
                          <td class="text-xs text-muted" style="max-width:16rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.note || '—')}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </div>
      `;

      // Cablear filtros
      content.querySelector("#mv-apply-filters").addEventListener("click", () => {
        filterWarehouse = content.querySelector("#mv-filter-warehouse").value;
        filterProduct = content.querySelector("#mv-filter-product").value;
        filterReason = content.querySelector("#mv-filter-reason").value;
        filterFrom = content.querySelector("#mv-filter-from").value;
        filterTo = content.querySelector("#mv-filter-to").value;
        render();
      });
      content.querySelector("#mv-clear-filters").addEventListener("click", () => {
        filterWarehouse = "";
        filterProduct = "";
        filterReason = "";
        filterFrom = "";
        filterTo = "";
        render();
      });

      // Export CSV con los movimientos filtrados
      const exportBtn = content.querySelector("#mv-export-csv");
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          if (filtered.length === 0) {
            toast("No hay movimientos para exportar con los filtros actuales", "error");
            return;
          }
          const rows = filtered.map((m) => {
            const wh = whMap.get(m.warehouseId);
            const prod = prodMap.get(m.productId);
            return {
              fecha: new Date(m.createdAt).toLocaleString("es-ES"),
              producto: prod?.name || 'Producto eliminado',
              marca: prod?.brand || '',
              almacen: wh?.name || '',
              codigo_almacen: wh?.code || '',
              motivo: reasonLabels[m.reason] || m.reason,
              delta: m.delta || 0,
              usuario: m.userName || '',
              nota: m.note || '',
            };
          });
          exportToCSV('movimientos-stock', rows);
          toast(`${rows.length} movimientos exportados`, "success");
        });
      }

      // Botón "Nueva transferencia" (en el panel de Movimientos — admin)
      const newTransferBtn = content.querySelector("#mv-new-transfer");
      if (newTransferBtn) {
        newTransferBtn.addEventListener("click", () => {
          showAdminTransferModal(() => load());
        });
      }
    }

    load();
  }

  // Modal reutilizable para que el admin cree una transferencia desde cualquier panel
  // (usado en Movimientos y también disponible para otras secciones)
  // v5.1: permite elegir VARIOS productos con cantidad individual antes de transferir.
  function showAdminTransferModal(onSaved) {
    // Cargar warehouses, productos y stock de todos los almacenes en paralelo
    Promise.all([
      listWarehouses(),
      listProducts(),
      listAllStockAcrossWarehouses(),
    ]).then(([warehouses, products, allStock]) => {
      const activeWarehouses = warehouses.filter((w) => w.active !== false);
      const activeProducts = products.filter((p) => p.active !== false);

      // Mapa stock: productId -> { warehouseId: qty }
      const stockMap = new Map();
      for (const r of allStock) {
        if (!stockMap.has(r.productId)) stockMap.set(r.productId, {});
        const m = stockMap.get(r.productId);
        m[r.warehouseId] = (m[r.warehouseId] || 0) + (Number(r.quantity) || 0);
      }

      const close = showModal({
        title: "Nueva transferencia entre almacenes",
        size: "lg",
        body: `
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="label label-xs">Almacén origen *</label>
                <select class="select" id="admtr-from">
                  <option value="">— Origen —</option>
                  ${activeWarehouses.map((w) => `<option value="${w.id}">${esc(w.name)} (${esc(w.code)})</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label label-xs">Almacén destino *</label>
                <select class="select" id="admtr-to">
                  <option value="">— Destino —</option>
                  ${activeWarehouses.map((w) => `<option value="${w.id}">${esc(w.name)} (${esc(w.code)})</option>`).join('')}
                </select>
              </div>
            </div>
            <div style="display:none" id="admtr-validation-error"></div>

            <!-- Productos con cantidades -->
            <div id="admtr-products-block" style="display:none;flex-direction:column;gap:0.5rem">
              <div style="position:relative">
                <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 14)}</span>
                <input class="input" id="admtr-search" placeholder="Buscar producto..." style="padding-left:2.25rem" />
              </div>
              <div class="text-xs text-muted">Escribe la cantidad a mover de cada producto (0 o vacío = no mover). Hay ${activeProducts.length} productos en los almacenes.</div>
              <div id="admtr-product-list" style="display:flex;flex-direction:column;gap:0.375rem;max-height:18rem;overflow-y:auto;padding-right:0.25rem"></div>
              <div class="flex justify-between items-center" style="background:var(--bg-soft);border-radius:var(--radius);padding:0.5rem 0.75rem">
                <span class="text-xs text-muted" id="admtr-summary">Seleccionados: Ninguno</span>
              </div>
            </div>

            <div>
              <label class="label label-xs">Nota (opcional)</label>
              <input class="input" id="admtr-note" placeholder="Ej: Reparto semanal, pedido de oficina central" />
            </div>
            <div style="background: color-mix(in oklab, var(--warning) 8%, transparent); border: 1px solid color-mix(in oklab, var(--warning) 25%, transparent); border-radius: var(--radius); padding: 0.625rem 0.75rem; display:flex;gap:0.5rem;align-items:flex-start">
              <div style="flex-shrink:0;color:var(--warning);margin-top:0.125rem">${icon("alertTriangle", 14)}</div>
              <div class="text-xs" style="color:var(--text-soft);line-height:1.5">
                La transferencia se crea en estado <strong>PENDIENTE</strong>.<br>
                Desde el panel <strong>Transferencias</strong> podés confirmarla o rechazarla.<br>
                Al confirmarla, se descuenta del almacén origen y se suma al destino automáticamente.
              </div>
            </div>
          </div>
        `,
        footer: `<button class="btn btn-outline" id="admtr-cancel">Cancelar</button><button class="btn btn-primary" id="admtr-create" disabled>${icon("arrowLeftRight", 12)} Crear transferencia</button>`,
      });

      document.querySelector("#admtr-cancel").addEventListener("click", close);

      const fromSel = document.querySelector("#admtr-from");
      const toSel = document.querySelector("#admtr-to");
      const errEl = document.querySelector("#admtr-validation-error");
      const productsBlock = document.querySelector("#admtr-products-block");
      const productListEl = document.querySelector("#admtr-product-list");
      const createBtn = document.querySelector("#admtr-create");
      let search = "";

      // Estado: cantidades elegidas por producto { productId: qty }
      const quantities = {};

      function showError(msg) {
        if (!msg) { errEl.style.display = "none"; return; }
        errEl.style.display = "block";
        errEl.style.background = 'color-mix(in oklab, var(--danger) 10%, transparent)';
        errEl.style.border = '1px solid color-mix(in oklab, var(--danger) 30%, transparent)';
        errEl.style.color = 'var(--danger)';
        errEl.style.padding = '0.5rem 0.75rem';
        errEl.style.borderRadius = 'var(--radius)';
        errEl.style.fontSize = '0.75rem';
        errEl.innerHTML = `${icon("alertTriangle", 12)} ${esc(msg)}`;
      }

      function stockInOrigin(productId) {
        const from = fromSel.value;
        if (!from) return 0;
        return (stockMap.get(productId) || {})[from] || 0;
      }

      function updateSummary() {
        const summary = document.querySelector("#admtr-summary");
        if (!summary) return;
        const entries = Object.entries(quantities).filter(([, q]) => q > 0);
        if (entries.length === 0) {
          summary.textContent = "Seleccionados: Ninguno";
          createBtn.disabled = true;
        } else {
          const units = entries.reduce((s, [, q]) => s + q, 0);
          summary.textContent = `Seleccionados: ${entries.length} producto(s) · ${units} unidad(es)`;
          createBtn.disabled = false;
        }
      }

      function renderProductList() {
        if (!productListEl) return;
        const from = fromSel.value;
        let list = activeProducts.map((p) => ({
          p,
          stock: (stockMap.get(p.id) || {})[from] || 0,
        }));
        if (search) {
          const q = search.toLowerCase();
          list = list.filter((r) =>
            (r.p.name || "").toLowerCase().includes(q) ||
            (r.p.brand || "").toLowerCase().includes(q) ||
            (r.p.sku || "").toLowerCase().includes(q));
        }
        // Con stock primero
        list.sort((a, b) => b.stock - a.stock || (a.p.name || "").localeCompare(b.p.name || ""));

        productListEl.innerHTML = list.length === 0
          ? `<div class="text-xs text-muted" style="padding:0.5rem">Sin productos que coincidan.</div>`
          : list.map(({ p, stock }) => {
              const q = quantities[p.id] || 0;
              const out = stock <= 0;
              return `
                <div class="catalog-item ${out ? "opacity-60" : ""}" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-elevated)">
                  <div style="flex:1;min-width:0">
                    <div class="text-sm font-medium truncate" title="${esc(p.name)}">${esc(p.name)}</div>
                    <div class="text-xs ${out ? 'text-danger' : 'text-muted'}">
                      ${out ? 'Sin stock en origen' : `Stock en origen: ${stock}`}
                      ${p.sku ? ` · ${esc(p.sku)}` : ''}
                    </div>
                  </div>
                  <input class="input" type="number" min="0" max="${stock}" step="1" data-admtr-qty="${esc(p.id)}" value="${q > 0 ? q : ''}" placeholder="0" ${out ? 'disabled' : ''} style="width:5.5rem;flex-shrink:0;text-align:center" />
                </div>
              `;
            }).join("");

        // Cablear inputs de cantidad
        productListEl.querySelectorAll("[data-admtr-qty]").forEach((input) => {
          input.addEventListener("input", () => {
            const pid = input.dataset.admtrQty;
            const max = parseInt(input.max) || 0;
            let v = parseInt(input.value);
            if (isNaN(v) || v < 0) v = 0;
            if (v > max) {
              v = max;
              input.value = max;
              toast(`Solo hay ${max} unidades en el almacén origen`, "warning", 2000);
            }
            if (v > 0) quantities[pid] = v;
            else delete quantities[pid];
            updateSummary();
          });
        });
      }

      function refreshProductsVisibility() {
        const hasBoth = fromSel.value && toSel.value && fromSel.value !== toSel.value;
        productsBlock.style.display = hasBoth ? "flex" : "none";
        renderProductList();
        updateSummary();
      }

      fromSel.addEventListener("change", () => {
        if (fromSel.value && toSel.value && fromSel.value === toSel.value) {
          showError("El almacén origen y destino deben ser distintos.");
        } else {
          showError(null);
        }
        // Al cambiar origen, limpiar cantidades (el stock cambió)
        Object.keys(quantities).forEach((k) => delete quantities[k]);
        refreshProductsVisibility();
      });
      toSel.addEventListener("change", () => {
        if (fromSel.value && toSel.value && fromSel.value === toSel.value) {
          showError("El almacén origen y destino deben ser distintos.");
        } else {
          showError(null);
        }
        refreshProductsVisibility();
      });

      const searchInput = document.querySelector("#admtr-search");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          search = e.target.value;
          renderProductList();
        });
      }

      createBtn.addEventListener("click", async () => {
        if (!validateSelection()) return;
        const entries = Object.entries(quantities).filter(([, q]) => q > 0);
        if (entries.length === 0) { toast("Escribe la cantidad de al menos un producto", "error"); return; }

        const fromWarehouseId = fromSel.value;
        const toWarehouseId = toSel.value;
        const note = document.querySelector("#admtr-note").value.trim() || null;
        const user = getStore().getState().currentUser;

        createBtn.disabled = true;
        createBtn.innerHTML = `<div class="spinner spinner-sm"></div> Creando...`;

        let created = 0;
        const errors = [];
        for (const [productId, qty] of entries) {
          const product = products.find((p) => p.id === productId);
          try {
            await createStockTransfer({
              fromWarehouseId,
              toWarehouseId,
              productId,
              productName: product?.name,
              quantity: qty,
              note,
              requestedBy: user?.id,
              requestedByName: user?.displayName,
            });
            created++;
          } catch (err) {
            console.error("createStockTransfer failed:", err);
            errors.push(`${product?.name || "producto"}: ${err.message || "error"}`);
          }
        }

        if (created > 0 && errors.length === 0) {
          toast(`${created} transferencia(s) creada(s). Pendientes de confirmación.`, "success", 4000);
          close();
          if (onSaved) onSaved();
        } else if (created > 0) {
          toast(`${created} creada(s), ${errors.length} con error. Revisá el panel Transferencias.`, "warning", 6000);
          close();
          if (onSaved) onSaved();
        } else {
          toast("Error al crear transferencia: " + (errors[0] || "desconocido"), "error", 6000);
          createBtn.disabled = false;
          createBtn.innerHTML = `${icon("arrowLeftRight", 12)} Crear transferencia`;
        }
      });

      function validateSelection() {
        const from = fromSel.value;
        const to = toSel.value;
        if (!from) { showError("Seleccioná el almacén origen."); return false; }
        if (!to) { showError("Seleccioná el almacén destino."); return false; }
        if (from === to) { showError("El almacén origen y destino deben ser distintos."); return false; }
        showError(null);
        return true;
      }
    }).catch((err) => {
      console.error("showAdminTransferModal load failed:", err);
      toast("Error al cargar datos para la transferencia", "error");
    });
  }

  // ===== STORAGE (imágenes de productos en GitHub) =====
  async function mountStoragePanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    const cfg = await getGitHubConfig();
    const configured = await isGitHubConfigured();

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("cloud", 24)} Almacenamiento de imágenes</h1>
          <p class="text-sm text-muted">Guarda las imágenes de productos en GitHub para no agotar el espacio de Supabase.</p>
        </div>

        <div class="grid md:grid-cols-2 gap-3">
          <div class="stat-card">
            <div class="stat-label">${icon("image", 14)} Destino actual de las imágenes</div>
            <div class="stat-value" style="font-size:1.25rem">${configured ? "GitHub" : "Supabase Storage"}</div>
            <div class="stat-sub">${configured
              ? `github.com/${esc(cfg.owner)}/${esc(cfg.repo)} · carpeta ${esc(cfg.path || "raíz")}`
              : "Configura GitHub abajo para liberar espacio en Supabase"}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${icon("info", 14)} ¿Por qué?</div>
            <div class="stat-value" style="font-size:1.25rem">Free tier Supabase = 1 GB</div>
            <div class="stat-sub">las imágenes son lo que más pesa. En GitHub no cuentan contra ese límite y se sirven via raw.githubusercontent.com</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2 class="card-title">Configuración de GitHub</h2></div>
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="label label-xs">Usuario / Organización (owner) *</label>
                <input class="input" id="gh-owner" value="${esc(cfg.owner || "")}" placeholder="mannollubricantes21-lang" />
              </div>
              <div>
                <label class="label label-xs">Repositorio *</label>
                <input class="input" id="gh-repo" value="${esc(cfg.repo || "")}" placeholder="Mannol" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="label label-xs">Rama</label>
                <input class="input" id="gh-branch" value="${esc(cfg.branch || "main")}" placeholder="main" />
              </div>
              <div>
                <label class="label label-xs">Carpeta destino</label>
                <input class="input" id="gh-path" value="${esc(cfg.path || "product-images")}" placeholder="product-images" />
              </div>
              <div>
                <label class="label label-xs">CDN base (opcional)</label>
                <input class="input" id="gh-cdn" value="${esc(cfg.cdnBase || "")}" placeholder="https://cdn.jsdelivr.net/gh/..." />
              </div>
            </div>
            <div>
              <label class="label label-xs">Token de acceso (fine-grained) *</label>
              <input class="input" id="gh-token" type="password" value="${esc(cfg.token || "")}" placeholder="github_pat_..." autocomplete="off" />
              <p class="text-xs text-muted" style="margin-top:0.375rem">Se guarda solo en este dispositivo (localStorage), nunca se sube al repo ni a Supabase.</p>
            </div>

            <div style="background: color-mix(in oklab, var(--info) 8%, var(--bg-elevated)); border: 1px solid color-mix(in oklab, var(--info) 25%, transparent); border-radius: var(--radius); padding: 0.75rem 1rem">
              <p class="text-xs font-semibold" style="margin:0 0 0.375rem">Cómo crear el token (1 minuto):</p>
              <ol class="text-xs text-muted" style="margin:0;padding-left:1.25rem;line-height:1.7">
                <li>Entra a GitHub → <strong>Settings</strong> → <strong>Developer settings</strong> → <strong>Personal access tokens → Fine-grained tokens</strong></li>
                <li><strong>Generate new token</strong> → nombre "MANNOL POS"</li>
                <li><strong>Repository access</strong>: Only select repositories → elige tu repo</li>
                <li><strong>Permissions</strong> → Repository permissions → <strong>Contents: Read and write</strong></li>
                <li>Genera, copia el token (empieza con <code>github_pat_</code>) y pégalo arriba</li>
              </ol>
            </div>

            <div class="flex gap-2 flex-wrap">
              <button class="btn btn-primary" id="gh-save">${icon("save", 14)} Guardar configuración</button>
              <button class="btn btn-outline" id="gh-test">${icon("check", 14)} Probar conexión</button>
            </div>
            <div id="gh-test-result" class="text-sm" style="display:none"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.5rem">
            <h3 class="text-sm font-semibold" style="margin:0">Cómo funciona</h3>
            <ul class="text-xs text-muted" style="margin:0;padding-left:1.25rem;line-height:1.8">
              <li>Cuando subes una imagen a un producto, se convierte a WebP (más liviana) y se commitea a la carpeta del repo con un nombre único.</li>
              <li>El producto guarda la URL pública de la imagen (raw.githubusercontent.com), que funciona igual que antes en toda la app.</li>
              <li>Si GitHub no responde o falla el token, la imagen se sube a Supabase como respaldo — nunca se pierde.</li>
              <li>Al reemplazar la imagen de un producto, la anterior se intenta borrar del repo automáticamente.</li>
              <li>Recomendación: usa el mismo repo de la app (así todo vive junto) o crea uno aparte solo para imágenes.</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    content.querySelector("#gh-save").addEventListener("click", async () => {
      const owner = content.querySelector("#gh-owner").value.trim();
      const repo = content.querySelector("#gh-repo").value.trim();
      const branch = content.querySelector("#gh-branch").value.trim() || "main";
      const path = content.querySelector("#gh-path").value.trim() || "product-images";
      const cdnBase = content.querySelector("#gh-cdn").value.trim();
      const token = content.querySelector("#gh-token").value.trim();
      if (!owner || !repo) { toast("Owner y repositorio son obligatorios", "error"); return; }
      await saveGitHubConfig({ owner, repo, branch, path, cdnBase, token });
      toast("Configuración guardada", "success");
      mountStoragePanel(content, gen);
    });

    content.querySelector("#gh-test").addEventListener("click", async () => {
      // Probar con lo que hay en el formulario (sin necesidad de guardar antes)
      const resultEl = content.querySelector("#gh-test-result");
      resultEl.style.display = "block";
      resultEl.innerHTML = `<div class="spinner spinner-sm" style="display:inline-block"></div> Probando conexión...`;
      await saveGitHubConfig({
        owner: content.querySelector("#gh-owner").value.trim(),
        repo: content.querySelector("#gh-repo").value.trim(),
        branch: content.querySelector("#gh-branch").value.trim() || "main",
        path: content.querySelector("#gh-path").value.trim() || "product-images",
        cdnBase: content.querySelector("#gh-cdn").value.trim(),
        token: content.querySelector("#gh-token").value.trim(),
      });
      const res = await testGitHubConnection();
      resultEl.innerHTML = res.ok
        ? `<span style="color:${res.canPush ? 'var(--accent)' : 'var(--warning)'}">✅ ${esc(res.message)}</span>`
        : `<span style="color:var(--danger)">❌ ${esc(res.message)}</span>`;
    });
  }

  // ===== WEEKEND (regla de fin de semana) =====
  function mountWeekendPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    Promise.all([
      getSettings(),
      listWarehouses(),
    ]).then(([settings, warehouses]) => {
      if (gen !== tabGeneration) return;
      const weekendEnabled = settings.weekendRedirectEnabled || false;
      const weekendWhId = settings.weekendWarehouseId || "";
      const today = new Date().getDay();
      const isWeekendToday = (today === 0 || today === 6);
      const dayName = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"][today];

      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("calendar", 24)} Regla de fin de semana</h1>
            <p class="text-sm text-muted">Configura qué almacén recibe las ventas de sábado y domingo.</p>
          </div>

          <div class="card">
            <div class="card-content" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">

              <div class="alert alert-info" style="background: color-mix(in oklab, var(--info) 8%, transparent); border: 1px solid color-mix(in oklab, var(--info) 30%, transparent); border-radius: var(--radius); padding: 0.875rem; font-size: 0.8125rem; line-height: 1.5">
                <strong>¿Para qué sirve esto?</strong><br>
                Si los sábados y domingos una vendedora distinta atiende un local específico (ej: Vedado),
                activá esta regla. Todas las ventas registradas en fin de semana se asignarán automáticamente
                a ese local — sin importar qué vendedor la registre. Las comisiones del vendedor original
                se calculan sobre el almacén efectivo (Vedado), no el suyo.
              </div>

              <div style="padding: 0.875rem; background: ${isWeekendToday ? 'color-mix(in oklab, var(--warning) 8%, transparent)' : 'var(--bg-soft)'}; border-radius: var(--radius); border: 1px solid var(--border)">
                <div class="flex items-center gap-2">
                  ${icon(isWeekendToday ? "alertTriangle" : "clock", 16)}
                  <div>
                    <div class="text-sm font-semibold">Hoy es ${dayName}</div>
                    <div class="text-xs text-muted">${isWeekendToday ? 'La regla está activa hoy (si la activás abajo)' : 'La regla no aplica hoy — solo sábado y domingo'}</div>
                  </div>
                </div>
              </div>

              <div>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" id="wk-enabled" ${weekendEnabled ? 'checked' : ''} style="width:1.25rem;height:1.25rem" />
                  <div>
                    <div class="text-sm font-semibold">Activar redirección de ventas de fin de semana</div>
                    <div class="text-xs text-muted">Si está activo, las ventas de sábado/domingo se asignan al almacén configurado abajo.</div>
                  </div>
                </label>
              </div>

              <div id="wk-wh-group" style="${weekendEnabled ? '' : 'opacity:0.5;pointer-events:none'}">
                <label class="label label-xs">Almacén que recibe las ventas de fin de semana</label>
                <select class="select" id="wk-warehouseId" style="width:100%">
                  <option value="">— Seleccionar almacén —</option>
                  ${warehouses.map((w) => `<option value="${w.id}" ${weekendWhId === w.id ? 'selected' : ''}>${esc(w.name)} (${esc(w.code)})</option>`).join('')}
                </select>
                <p class="text-xs text-muted" style="margin-top:0.5rem">
                  Recomendado: seleccioná el local que opera los fines de semana (ej: "Vedado").
                  Todas las ventas de sábado/domingo se asignarán a ese local y se descontará stock de ahí.
                </p>
              </div>

              <div class="flex gap-2">
                <button class="btn btn-primary" id="wk-save">${icon("save", 14)} Guardar configuración</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-content" style="padding:1.25rem">
              <h3 class="text-sm font-semibold mb-2">Cómo funciona</h3>
              <ol style="font-size:0.8125rem;line-height:1.7;padding-left:1.5rem">
                <li>Vendedor A entra a su local (ej: Víbora) un sábado y registra una venta</li>
                <li>El sistema detecta que hoy es sábado y la regla está activa</li>
                <li>La venta se guarda con <code>warehouseId = Vedado</code> (no Víbora)</li>
                <li>El stock se descuenta del Vedado</li>
                <li>La comisión del vendedor A se calcula sobre el Vedado</li>
                <li>La auditoría conserva <code>originalWarehouseId = Víbora</code> para trazabilidad</li>
              </ol>
            </div>
          </div>
        </div>
      `;

      // Toggle de habilitación
      const enabledCb = content.querySelector("#wk-enabled");
      const whGroup = content.querySelector("#wk-wh-group");
      enabledCb.addEventListener("change", () => {
        whGroup.style = enabledCb.checked ? '' : 'opacity:0.5;pointer-events:none';
      });

      // Guardar
      content.querySelector("#wk-save").addEventListener("click", async () => {
        const newEnabled = content.querySelector("#wk-enabled").checked;
        const newWhId = content.querySelector("#wk-warehouseId").value;
        if (newEnabled && !newWhId) {
          toast("Seleccioná un almacén para activar la regla", "error");
          return;
        }
        await saveSettings({
          ...settings,
          weekendRedirectEnabled: newEnabled,
          weekendWarehouseId: newEnabled ? newWhId : null,
        });
        toast("Configuración guardada", "success");
        // Actualizar también el store para que sales.js lo vea en vivo
        try {
          const { getStore } = await import("../store.js");
          getStore().setSettings({
            ...settings,
            weekendRedirectEnabled: newEnabled,
            weekendWarehouseId: newEnabled ? newWhId : null,
          });
        } catch (e) { console.warn("store update failed:", e); }
      });
    });
  }

  // ===== CARDS =====
  function mountCardsPanel(content, gen) {
    gen = gen ?? tabGeneration;
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    Promise.all([
      listCardsWithBalances(),
      Promise.resolve(getStore().getState().currentUser),
    ]).then(([cards, currentUser]) => {
      if (gen !== tabGeneration) return;
      let expandedCardId = null;
      let cardMovements = [];

      function render() {
        const totalBalance = cards.reduce((s, c) => s + (c.balance || 0), 0);
        const totalCurrency = cards[0]?.currency || "USD";
        content.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h1 class="text-2xl font-bold flex items-center gap-2">${icon("creditCard", 24)} Tarjetas</h1>
                <p class="text-sm text-muted">Saldo total: <strong>${formatMoney(totalBalance, totalCurrency)}</strong> · ${cards.length} tarjetas</p>
              </div>
              <button class="btn btn-primary btn-sm" id="new-card">${icon("plus", 14)} Nueva</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:0.75rem">
              ${cards.length === 0 ? `
                <div class="empty-state"><div class="empty-state-icon">${icon("creditCard", 24)}</div><p class="empty-state-title">Sin tarjetas</p><p class="empty-state-desc">Creá una tarjeta bancaria para registrar transferencias.</p></div>
              ` : cards.map((c) => {
                const isExpanded = expandedCardId === c.id;
                const balanceColor = (c.balance || 0) >= 0 ? 'var(--primary)' : 'var(--danger)';
                return `
                  <div class="card" style="${isExpanded ? 'border-color:color-mix(in oklab, var(--primary) 40%, transparent)' : ''}">
                    <div class="card-header flex justify-between" style="cursor:pointer" data-toggle-card="${esc(c.id)}">
                      <div class="flex items-center gap-2 min-w-0">
                        <div class="brand-logo" style="background: ${c.bank === 'BPA' ? 'color-mix(in oklab, var(--primary) 15%, var(--bg-soft))' : c.bank === 'BANDEC' ? 'color-mix(in oklab, var(--accent-mn) 15%, var(--bg-soft))' : 'color-mix(in oklab, var(--accent-eur) 15%, var(--bg-soft))'}; color: ${c.bank === 'BPA' ? 'var(--primary)' : c.bank === 'BANDEC' ? 'var(--accent-mn)' : 'var(--accent-eur)'}">
                          ${icon("creditCard", 16)}
                        </div>
                        <div class="min-w-0">
                          <h3 class="font-semibold">${esc(c.name)}</h3>
                          <p class="text-xs text-muted">
                            <code class="font-mono">${esc(c.number)}</code>
                            ${c.bank ? `· <span class="badge badge-outline" style="font-size:0.5625rem">${esc(c.bank)}</span>` : ''}
                            ${!c.active ? '<span class="badge badge-danger" style="font-size:0.5625rem">Inactiva</span>' : ''}
                          </p>
                        </div>
                      </div>
                      <div style="text-align:right">
                        <div class="text-xs text-muted">Saldo actual</div>
                        <div class="text-lg font-bold" style="color: ${balanceColor}">${formatMoney(c.balance || 0, c.currency || "USD")}</div>
                        <div class="text-xs text-muted">${c.salesCount || 0} venta(s) con transf.</div>
                      </div>
                      <div class="ml-2" style="align-self:center;color:var(--text-muted)">${icon(isExpanded ? "chevronUp" : "chevronDown", 14)}</div>
                    </div>
                    ${isExpanded ? `
                      <div class="card-content" style="padding:0.875rem;display:flex;flex-direction:column;gap:0.75rem">
                        <div class="flex justify-between items-center flex-wrap gap-2">
                          <h4 class="text-sm font-semibold">Movimientos (${cardMovements.length})</h4>
                          <div class="flex gap-1">
                            <button class="btn btn-primary btn-sm" data-deposit-card="${esc(c.id)}" style="background:var(--primary)">${icon("plus", 12)} Depósito</button>
                            <button class="btn btn-outline btn-sm" data-withdraw-card="${esc(c.id)}" style="color:var(--danger)">${icon("minus", 12)} Retiro</button>
                            <button class="btn btn-ghost btn-sm" data-edit-card="${esc(c.id)}">Editar</button>
                            <button class="btn btn-ghost btn-sm text-danger" data-delete-card="${esc(c.id)}">${icon("trash", 12)}</button>
                          </div>
                        </div>
                        ${cardMovements.length === 0 ? `
                          <div class="empty-state text-xs">Sin movimientos. Hacé un depósito para empezar a usar la tarjeta.</div>
                        ` : `
                          <div style="max-height:20rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.375rem">
                            ${cardMovements.slice(0, 30).map((m) => {
                              const isPositive = (m.amount || 0) >= 0;
                              const typeLabel = { DEPOSIT: "Depósito", WITHDRAW: "Retiro", ADJUST: "Ajuste", SALE: "Venta" }[m.movementType] || m.movementType;
                              const typeColor = { DEPOSIT: "var(--primary)", WITHDRAW: "var(--danger)", ADJUST: "var(--warning)", SALE: "var(--accent-mn)" }[m.movementType] || "var(--text-muted)";
                              return `
                                <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
                                  <div style="width:2rem;height:2rem;border-radius:var(--radius-sm);background:${typeColor}15;color:${typeColor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                                    ${icon(isPositive ? "arrowDown" : "arrowUp", 14)}
                                  </div>
                                  <div style="flex:1;min-width:0">
                                    <div class="text-sm font-medium truncate">${typeLabel}${m.note ? ` · <span class="text-muted">${esc(m.note)}</span>` : ''}</div>
                                    <div class="text-xs text-muted">${formatDate(m.createdAt)}${m.userName ? ' · ' + esc(m.userName) : ''}</div>
                                  </div>
                                  <div class="font-bold ${isPositive ? 'text-primary' : 'text-danger'}">
                                    ${isPositive ? '+' : ''}${formatMoney(m.amount, m.currency || c.currency || "USD")}
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>
                        `}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;

        // Toggle expand/collapse
        content.querySelectorAll("[data-toggle-card]").forEach((header) => {
          header.addEventListener("click", async () => {
            const id = header.dataset.toggleCard;
            if (expandedCardId === id) {
              expandedCardId = null;
              cardMovements = [];
              render();
            } else {
              expandedCardId = id;
              const result = await getCardBalance(id);
              cardMovements = result.movements || [];
              render();
            }
          });
        });

        content.querySelector("#new-card").addEventListener("click", () => showCardDialog(null, () => mountCardsPanel(content, tabGeneration)));
        content.querySelectorAll("[data-edit-card]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const c = cards.find((x) => x.id === btn.dataset.editCard);
            if (c) showCardDialog(c, () => mountCardsPanel(content, tabGeneration));
          });
        });
        content.querySelectorAll("[data-delete-card]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            confirmDialog("¿Eliminar tarjeta? (las ventas existentes conservan el dato)", async () => {
              await deleteCard(btn.dataset.deleteCard);
              toast("Tarjeta eliminada", "success");
              mountCardsPanel(content, tabGeneration);
            });
          });
        });
        content.querySelectorAll("[data-deposit-card]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const c = cards.find((x) => x.id === btn.dataset.depositCard);
            if (c) showCardMovementDialog(c, "DEPOSIT", () => mountCardsPanel(content, tabGeneration));
          });
        });
        content.querySelectorAll("[data-withdraw-card]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const c = cards.find((x) => x.id === btn.dataset.withdrawCard);
            if (c) showCardMovementDialog(c, "WITHDRAW", () => mountCardsPanel(content, tabGeneration));
          });
        });
      }

      render();
    });
  }

  // Diálogo para agregar un movimiento (depósito / retiro) a una tarjeta
  function showCardMovementDialog(card, movementType, onSaved) {
    const isDeposit = movementType === "DEPOSIT";
    const close = showModal({
      title: isDeposit ? `Depósito a ${card.name}` : `Retiro de ${card.name}`,
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div>
            <label class="label label-xs">Monto (${card.currency || "USD"}) *</label>
            <input class="input" type="number" step="0.01" min="0.01" id="mv-amount" placeholder="0.00" autofocus />
          </div>
          <div>
            <label class="label label-xs">Nota (opcional)</label>
            <input class="input" id="mv-note" placeholder="${isDeposit ? 'Ej: Depósito inicial, transferencia recibida' : 'Ej: Gasto, retiro para caja'}" />
          </div>
          <div class="text-xs text-muted" style="background:var(--bg-soft);padding:0.5rem;border-radius:var(--radius);line-height:1.5">
            <strong>Saldo actual:</strong> ${formatMoney(card.balance || 0, card.currency || "USD")}<br>
            <strong>Después del movimiento:</strong> ${formatMoney((card.balance || 0) + (isDeposit ? 0 : 0), card.currency || "USD")} (se calculará al guardar)
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="mv-cancel">Cancelar</button><button class="btn btn-primary" id="mv-save">${isDeposit ? "Depositar" : "Retirar"}</button>`,
    });
    document.querySelector("#mv-cancel").addEventListener("click", close);
    document.querySelector("#mv-save").addEventListener("click", async () => {
      const amount = parseFloat(document.querySelector("#mv-amount").value);
      const note = document.querySelector("#mv-note").value.trim() || null;
      if (!amount || amount <= 0) { toast("Ingresá un monto válido", "error"); return; }
      const user = getStore().getState().currentUser;
      try {
        await addCardMovement({
          cardId: card.id,
          movementType,
          amount,
          currency: card.currency || "USD",
          note,
          userId: user?.id,
          userName: user?.displayName,
        });
        toast(isDeposit ? `Depósito de ${formatMoney(amount, card.currency || "USD")} registrado` : `Retiro de ${formatMoney(amount, card.currency || "USD")} registrado`, "success");
        close();
        onSaved();
      } catch (err) {
        toast("Error al registrar movimiento", "error");
      }
    });
  }

  function showCardDialog(card, onSaved) {
    const isNew = !card;
    const c = card || {};
    const close = showModal({
      title: isNew ? "Nueva tarjeta" : "Editar tarjeta",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div><label class="label label-xs">Nombre *</label><input class="input" id="c-name" value="${esc(c.name || '')}" placeholder="BPA Principal" /></div>
          <div><label class="label label-xs">Número *</label><input class="input" id="c-number" value="${esc(c.number || '')}" placeholder="9225-6789-0123-4567" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Banco</label>
              <select class="select" id="c-bank">
                <option value="">(selecciona)</option>
                <option value="BPA" ${c.bank === 'BPA' ? 'selected' : ''}>BPA</option>
                <option value="BANDEC" ${c.bank === 'BANDEC' ? 'selected' : ''}>BANDEC</option>
                <option value="BANMET" ${c.bank === 'BANMET' ? 'selected' : ''}>BANMET</option>
              </select>
            </div>
            <div><label class="label label-xs">Moneda del saldo</label>
              <select class="select" id="c-balanceCurrency">
                <option value="USD" ${(c.balanceCurrency || 'USD') === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="MN" ${c.balanceCurrency === 'MN' ? 'selected' : ''}>MN (₱)</option>
                <option value="EUR" ${c.balanceCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
              </select>
            </div>
          </div>
          <div><label class="label label-xs">Saldo inicial</label><input class="input" type="number" step="0.01" id="c-initialBalance" value="${c.initialBalance ?? 0}" placeholder="0.00" /></div>
          <p class="text-xs text-muted">El saldo inicial se suma automáticamente a los movimientos. Después podés ajustarlo con depósitos y retiros desde la tarjeta.</p>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="c-cancel">Cancelar</button><button class="btn btn-primary" id="c-save">Guardar</button>`,
    });
    document.querySelector("#c-cancel").addEventListener("click", close);
    document.querySelector("#c-save").addEventListener("click", async () => {
      const data = {
        ...(c.id ? { id: c.id } : {}),
        name: document.querySelector("#c-name").value.trim(),
        number: document.querySelector("#c-number").value.trim(),
        bank: document.querySelector("#c-bank").value || null,
        balanceCurrency: document.querySelector("#c-balanceCurrency").value,
        initialBalance: parseFloat(document.querySelector("#c-initialBalance").value) || 0,
        active: true,
      };
      if (!data.name || !data.number) { toast("Nombre y número son obligatorios", "error"); return; }
      await saveCard(data);
      toast("Tarjeta guardada", "success");
      close();
      onSaved();
    });
  }

  // ===== WAREHOUSE COMMISSIONS (locales) =====
  function mountWarehouseCommissionsPanel(content, gen) {
    const now = new Date();
    let period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let loading = true;
    let commissions = [];

    async function load() {
      loading = true;
      render();
      const [y, m] = period.split("-").map(Number);
      commissions = await listWarehouseCommissions(y, m);
      loading = false;
      render();
    }

    function render() {
      const total = commissions.reduce((s, c) => s + c.amount, 0);
      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 class="text-lg font-bold">Comisiones de vendedores (locales)</h2>
              <p class="text-xs text-muted">Calculadas como % del total vendido</p>
            </div>
            <div class="flex gap-2 items-center">
              <input class="input" type="month" id="wc-period" value="${period}" style="width:10rem" />
            </div>
          </div>
          <div class="card">
            <div class="overflow-x-auto">
              ${loading ? `<div class="empty-state"><div class="spinner"></div></div>` : `
                <table class="table">
                  <thead><tr><th>Almacén</th><th class="text-center">Ventas</th><th class="text-right">Total vendido</th><th class="text-right">%</th><th class="text-right">Comisión</th></tr></thead>
                  <tbody>
                    ${commissions.map((c) => `
                      <tr>
                        <td class="font-medium">${esc(c.warehouseName)} <span class="badge badge-outline">${esc(c.warehouseCode)}</span></td>
                        <td class="text-center">${c.salesCount}</td>
                        <td class="text-right">${formatMoney(c.totalSales, "USD")}</td>
                        <td class="text-right">${c.commissionPercent}%</td>
                        <td class="text-right font-bold">${formatMoney(c.amount, c.commissionCurrency)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:var(--bg-soft);font-weight:700">
                      <td colspan="4">Total</td>
                      <td class="text-right">${formatMoney(total, "USD")}</td>
                    </tr>
                  </tfoot>
                </table>
              `}
            </div>
          </div>
        </div>
      `;
      const periodInput = content.querySelector("#wc-period");
      if (periodInput) {
        periodInput.addEventListener("change", (e) => {
          period = e.target.value;
          load();
        });
      }
    }

    load();
  }

  // ===== RATES =====
  function mountRatesPanel(content, gen) {
    let config = null;
    let syncing = false;

    async function load() {
      config = await getRateConfig();
      render();
    }

    function render() {
      if (!config) {
        content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
        return;
      }
      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold">Configuración de tasas elToque</h2>
            <button class="btn btn-primary btn-sm" id="sync-now" ${syncing ? 'disabled' : ''}>
              ${syncing ? `<div class="spinner spinner-sm"></div>` : icon("refresh", 14)}
              ${syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </button>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">API elToque</h3></div>
            <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
              <div><label class="label label-xs">API URL</label><input class="input" id="r-apiUrl" value="${config.apiUrl}" /></div>
              <div><label class="label label-xs">API Token (Bearer)</label><input class="input" type="password" id="r-apiToken" value="${config.apiToken || ''}" placeholder="(opcional)" /></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Markup</h3></div>
            <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
              <div class="grid grid-cols-2 gap-2">
                <div><label class="label label-xs">Modo</label>
                  <select class="select" id="r-markupMode">
                    <option value="PERCENT" ${config.markupMode === 'PERCENT' ? 'selected' : ''}>Porcentaje (%)</option>
                    <option value="FIXED" ${config.markupMode === 'FIXED' ? 'selected' : ''}>Fijo (suma)</option>
                  </select>
                </div>
                <div><label class="label label-xs">Caché TTL (minutos)</label><input class="input" type="number" id="r-cacheTtl" value="${config.cacheTtlMinutes}" /></div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="label label-xs">Markup USD</label><input class="input" type="number" step="0.1" id="r-markupUsd" value="${config.markupUsd}" /></div>
                <div><label class="label label-xs">Markup EUR</label><input class="input" type="number" step="0.1" id="r-markupEur" value="${config.markupEur}" /></div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Tasas manuales (fallback)</h3></div>
            <div class="card-content">
              <div class="grid grid-cols-2 gap-2">
                <div><label class="label label-xs">USD manual (MN por USD)</label><input class="input" type="number" id="r-manualUsd" value="${config.manualUsdRate}" /></div>
                <div><label class="label label-xs">EUR manual (MN por EUR)</label><input class="input" type="number" id="r-manualEur" value="${config.manualEurRate}" /></div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Estado actual</h3></div>
            <div class="card-content">
              <div class="grid grid-cols-2 gap-2">
                <div><label class="label label-xs">Última sincronización</label><div class="text-sm">${config.lastSyncAt ? formatDate(config.lastSyncAt) : 'Nunca'}</div></div>
                <div><label class="label label-xs">Auto-sync</label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" id="r-autoSync" ${config.autoSync ? 'checked' : ''} />
                    <span class="text-sm">Habilitado</span>
                  </label>
                </div>
                <div><label class="label label-xs">Última tasa USD</label><div class="text-sm">${config.lastUsdRate || '—'} MN</div></div>
                <div><label class="label label-xs">Última tasa EUR</label><div class="text-sm">${config.lastEurRate || '—'} MN</div></div>
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <button class="btn btn-primary btn-lg" id="save-rates">${icon("save", 14)} Guardar configuración</button>
          </div>
        </div>
      `;

      content.querySelector("#sync-now").addEventListener("click", async () => {
        syncing = true;
        render();
        try {
          await syncRatesFromElToque();
          toast("Tasas sincronizadas", "success");
          await load();
        } catch (err) {
          toast("Error al sincronizar", "error");
        } finally {
          syncing = false;
          render();
        }
      });

      content.querySelector("#save-rates").addEventListener("click", async () => {
        const data = {
          apiUrl: content.querySelector("#r-apiUrl").value,
          apiToken: content.querySelector("#r-apiToken").value || null,
          markupMode: content.querySelector("#r-markupMode").value,
          markupUsd: parseFloat(content.querySelector("#r-markupUsd").value) || 0,
          markupEur: parseFloat(content.querySelector("#r-markupEur").value) || 0,
          manualUsdRate: parseFloat(content.querySelector("#r-manualUsd").value) || 320,
          manualEurRate: parseFloat(content.querySelector("#r-manualEur").value) || 345,
          cacheTtlMinutes: parseInt(content.querySelector("#r-cacheTtl").value) || 60,
          autoSync: content.querySelector("#r-autoSync").checked,
        };
        await saveRateConfig(data);
        toast("Configuración guardada", "success");
        await load();
      });
    }

    load();
  }

  // ===== AUDIT (stock movements) =====
  function mountAuditPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listStockMovements({ limit: 200 }).then((movements) => {
      if (gen !== tabGeneration) return;
      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h2 class="text-lg font-bold">Auditoría de movimientos de stock</h2>
            <p class="text-xs text-muted">Últimos ${movements.length} movimientos</p>
          </div>
          <div class="card">
            <div class="overflow-x-auto">
              ${movements.length === 0 ? `<div class="empty-state">No hay movimientos registrados</div>` : `
                <table class="table">
                  <thead><tr><th>Fecha</th><th>Motivo</th><th>Producto</th><th class="text-right">Delta</th><th>Nota</th></tr></thead>
                  <tbody>
                    ${movements.map((m) => `
                      <tr>
                        <td class="text-xs">${formatDate(m.createdAt)}</td>
                        <td><span class="badge badge-outline">${STOCK_REASON_LABELS[m.reason] || esc(m.reason)}</span></td>
                        <td class="text-xs">${esc(m.productName || m.productId)}</td>
                        <td class="text-right font-mono ${m.delta > 0 ? 'text-accent' : 'text-danger'}">${m.delta > 0 ? '+' : ''}${m.delta}</td>
                        <td class="text-xs text-muted">${esc(m.note || '—')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </div>
      `;
    });
  }

  // ===== PROFIT / INVESTMENT =====
  function mountProfitPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    Promise.all([listProducts(), listStock(), listSales({})]).then(([products, stockList, sales]) => {
    if (gen !== tabGeneration) return;

    // Calcular inversión (costo del inventario actual)
    let totalInvestment = 0;
    let totalRetailValue = 0;
    let totalUnits = 0;
    const productStats = [];

    for (const p of products) {
      const stockItems = stockList.filter((s) => s.productId === p.id);
      const totalQty = stockItems.reduce((sum, s) => sum + s.quantity, 0);
      const costPrice = p.costPrice || (p.salePrice * 0.7);
      const investment = totalQty * costPrice;
      const retailValue = totalQty * (p.salePrice || 0);
      totalInvestment += investment;
      totalRetailValue += retailValue;
      totalUnits += totalQty;

      // Ventas de este producto
      let unitsSold = 0;
      let revenue = 0;
      let costSold = 0;
      for (const s of sales) {
        if (s.status !== "COMPLETADA") continue;
        const item = s.items.find((i) => i.productId === p.id);
        if (item) {
          unitsSold += item.quantity;
          revenue += item.subtotal;
          costSold += item.quantity * costPrice;
        }
      }
      const profit = revenue - costSold;
      const profitPct = costSold > 0 ? Math.round((profit / costSold) * 100) : 0;

      productStats.push({ product: p, totalQty, investment, retailValue, unitsSold, revenue, costSold, profit, profitPct });
    }

    // Totales de ventas
    const completedSales = sales.filter((s) => s.status === "COMPLETADA");
    const totalRevenue = completedSales.reduce((s, x) => s + x.totalAmount, 0);
    const totalCostSold = productStats.reduce((s, p) => s + p.costSold, 0);
    const totalProfit = totalRevenue - totalCostSold;
    const totalProfitPct = totalCostSold > 0 ? Math.round((totalProfit / totalCostSold) * 100) : 0;
    const potentialProfit = totalRetailValue - totalInvestment;
    const potentialProfitPct = totalInvestment > 0 ? Math.round((potentialProfit / totalInvestment) * 100) : 0;

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h2 class="text-lg font-bold flex items-center gap-2">${icon("trendingUp", 20)} Ganancia e Inversión</h2>
          <p class="text-xs text-muted">Resumen financiero del inventario y ventas</p>
        </div>

        <!-- KPIs principales -->
        <div class="grid grid-cols-2 gap-2">
          <div class="stat-card" style="border:1px solid color-mix(in oklab, var(--info) 30%, transparent)">
            <div class="stat-label">${icon("boxes", 14)} Inversión en stock</div>
            <div class="stat-value" style="color:var(--info)">${formatMoney(totalInvestment, "USD")}</div>
            <div class="stat-sub">${totalUnits} unidades en inventario</div>
          </div>
          <div class="stat-card" style="border:1px solid color-mix(in oklab, var(--accent-usd) 30%, transparent)">
            <div class="stat-label">${icon("dollar", 14)} Valor de venta</div>
            <div class="stat-value" style="color:var(--accent-usd)">${formatMoney(totalRetailValue, "USD")}</div>
            <div class="stat-sub">Si se vende todo el stock</div>
          </div>
          <div class="stat-card" style="border:1px solid color-mix(in oklab, var(--accent-usd) 30%, transparent)">
            <div class="stat-label">${icon("trendingUp", 14)} Ganancia potencial</div>
            <div class="stat-value" style="color:var(--accent-usd)">${formatMoney(potentialProfit, "USD")}</div>
            <div class="stat-sub">${potentialProfitPct}% sobre inversión</div>
          </div>
          <div class="stat-card" style="border:1px solid color-mix(in oklab, var(--warning) 30%, transparent)">
            <div class="stat-label">${icon("receipt", 14)} Ganancia realizada</div>
            <div class="stat-value" style="color:var(--warning)">${formatMoney(totalProfit, "USD")}</div>
            <div class="stat-sub">${totalProfitPct}% · ${completedSales.length} ventas</div>
          </div>
        </div>

        <!-- Resumen de ventas -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Resumen de ventas</h3></div>
          <div class="card-content">
            <div class="grid grid-cols-3 gap-2">
              <div class="text-center">
                <div class="text-xs text-muted">Ingresos</div>
                <div class="text-lg font-bold" style="color:var(--accent-usd)">${formatMoney(totalRevenue, "USD")}</div>
              </div>
              <div class="text-center">
                <div class="text-xs text-muted">Costo productos</div>
                <div class="text-lg font-bold" style="color:var(--danger)">${formatMoney(totalCostSold, "USD")}</div>
              </div>
              <div class="text-center">
                <div class="text-xs text-muted">Ganancia</div>
                <div class="text-lg font-bold" style="color:var(--warning)">${formatMoney(totalProfit, "USD")}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Detalle por producto -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Detalle por producto</h3></div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Producto</th><th class="text-center">Stock</th><th class="text-right">Costo unit.</th><th class="text-right">Venta unit.</th><th class="text-right">Inversión</th><th class="text-right">Vendido</th><th class="text-right">Ganancia</th><th class="text-center">%</th></tr></thead>
              <tbody>
                ${productStats.sort((a, b) => b.profit - a.profit).map((ps) => {
                  const costPrice = ps.product.costPrice || (ps.product.salePrice * 0.7);
                  return `
                    <tr>
                      <td class="font-medium text-xs">${esc(ps.product.name)}</td>
                      <td class="text-center">${ps.totalQty}</td>
                      <td class="text-right text-xs">${formatMoney(costPrice, "USD")}</td>
                      <td class="text-right text-xs">${formatMoney(ps.product.salePrice, "USD")}</td>
                      <td class="text-right text-xs" style="color:var(--info)">${formatMoney(ps.investment, "USD")}</td>
                      <td class="text-right text-xs">${formatMoney(ps.revenue, "USD")}</td>
                      <td class="text-right text-xs font-bold" style="color:${ps.profit > 0 ? 'var(--accent-usd)' : 'var(--danger)'}">${formatMoney(ps.profit, "USD")}</td>
                      <td class="text-center text-xs ${ps.profitPct > 0 ? 'text-accent' : 'text-danger'}">${ps.profitPct}%</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Nota sobre lotes de compra -->
        <div class="card" style="background: color-mix(in oklab, var(--info) 5%, transparent); border-color: color-mix(in oklab, var(--info) 30%, transparent)">
          <div class="card-content text-sm">
            <div class="flex items-start gap-2">
              <span style="color:var(--info);flex-shrink:0;margin-top:0.125rem">${icon("alertTriangle", 16)}</span>
              <div>
                <p class="font-medium mb-1">Lotes de compra</p>
                <p class="text-xs text-muted">El costo unitario se calcula automáticamente. Si compras el mismo producto a diferente precio, el sistema usa el costo promedio ponderado. Para registrar compras con precio variable, usa el módulo de Inventario → Ajustar stock con motivo "INVENTARIO" e indica el costo en la nota.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).catch((err) => {
    if (gen !== tabGeneration) return;
    content.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
  });
  }

  render();
  return () => {};
}

// ===== Helper: formatear bytes =====
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
