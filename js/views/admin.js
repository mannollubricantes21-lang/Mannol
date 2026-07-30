// =====================================================
// Admin Panel — 9 sub-paneles (Tabs)
// Users, Products, Categories, Warehouses, Managers, Cards, Commissions, Rates, Audit
// =====================================================

import { getStore } from "../store.js";
import {
  listUsers, saveUser, deleteUser,
  listWarehouses, saveWarehouse,
  listProducts, saveProduct, deleteProduct,
  listCategories, saveCategory, deleteCategory,
  listManagers, saveManager, deleteManager,
  listCards, saveCard, deleteCard,
  listWarehouseCommissions,
  getRateConfig, saveRateConfig, syncRatesFromElToque,
  listStockMovements,
} from "../firestore.js";
import { formatMoney, formatDate } from "../currency.js";
import { toast, icon, showModal, closeModal, confirmDialog } from "../ui.js";
import { CURRENCIES, CATEGORY_COLORS, STOCK_REASONS, STOCK_REASON_LABELS } from "../types.js";
import { uploadImageAsWebP, pickImageFile } from "../image-upload.js";

const TABS = [
  { id: "users", label: "Usuarios", icon: "userCog" },
  { id: "products", label: "Productos", icon: "tags" },
  { id: "categories", label: "Categorías", icon: "tags" },
  { id: "warehouses", label: "Almacenes", icon: "store" },
  { id: "managers", label: "Gestores", icon: "users" },
  { id: "cards", label: "Tarjetas", icon: "creditCard" },
  { id: "warehouseCommissions", label: "Comisiones locales", icon: "wallet" },
  { id: "rates", label: "Tasas", icon: "trendingUp" },
  { id: "audit", label: "Auditoría", icon: "receipt" },
];

