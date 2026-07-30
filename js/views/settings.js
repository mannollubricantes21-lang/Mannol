// =====================================================
// Settings view
// =====================================================

import { getStore } from "../store.js";
import { getSettings, saveSettings, syncElToqueRates, subscribeRates, listWarehouses, saveWarehouse } from "../firestore.js";
import { formatDate } from "../currency.js";
import { toast, icon, showModal } from "../ui.js";

export function mountSettingsView(container, navigate) {
  const store = getStore();
  let form = { ...store.getState().settings };
  let warehouses = [];
  let syncing = false;
  let saving = false;

  async function load() {
    form = await getSettings();
    store.setSettings(form);
    warehouses = await listWarehouses();
    render();
  }

  function render() {
    const rates = Object.values(store.getState().rates);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("settings", 24)} Ajustes</h1>
          <p class="text-sm text-muted">Configuración general del sistema</p>
        </div>

        <div class="card">
          <div class="card-header"><h2 class="card-title flex items-center gap-2">${icon("store", 16)} Negocio</h2></div>
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
            <div><label class="label">Nombre del negocio</label><input class="input" id="s-businessName" value="${form.businessName || ""}" /></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2 class="card-title flex items-center gap-2">${icon("key", 16)} PIN de empleado</h2></div>
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
            <div><label class="label">PIN (4-6 dígitos)</label>
              <input class="input" id="s-pinCode" value="${form.pinCode}" maxlength="6" inputmode="numeric" />
              <p class="text-xs text-muted mt-1">PIN por defecto: 2025. Cambia este valor para personalizar el acceso.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header flex justify-between">
            <h2 class="card-title flex items-center gap-2">${icon("dollar", 16)} Tasas de elToque</h2>
            <button class="btn btn-outline btn-sm" id="s-sync" ${syncing ? "disabled" : ""}>
              ${icon("refresh", 12)} ${syncing ? "Sincronizando..." : "Sincronizar ahora"}
            </button>
          </div>
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.75rem">
            <div class="flex items-center justify-between">
              <div><label class="label" style="margin:0">Habilitar sincronización automática</label>
                <p class="text-xs text-muted">Sincroniza tasas cada hora</p></div>
              <input type="checkbox" id="s-elToqueEnabled" ${form.elToqueEnabled ? "checked" : ""} />
            </div>
            <hr class="border" />
            <div><label class="label">Markup (%) sobre tasa elToque</label>
              <input class="input" type="number" step="0.1" id="s-elToqueMarkup" value="${form.elToqueMarkup}" />
              <p class="text-xs text-muted mt-1">Porcentaje agregado a la tasa oficial.</p>
            </div>
            ${form.lastRateSync ? `<p class="text-xs text-muted">Última sincronización: ${formatDate(form.lastRateSync)}</p>` : ""}
            <hr class="border" />
            <div><label class="label label-xs">Tasas actuales</label>
              <div class="grid grid-cols-4 gap-2 mt-2">
                ${rates.map((r) => `
                  <div class="border rounded p-2 text-center">
                    <div class="text-xs text-muted">${r.currency}</div>
                    <div class="font-bold">${r.rateUSD.toFixed(4)}</div>
                    <span class="badge" style="font-size:0.625rem">${r.source}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2 class="card-title flex items-center gap-2">${icon("store", 16)} Almacenes (${warehouses.length})</h2></div>
          <div class="card-content" style="display:flex;flex-direction:column;gap:0.5rem">
            ${warehouses.map((w) => `
              <div class="flex items-center justify-between border rounded p-2">
                <div>
                  <div class="font-medium text-sm">${w.name} <span class="badge">${w.code}</span></div>
                  <div class="text-xs text-muted">Comisión vendedor: ${w.sellerCommissionPercent || 0}% · ${w.sellerCommissionCurrency || "USD"}</div>
                </div>
                <button class="btn btn-outline btn-sm" data-edit-wh="${w.id}">Editar</button>
              </div>
            `).join("")}
            <button class="btn btn-outline btn-sm btn-block" id="new-wh">+ Nuevo almacén</button>
          </div>
        </div>

        <div class="flex justify-end">
          <button class="btn btn-primary btn-lg" id="save-settings" ${saving ? "disabled" : ""}>
            ${icon("save", 14)} ${saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    `;

    // Wire up form fields
    container.querySelector("#s-businessName").addEventListener("input", (e) => { form.businessName = e.target.value; });
    container.querySelector("#s-pinCode").addEventListener("input", (e) => { form.pinCode = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = form.pinCode; });
    container.querySelector("#s-elToqueEnabled").addEventListener("change", (e) => { form.elToqueEnabled = e.target.checked; });
    container.querySelector("#s-elToqueMarkup").addEventListener("input", (e) => { form.elToqueMarkup = parseFloat(e.target.value) || 0; });

    container.querySelector("#s-sync").addEventListener("click", async () => {
      syncing = true;
      render();
      try {
        const fresh = await syncElToqueRates(form.elToqueMarkup);
        store.setRates(fresh);
        form.lastRateSync = Date.now();
        store.setSettings(form);
        toast(`Tasas sincronizadas (${fresh.length} monedas)`, "success");
      } catch (err) {
        toast("No se pudo sincronizar con elToque", "error");
      } finally {
        syncing = false;
        render();
      }
    });

    container.querySelector("#save-settings").addEventListener("click", async () => {
      saving = true;
      render();
      try {
        await saveSettings(form);
        store.setSettings(form);
        toast("Ajustes guardados", "success");
      } catch (err) {
        toast("Error al guardar", "error");
      } finally {
        saving = false;
        render();
      }
    });

    container.querySelector("#new-wh").addEventListener("click", () => showWarehouseDialog(null));
    container.querySelectorAll("[data-edit-wh]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const w = warehouses.find((x) => x.id === btn.dataset.editWh);
        if (w) showWarehouseDialog(w);
      });
    });
  }

  function showWarehouseDialog(warehouse) {
    const isNew = !warehouse;
    const w = warehouse || {};
    const f = {
      name: w.name || "", code: w.code || "", address: w.address || "",
      phone: w.phone || "",
      sellerCommissionPercent: w.sellerCommissionPercent ?? 5,
      sellerCommissionCurrency: w.sellerCommissionCurrency || "USD",
      pin: w.pin || "",
      active: w.active ?? true,
    };
    const close = showModal({
      title: isNew ? "Nuevo almacén" : "Editar almacén",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="wh-name" value="${f.name}" /></div>
            <div><label class="label label-xs">Código *</label><input class="input" id="wh-code" value="${f.code}" placeholder="ALM-01" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Comisión vendedor (%)</label><input class="input" type="number" step="0.1" id="wh-vendor" value="${f.sellerCommissionPercent}" /></div>
            <div><label class="label label-xs">Moneda comisión</label>
              <select class="select" id="wh-currency">
                <option value="USD" ${f.sellerCommissionCurrency === 'USD' ? 'selected' : ''}>USD</option>
                <option value="MN" ${f.sellerCommissionCurrency === 'MN' ? 'selected' : ''}>MN</option>
              </select>
            </div>
          </div>
          <div><label class="label label-xs">Dirección</label><input class="input" id="wh-address" value="${f.address}" /></div>
          <div><label class="label label-xs">Teléfono</label><input class="input" id="wh-phone" value="${f.phone}" /></div>
          <div><label class="label label-xs">PIN (vacío = acceso libre)</label><input class="input" id="wh-pin" value="${f.pin}" placeholder="2025" /></div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="wh-cancel">Cancelar</button><button class="btn btn-primary" id="wh-save">Guardar</button>`,
    });
    document.querySelector("#wh-cancel").addEventListener("click", close);
    document.querySelector("#wh-save").addEventListener("click", async () => {
      const name = document.querySelector("#wh-name").value.trim();
      const code = document.querySelector("#wh-code").value.trim();
      if (!name || !code) { toast("Nombre y código son obligatorios", "error"); return; }
      await saveWarehouse({
        ...(w.id ? { id: w.id } : {}),
        name, code,
        address: document.querySelector("#wh-address").value,
        phone: document.querySelector("#wh-phone").value,
        sellerCommissionPercent: parseFloat(document.querySelector("#wh-vendor").value) || 0,
        sellerCommissionCurrency: document.querySelector("#wh-currency").value,
        pin: document.querySelector("#wh-pin").value || null,
        active: f.active,
      });
      toast("Almacén guardado", "success");
      close();
      load();
    });
  }

  const unsubRates = subscribeRates((rates) => { store.setRates(rates); render(); });
  load();
  return unsubRates;
}
