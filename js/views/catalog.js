// =====================================================
// Catalog view (products + categories)
// =====================================================

import { getStore } from "../store.js";
import { subscribeProducts, subscribeCategories, subscribeSubcategories, saveProduct, deleteProduct, saveCategory, deleteCategory, saveSubcategory, deleteSubcategory } from "../firestore.js";
import { formatMoney, generateId } from "../currency.js";
import { toast, icon, showModal, closeModal, confirmDialog } from "../ui.js";
import { uploadImageAsWebP, pickImageFile } from "../image-upload.js";

export function mountCatalogView(container, navigate) {
  const store = getStore();
  let products = [];
  let categories = [];
  let subcategories = [];
  let tab = "products";
  let search = "";
  let categoryFilter = "all";

  function render() {
    const filtered = products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.sku || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
      return true;
    });

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("tags", 24)} Catálogo</h1>
            <p class="text-sm text-muted">Productos, categorías y subcategorías</p>
          </div>
          <div class="flex gap-2">
            <button class="btn ${tab === "products" ? "btn-primary" : "btn-outline"} btn-sm" data-tab="products">Productos (${products.length})</button>
            <button class="btn ${tab === "categories" ? "btn-primary" : "btn-outline"} btn-sm" data-tab="categories">${icon("tags", 14)} Categorías (${categories.length})</button>
          </div>
        </div>

        ${tab === "products" ? `
          <div class="flex gap-2">
            <div style="position:relative;flex:1">
              <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 16)}</span>
              <input class="input" placeholder="Buscar producto..." id="search-input" value="${search}" style="padding-left:2.25rem" />
            </div>
            <select class="select" id="category-filter" style="width:12rem">
              <option value="all">Todas las categorías</option>
              ${categories.map((c) => `<option value="${c.id}" ${categoryFilter === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
            </select>
            <button class="btn btn-primary" id="new-product">${icon("plus", 14)} Nuevo</button>
          </div>

          <div class="card">
            <div class="overflow-x-auto">
              <table class="table">
                <thead><tr><th>Producto</th><th>SKU</th><th>Categoría</th>
                  <th class="text-right">Precio USD</th><th class="text-center">Estado</th>
                  <th class="text-right">Acciones</th></tr></thead>
                <tbody>
                  ${filtered.map((p) => {
                    const cat = categories.find((c) => c.id === p.categoryId);
                    return `
                      <tr>
                        <td class="font-medium flex items-center gap-2">
                          ${p.imageUrl || p.imageURL ? `<img src="${p.imageUrl || p.imageURL}" alt="${p.name}" style="width:2rem;height:2rem;border-radius:0.25rem;object-fit:cover" />` : `<div style="width:2rem;height:2rem;border-radius:0.25rem;background:var(--bg-soft);display:flex;align-items:center;justify-content:center">${icon("tags", 12)}</div>`}
                          ${p.name}
                        </td>
                        <td class="text-xs text-muted">${p.sku}</td>
                        <td class="text-xs">${cat?.name || "—"}</td>
                        <td class="text-right">${formatMoney(p.salePrice || p.priceUSD, "USD")}</td>
                        <td class="text-center"><span class="badge ${p.active ? "badge-accent" : ""}">${p.active ? "Activo" : "Inactivo"}</span></td>
                        <td class="text-right">
                          <button class="btn btn-ghost btn-sm" data-edit-product="${p.id}">Editar</button>
                          <button class="btn btn-ghost btn-sm text-danger" data-delete-product="${p.id}">${icon("trash", 12)}</button>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="flex justify-end">
            <button class="btn btn-primary" id="new-category">${icon("plus", 14)} Nueva categoría</button>
          </div>
          <div class="grid md:grid-cols-3 gap-4">
            ${categories.map((c) => {
              const subs = subcategories.filter((s) => s.categoryId === c.id);
              const prods = products.filter((p) => p.categoryId === c.id);
              return `
                <div class="card">
                  <div class="card-header flex justify-between">
                    <h3 class="card-title text-base">${c.icon || "📁"} ${c.name}</h3>
                    <span class="badge">${prods.length} prod.</span>
                  </div>
                  <div class="card-content" style="display:flex;flex-direction:column;gap:0.5rem">
                    ${subs.length === 0 ? `<div class="text-xs text-muted">Sin subcategorías</div>` :
                      subs.map((s) => `
                        <div class="flex items-center justify-between text-xs">
                          <span>${s.name}</span>
                          <button class="btn btn-ghost btn-icon btn-sm text-danger" data-delete-sub="${s.id}">${icon("trash", 12)}</button>
                        </div>
                      `).join("")}
                    <form data-sub-form="${c.id}" style="display:flex;gap:0.25rem;margin-top:0.25rem">
                      <input class="input" placeholder="Nueva subcategoría..." style="height:1.75rem;font-size:0.75rem" name="name" />
                      <button type="submit" class="btn btn-outline btn-sm btn-icon">${icon("plus", 12)}</button>
                    </form>
                    <div class="flex gap-2 mt-2 pt-2 border">
                      <button class="btn btn-outline btn-sm" style="flex:1" data-edit-category="${c.id}">Editar</button>
                      <button class="btn btn-outline btn-sm text-danger" data-delete-category="${c.id}">${icon("trash", 12)}</button>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    `;

    // Wire up
    const searchInput = container.querySelector("#search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        render();
        const newInput = container.querySelector("#search-input");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(search.length, search.length); }
      });
    }
    const catFilter = container.querySelector("#category-filter");
    if (catFilter) {
      catFilter.addEventListener("change", (e) => { categoryFilter = e.target.value; render(); });
    }

    container.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { tab = btn.dataset.tab; render(); });
    });

    const newProductBtn = container.querySelector("#new-product");
    if (newProductBtn) newProductBtn.addEventListener("click", () => showProductDialog(null));

    container.querySelectorAll("[data-edit-product]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = products.find((x) => x.id === btn.dataset.editProduct);
        if (p) showProductDialog(p);
      });
    });
    container.querySelectorAll("[data-delete-product]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = products.find((x) => x.id === btn.dataset.deleteProduct);
        if (!p) return;
        confirmDialog(`¿Eliminar ${p.name}?`, async () => {
          await deleteProduct(p.id);
          toast("Producto eliminado", "success");
        });
      });
    });

    const newCatBtn = container.querySelector("#new-category");
    if (newCatBtn) newCatBtn.addEventListener("click", () => showCategoryDialog(null));

    container.querySelectorAll("[data-edit-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = categories.find((x) => x.id === btn.dataset.editCategory);
        if (c) showCategoryDialog(c);
      });
    });
    container.querySelectorAll("[data-delete-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = categories.find((x) => x.id === btn.dataset.deleteCategory);
        if (!c) return;
        confirmDialog(`¿Eliminar ${c.name}?`, async () => {
          await deleteCategory(c.id);
          toast("Categoría eliminada", "success");
        });
      });
    });

    container.querySelectorAll("[data-delete-sub]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteSubcategory(btn.dataset.deleteSub);
        toast("Subcategoría eliminada", "success");
      });
    });

    container.querySelectorAll("[data-sub-form]").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const categoryId = form.dataset.subForm;
        const name = form.querySelector('[name="name"]').value.trim();
        if (!name) return;
        await saveSubcategory({
          categoryId, name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          order: 0,
        });
        toast("Subcategoría agregada", "success");
      });
    });
  }

  function showProductDialog(product) {
    const isNew = !product;
    const p = product || {};
    const close = showModal({
      title: isNew ? "Nuevo producto" : "Editar producto",
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="p-name" value="${p.name || ""}" /></div>
            <div><label class="label label-xs">SKU *</label><input class="input" id="p-sku" value="${p.sku || ""}" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Categoría *</label>
              <select class="select" id="p-category">${categories.map((c) => `<option value="${c.id}" ${p.categoryId === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select>
            </div>
            <div><label class="label label-xs">Subcategoría</label>
              <select class="select" id="p-subcategory"><option value="">(opcional)</option>${subcategories.filter((s) => s.categoryId === p.categoryId).map((s) => `<option value="${s.id}" ${p.subcategoryId === s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Precio USD *</label><input class="input" type="number" step="0.01" id="p-price" value="${p.salePrice || p.priceUSD || ""}" /></div>
            <div><label class="label label-xs">Estado</label>
              <select class="select" id="p-active"><option value="true" ${p.active !== false ? "selected" : ""}>Activo</option><option value="false" ${p.active === false ? "selected" : ""}>Inactivo</option></select>
            </div>
          </div>
          <div><label class="label label-xs">Descripción</label><input class="input" id="p-description" value="${p.description || ""}" /></div>
          <div>
            <label class="label label-xs">Imagen del producto</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
              <div id="p-image-preview" style="width:3rem;height:3rem;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${p.imageUrl || p.imageURL ? `<img src="${p.imageUrl || p.imageURL}" style="width:100%;height:100%;object-fit:cover" />` : icon("tags", 20)}
              </div>
              <div style="flex:1;display:flex;flex-direction:column;gap:0.25rem">
                <button type="button" class="btn btn-outline btn-sm" id="p-upload-btn">${icon("download", 12)} Subir imagen</button>
                <input class="input" id="p-image" value="${p.imageUrl || p.imageURL || ""}" placeholder="URL o sube archivo" style="font-size:0.75rem" />
                <p class="text-xs text-muted" id="p-image-info" style="margin:0">Se convierte a WebP automáticamente</p>
              </div>
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" id="p-cancel">Cancelar</button>
        <button class="btn btn-primary" id="p-save">Guardar</button>
      `,
    });
    document.querySelector("#p-cancel").addEventListener("click", close);
    document.querySelector("#p-category").addEventListener("change", (e) => {
      const catId = e.target.value;
      const subSelect = document.querySelector("#p-subcategory");
      subSelect.innerHTML = `<option value="">(opcional)</option>` + subcategories.filter((s) => s.categoryId === catId).map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
    });

    // ===== Upload de imagen con conversión a WebP =====
    const uploadBtn = document.querySelector("#p-upload-btn");
    const imageInput = document.querySelector("#p-image");
    const imagePreview = document.querySelector("#p-image-preview");
    const imageInfo = document.querySelector("#p-image-info");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", async () => {
        try {
          uploadBtn.disabled = true;
          uploadBtn.innerHTML = `<div class="spinner spinner-sm"></div> Convirtiendo...`;
          const file = await pickImageFile("image/jpeg,image/png,image/webp,image/jpg");
          uploadBtn.innerHTML = `<div class="spinner spinner-sm"></div> Subiendo...`;
          const result = await uploadImageAsWebP(file, "products");
          imageInput.value = result.url;
          imagePreview.innerHTML = `<img src="${result.url}" style="width:100%;height:100%;object-fit:cover" />`;
          const savedText = result.savedPct > 0 ? ` · ${result.savedPct}% más pequeño` : "";
          imageInfo.innerHTML = `<span style="color:var(--accent)">WebP ${(result.webpSize/1024).toFixed(1)} KB${savedText}</span>`;
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
      const name = document.querySelector("#p-name").value.trim();
      const sku = document.querySelector("#p-sku").value.trim();
      const categoryId = document.querySelector("#p-category").value;
      if (!name || !sku || !categoryId) {
        toast("Nombre, SKU y categoría son obligatorios", "error");
        return;
      }
      await saveProduct({
        ...(p.id ? { id: p.id } : {}),
        name, sku, categoryId,
        subcategoryId: document.querySelector("#p-subcategory").value || null,
        description: document.querySelector("#p-description").value,
        salePrice: parseFloat(document.querySelector("#p-price").value) || 0,
        imageUrl: document.querySelector("#p-image").value || null,
        active: document.querySelector("#p-active").value === "true",
      });
      toast("Producto guardado", "success");
      close();
    });
  }

  function showCategoryDialog(category) {
    const isNew = !category;
    const c = category || {};
    const close = showModal({
      title: isNew ? "Nueva categoría" : "Editar categoría",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div><label class="label label-xs">Nombre *</label><input class="input" id="c-name" value="${c.name || ""}" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Ícono (emoji)</label><input class="input" id="c-icon" value="${c.icon || ""}" placeholder="📦" /></div>
            <div><label class="label label-xs">Orden</label><input class="input" type="number" id="c-order" value="${c.order ?? 0}" /></div>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="c-cancel">Cancelar</button><button class="btn btn-primary" id="c-save">Guardar</button>`,
    });
    document.querySelector("#c-cancel").addEventListener("click", close);
    document.querySelector("#c-save").addEventListener("click", async () => {
      const name = document.querySelector("#c-name").value.trim();
      if (!name) { toast("Nombre obligatorio", "error"); return; }
      await saveCategory({
        ...(c.id ? { id: c.id } : {}),
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        icon: document.querySelector("#c-icon").value || null,
        order: parseInt(document.querySelector("#c-order").value) || 0,
      });
      toast("Categoría guardada", "success");
      close();
    });
  }

  const unsubP = subscribeProducts((items) => { products = items; render(); });
  const unsubC = subscribeCategories((items) => { categories = items; render(); });
  const unsubS = subscribeSubcategories((items) => { subcategories = items; render(); });

  render();
  return () => { unsubP(); unsubC(); unsubS(); };
}