export function mountAdminView(container, navigate) {
  const store = getStore();
  const user = store.getState().currentUser;
  if (!user || user.role !== "admin") {
    container.innerHTML = `<div class="empty-state">⚠️ Solo administradores pueden acceder a este panel</div>`;
    return () => {};
  }

  let activeTab = "users";
  let tabGeneration = 0; // evita race condition al cambiar tabs rápido

  function render() {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("settings", 24)} Panel admin</h1>
          <p class="text-sm text-muted">Gestión completa del sistema</p>
        </div>

        <div class="tabs-list" style="grid-template-columns: repeat(${TABS.length}, 1fr); overflow-x:auto">
          ${TABS.map((t) => `
            <button class="tabs-trigger ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
              ${icon(t.icon, 14)}
              <span class="md:show" style="display:none">${t.label}</span>
            </button>
          `).join('')}
        </div>

        <div id="admin-tab-content"></div>
      </div>
    `;

    container.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        container.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
        renderTabContent();
      });
    });

    renderTabContent();
  }

  function renderTabContent() {
    const content = container.querySelector("#admin-tab-content");
    if (!content) return;
    const myGen = ++tabGeneration; // incrementa generación al cambiar de tab
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;

    switch (activeTab) {
      case "users": mountUsersPanel(content, myGen); break;
      case "products": mountProductsPanel(content, myGen); break;
      case "categories": mountCategoriesPanel(content, myGen); break;
      case "warehouses": mountWarehousesPanel(content, myGen); break;
      case "managers": mountManagersPanel(content, myGen); break;
      case "cards": mountCardsPanel(content, myGen); break;
      case "warehouseCommissions": mountWarehouseCommissionsPanel(content, myGen); break;
      case "rates": mountRatesPanel(content, myGen); break;
      case "audit": mountAuditPanel(content, myGen); break;
    }
  }

  // ===== USERS =====
  function mountUsersPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listUsers().then((users) => {
      if (gen !== tabGeneration) return; // tab cambió, ignorar resultado
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
                    <td class="font-medium">${u.displayName}</td>
                    <td class="text-xs text-muted">${u.username}</td>
                    <td><span class="badge badge-outline">${u.role}</span></td>
                    <td class="text-xs">${u.warehouseName || u.warehouseCode || '—'}</td>
                    <td class="text-center">${u.active ? `<span class="badge badge-accent">Activo</span>` : `<span class="badge">Inactivo</span>`}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-edit-user="${u.id}">Editar</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-user").addEventListener("click", () => showUserDialog(null, () => mountUsersPanel(content)));
      content.querySelectorAll("[data-edit-user]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const u = users.find((x) => x.id === btn.dataset.editUser);
          if (u) showUserDialog(u, () => mountUsersPanel(content));
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
            <div><label class="label label-xs">Nombre *</label><input class="input" id="u-name" value="${u.displayName || ''}" /></div>
            <div><label class="label label-xs">Usuario *</label><input class="input" id="u-username" value="${u.username || ''}" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Email</label><input class="input" type="email" id="u-email" value="${u.email || ''}" /></div>
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
                    <td class="font-medium">${p.name}</td>
                    <td class="text-xs">${p.brand}</td>
                    <td class="text-xs text-muted">${p.categoryName || '—'}</td>
                    <td class="text-right">${formatMoney(p.salePrice, "USD")}</td>
                    <td class="text-right text-xs">
                      <div>G: ${p.gestorCommission ?? p.commission ?? 0} ${p.gestorCommissionCurrency ?? p.commissionCurrency ?? "USD"}</div>
                      <div style="color:var(--text-muted)">V: ${p.vendorCommission ?? 0} ${p.vendorCommissionCurrency ?? "MN"}</div>
                    </td>
                    <td class="text-center">${p.active ? `<span class="badge badge-accent">Activo</span>` : `<span class="badge">Inactivo</span>`}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-edit-product="${p.id}">Editar</button>
                      <button class="btn btn-ghost btn-sm text-danger" data-delete-product="${p.id}">${icon("trash", 12)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-product").addEventListener("click", () => showProductDialog(null, categories, () => mountProductsPanel(content)));
      content.querySelectorAll("[data-edit-product]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = products.find((x) => x.id === btn.dataset.editProduct);
          if (p) showProductDialog(p, categories, () => mountProductsPanel(content));
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
            <div><label class="label label-xs">Nombre *</label><input class="input" id="p-name" value="${p.name || ''}" /></div>
            <div><label class="label label-xs">Marca *</label><input class="input" id="p-brand" value="${p.brand || ''}" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">SKU</label><input class="input" id="p-sku" value="${p.sku || ''}" /></div>
            <div><label class="label label-xs">Viscosidad</label><input class="input" id="p-viscosity" value="${p.viscosity || ''}" placeholder="5W-30" /></div>
          </div>
          <div><label class="label label-xs">Categoría</label>
            <select class="select" id="p-category">
              <option value="">(sin categoría)</option>
              ${categories.filter(c => !c.parentId).map((c) => `
                <option value="${c.id}" ${p.categoryId === c.id ? 'selected' : ''}>${c.name}</option>
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
          <div>
            <label class="label label-xs">Imagen del producto</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
              <div id="p-image-preview" style="width:3rem;height:3rem;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:100%;height:100%;object-fit:cover" />` : icon("tags", 20)}
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
      const data = {
        ...(p.id ? { id: p.id } : {}),
        name: document.querySelector("#p-name").value.trim(),
        brand: document.querySelector("#p-brand").value.trim(),
        sku: document.querySelector("#p-sku").value.trim() || null,
        viscosity: document.querySelector("#p-viscosity").value.trim() || null,
        categoryId: document.querySelector("#p-category").value || null,
        salePrice: parseFloat(document.querySelector("#p-price").value) || 0,
        minStock: parseInt(document.querySelector("#p-minStock").value) || 0,
        // 2 comisiones separadas: gestor y vendedor
        gestorCommission: parseFloat(document.querySelector("#p-gestorCommission").value) || 0,
        gestorCommissionCurrency: document.querySelector("#p-gestorCommissionCurrency").value,
        vendorCommission: parseFloat(document.querySelector("#p-vendorCommission").value) || 0,
        vendorCommissionCurrency: document.querySelector("#p-vendorCommissionCurrency").value,
        // Backwards compat (legacy single commission = gestor)
        commission: parseFloat(document.querySelector("#p-gestorCommission").value) || 0,
        commissionCurrency: document.querySelector("#p-gestorCommissionCurrency").value,
        imageUrl: document.querySelector("#p-image").value.trim() || null,
        active: true,
      };
      if (!data.name || !data.brand) { toast("Nombre y marca son obligatorios", "error"); return; }
      await saveProduct(data);
      toast("Producto guardado", "success");
      close();
      onSaved();
    });
  }

  // ===== CATEGORIES =====
  function mountCategoriesPanel(content, gen) {
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
                      <span style="font-size:1.25rem">${c.icon || '📁'}</span>
                      <span class="font-semibold">${c.name}</span>
                      <span class="badge badge-outline" style="font-size:0.5625rem">${c.color || 'slate'}</span>
                    </div>
                    <div class="flex gap-1">
                      <button class="btn btn-ghost btn-sm" data-edit-cat="${c.id}">Editar</button>
                      <button class="btn btn-ghost btn-sm text-danger" data-delete-cat="${c.id}">${icon("trash", 12)}</button>
                    </div>
                  </div>
                  ${subs.length > 0 ? `
                    <div style="display:flex;flex-direction:column;gap:0.25rem;padding-left:1.5rem">
                      ${subs.map((s) => `
                        <div class="flex items-center justify-between text-xs">
                          <span>${s.name}</span>
                          <button class="btn btn-ghost btn-icon btn-sm text-danger" data-delete-sub="${s.id}">${icon("trash", 12)}</button>
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
      content.querySelector("#new-cat").addEventListener("click", () => showCategoryDialog(null, () => mountCategoriesPanel(content)));
      content.querySelectorAll("[data-edit-cat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = categories.find((x) => x.id === btn.dataset.editCat);
          if (c) showCategoryDialog(c, () => mountCategoriesPanel(content));
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
          mountCategoriesPanel(content);
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
          <div><label class="label label-xs">Nombre *</label><input class="input" id="c-name" value="${c.name || ''}" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Ícono (emoji)</label><input class="input" id="c-icon" value="${c.icon || ''}" placeholder="🛢️" /></div>
            <div><label class="label label-xs">Color</label>
              <select class="select" id="c-color">
                ${CATEGORY_COLORS.map((col) => `<option value="${col}" ${c.color === col ? 'selected' : ''}>${col}</option>`).join('')}
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
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listWarehouses().then((warehouses) => {
      if (gen !== tabGeneration) return;
      content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Almacenes (${warehouses.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-wh">${icon("plus", 14)} Nuevo</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Código</th><th>Dirección</th><th class="text-right">Comisión vendedor</th><th class="text-center">PIN</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${warehouses.map((w) => `
                  <tr>
                    <td class="font-medium">${w.name}</td>
                    <td><span class="badge badge-outline">${w.code}</span></td>
                    <td class="text-xs text-muted">${w.address || '—'}</td>
                    <td class="text-right text-xs">${w.sellerCommissionPercent}% ${w.sellerCommissionCurrency}</td>
                    <td class="text-center">${w.pin ? `<span class="badge badge-accent">Sí</span>` : `<span class="badge">No</span>`}</td>
                    <td class="text-right"><button class="btn btn-ghost btn-sm" data-edit-wh="${w.id}">Editar</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-wh").addEventListener("click", () => showWarehouseDialog(null, () => mountWarehousesPanel(content)));
      content.querySelectorAll("[data-edit-wh]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const w = warehouses.find((x) => x.id === btn.dataset.editWh);
          if (w) showWarehouseDialog(w, () => mountWarehousesPanel(content));
        });
      });
    });
  }

  function showWarehouseDialog(warehouse, onSaved) {
    const isNew = !warehouse;
    const w = warehouse || {};
    const close = showModal({
      title: isNew ? "Nuevo almacén" : "Editar almacén",
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="w-name" value="${w.name || ''}" /></div>
            <div><label class="label label-xs">Código *</label><input class="input" id="w-code" value="${w.code || ''}" placeholder="VIB" /></div>
          </div>
          <div><label class="label label-xs">Dirección</label><input class="input" id="w-address" value="${w.address || ''}" /></div>
          <div><label class="label label-xs">Teléfono</label><input class="input" id="w-phone" value="${w.phone || ''}" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Comisión vendedor (%)</label><input class="input" type="number" step="0.1" id="w-commission" value="${w.sellerCommissionPercent ?? 3}" /></div>
            <div><label class="label label-xs">Moneda comisión</label>
              <select class="select" id="w-currency">
                <option value="USD" ${w.sellerCommissionCurrency === 'USD' ? 'selected' : ''}>USD</option>
                <option value="MN" ${w.sellerCommissionCurrency === 'MN' ? 'selected' : ''}>MN</option>
              </select>
            </div>
          </div>
          <div><label class="label label-xs">PIN (vacío = acceso libre)</label><input class="input" id="w-pin" value="${w.pin || ''}" placeholder="2025" /></div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="w-cancel">Cancelar</button><button class="btn btn-primary" id="w-save">Guardar</button>`,
    });
    document.querySelector("#w-cancel").addEventListener("click", close);
    document.querySelector("#w-save").addEventListener("click", async () => {
      const data = {
        ...(w.id ? { id: w.id } : {}),
        name: document.querySelector("#w-name").value.trim(),
        code: document.querySelector("#w-code").value.trim().toUpperCase(),
        address: document.querySelector("#w-address").value.trim() || null,
        phone: document.querySelector("#w-phone").value.trim() || null,
        sellerCommissionPercent: parseFloat(document.querySelector("#w-commission").value) || 0,
        sellerCommissionCurrency: document.querySelector("#w-currency").value,
        pin: document.querySelector("#w-pin").value.trim() || null,
        active: true,
      };
      if (!data.name || !data.code) { toast("Nombre y código son obligatorios", "error"); return; }
      await saveWarehouse(data);
      toast("Almacén guardado", "success");
      close();
      onSaved();
    });
  }

  // ===== MANAGERS =====
  function mountManagersPanel(content, gen) {
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
              <thead><tr><th>Nombre</th><th>Código</th><th>Teléfono</th><th class="text-right">Comisión</th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${managers.map((m) => `
                  <tr>
                    <td class="font-medium">${m.name}</td>
                    <td><span class="badge badge-outline">${m.code}</span></td>
                    <td class="text-xs">${m.phone || '—'}</td>
                    <td class="text-right text-xs">${m.commission}%</td>
                    <td class="text-center">${m.active ? `<span class="badge badge-accent">Activo</span>` : `<span class="badge">Inactivo</span>`}</td>
                    <td class="text-right"><button class="btn btn-ghost btn-sm" data-edit-mg="${m.id}">Editar</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-mg").addEventListener("click", () => showManagerDialog(null, () => mountManagersPanel(content)));
      content.querySelectorAll("[data-edit-mg]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const m = managers.find((x) => x.id === btn.dataset.editMg);
          if (m) showManagerDialog(m, () => mountManagersPanel(content));
        });
      });
    });
  }

  function showManagerDialog(manager, onSaved) {
    const isNew = !manager;
    const m = manager || {};
    const close = showModal({
      title: isNew ? "Nuevo gestor" : "Editar gestor",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="m-name" value="${m.name || ''}" /></div>
            <div><label class="label label-xs">Código (sigla) *</label><input class="input" id="m-code" value="${m.code || ''}" placeholder="CM" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Teléfono</label><input class="input" id="m-phone" value="${m.phone || ''}" /></div>
            <div><label class="label label-xs">Email</label><input class="input" type="email" id="m-email" value="${m.email || ''}" /></div>
          </div>
          <div><label class="label label-xs">Comisión % (informativo)</label><input class="input" type="number" step="0.1" id="m-commission" value="${m.commission ?? 5}" /></div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="m-cancel">Cancelar</button><button class="btn btn-primary" id="m-save">Guardar</button>`,
    });
    document.querySelector("#m-cancel").addEventListener("click", close);
    document.querySelector("#m-save").addEventListener("click", async () => {
      const data = {
        ...(m.id ? { id: m.id } : {}),
        name: document.querySelector("#m-name").value.trim(),
        code: document.querySelector("#m-code").value.trim().toUpperCase(),
        phone: document.querySelector("#m-phone").value.trim() || null,
        email: document.querySelector("#m-email").value.trim() || null,
        commission: parseFloat(document.querySelector("#m-commission").value) || 0,
        active: true,
      };
      if (!data.name || !data.code) { toast("Nombre y código son obligatorios", "error"); return; }
      await saveManager(data);
      toast("Gestor guardado", "success");
      close();
      onSaved();
    });
  }

  // ===== CARDS =====
  function mountCardsPanel(content, gen) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    listCards().then((cards) => {
      if (gen !== tabGeneration) return;
      content.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title">Tarjetas (${cards.length})</h2>
            <button class="btn btn-primary btn-sm" id="new-card">${icon("plus", 14)} Nueva</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Número</th><th>Banco</th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${cards.map((c) => `
                  <tr>
                    <td class="font-medium">${c.name}</td>
                    <td class="text-xs font-mono">${c.number}</td>
                    <td><span class="badge badge-outline">${c.bank || '—'}</span></td>
                    <td class="text-center">${c.active ? `<span class="badge badge-accent">Activa</span>` : `<span class="badge">Inactiva</span>`}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-edit-card="${c.id}">Editar</button>
                      <button class="btn btn-ghost btn-sm text-danger" data-delete-card="${c.id}">${icon("trash", 12)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      content.querySelector("#new-card").addEventListener("click", () => showCardDialog(null, () => mountCardsPanel(content)));
      content.querySelectorAll("[data-edit-card]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = cards.find((x) => x.id === btn.dataset.editCard);
          if (c) showCardDialog(c, () => mountCardsPanel(content));
        });
      });
      content.querySelectorAll("[data-delete-card]").forEach((btn) => {
        btn.addEventListener("click", () => {
          confirmDialog("¿Eliminar tarjeta? (las ventas existentes conservan el dato)", async () => {
            await deleteCard(btn.dataset.deleteCard);
            toast("Tarjeta eliminada", "success");
            mountCardsPanel(content, tabGeneration);
          });
        });
      });
    });
  }

  function showCardDialog(card, onSaved) {
    const isNew = !card;
    const c = card || {};
    const close = showModal({
      title: isNew ? "Nueva tarjeta" : "Editar tarjeta",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div><label class="label label-xs">Nombre *</label><input class="input" id="c-name" value="${c.name || ''}" placeholder="BPA Principal" /></div>
          <div><label class="label label-xs">Número *</label><input class="input" id="c-number" value="${c.number || ''}" placeholder="9225-6789-0123-4567" /></div>
          <div><label class="label label-xs">Banco</label>
            <select class="select" id="c-bank">
              <option value="">(selecciona)</option>
              <option value="BPA" ${c.bank === 'BPA' ? 'selected' : ''}>BPA</option>
              <option value="BANDEC" ${c.bank === 'BANDEC' ? 'selected' : ''}>BANDEC</option>
              <option value="BANMET" ${c.bank === 'BANMET' ? 'selected' : ''}>BANMET</option>
            </select>
          </div>
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
                        <td class="font-medium">${c.warehouseName} <span class="badge badge-outline">${c.warehouseCode}</span></td>
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
                        <td><span class="badge badge-outline">${STOCK_REASON_LABELS[m.reason] || m.reason}</span></td>
                        <td class="text-xs">${m.productName || m.productId}</td>
                        <td class="text-right font-mono ${m.delta > 0 ? 'text-accent' : 'text-danger'}">${m.delta > 0 ? '+' : ''}${m.delta}</td>
                        <td class="text-xs text-muted">${m.note || '—'}</td>
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
