// =====================================================
// Users view (admin only)
// =====================================================

import { listUsers, saveUser, deleteUser, listWarehouses } from "../firestore.js";
import { toast, icon, showModal, confirmDialog } from "../ui.js";

const ROLES = ["admin", "gestor", "vendedor"];
const ROLE_LABELS = {
  admin: "Administrador", gestor: "Gestor", vendedor: "Vendedor", empleado_pin: "Empleado PIN",
};

export function mountUsersView(container, navigate) {
  let users = [];
  let warehouses = [];

  async function refresh() {
    users = await listUsers();
    render();
  }

  function render() {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("users", 24)} Usuarios</h1>
            <p class="text-sm text-muted">Administra cuentas de admin, gestores y vendedores</p>
          </div>
          <button class="btn btn-primary" id="new-user">${icon("plus", 14)} Nuevo usuario</button>
        </div>

        <div class="card">
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th>
                <th>Almacenes</th><th class="text-center">Estado</th>
                <th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${users.length === 0 ? `<tr><td colspan="6" class="empty-state">No hay usuarios. Crea el primer usuario administrador.</td></tr>` :
                  users.map((u) => `
                    <tr>
                      <td class="font-medium">${u.displayName}</td>
                      <td class="text-xs text-muted">✉ ${u.email}</td>
                      <td><span class="badge">${ROLE_LABELS[u.role] || u.role}</span></td>
                      <td class="text-xs">${u.warehouseIds?.length || 0} asignados</td>
                      <td class="text-center">
                        ${u.active ? `<span class="badge badge-accent">${icon("check", 12)} Activo</span>` : `<span class="badge">Inactivo</span>`}
                      </td>
                      <td class="text-right">
                        <button class="btn btn-ghost btn-sm" data-edit-user="${u.id}">Editar</button>
                        <button class="btn btn-ghost btn-sm text-danger" data-delete-user="${u.id}">${icon("trash", 12)}</button>
                      </td>
                    </tr>
                  `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="background:var(--bg-soft)">
          <div class="card-content text-sm">
            <div class="flex items-start gap-2">
              <span style="color:var(--primary);flex-shrink:0">${icon("shield", 20)}</span>
              <div>
                <p class="font-medium mb-1">Importante:</p>
                <p class="text-muted text-xs">Para crear un usuario con login por email/contraseña, primero créalo en Firebase Authentication (Console → Authentication → Add user) con el mismo email. Luego créalo aquí con el rol correspondiente. La contraseña no se guarda en Firestore.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelector("#new-user").addEventListener("click", () => showDialog(null));
    container.querySelectorAll("[data-edit-user]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = users.find((x) => x.id === btn.dataset.editUser);
        if (u) showDialog(u);
      });
    });
    container.querySelectorAll("[data-delete-user]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = users.find((x) => x.id === btn.dataset.deleteUser);
        if (!u) return;
        confirmDialog(`¿Eliminar a ${u.displayName}?`, async () => {
          await deleteUser(u.id);
          refresh();
          toast("Usuario eliminado", "success");
        });
      });
    });
  }

  function showDialog(user) {
    const isNew = !user;
    const u = user || {};
    const close = showModal({
      title: isNew ? "Nuevo usuario" : "Editar usuario",
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Nombre *</label><input class="input" id="u-name" value="${u.displayName || ""}" /></div>
            <div><label class="label label-xs">Email *</label><input class="input" type="email" id="u-email" value="${u.email || ""}" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="label label-xs">Rol *</label>
              <select class="select" id="u-role">${ROLES.map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}</select>
            </div>
            <div><label class="label label-xs">Comisión personalizada (%)</label><input class="input" type="number" step="0.1" id="u-commission" value="${u.commissionRate ?? 0}" /></div>
          </div>
          <div>
            <label class="label label-xs">Almacenes asignados</label>
            <div class="grid grid-cols-2 gap-1" style="max-height:10rem;overflow-y:auto;border:1px solid var(--border);border-radius:0.25rem;padding:0.5rem">
              ${warehouses.map((w) => `
                <label class="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" data-warehouse="${w.id}" ${u.warehouseIds?.includes(w.id) ? "checked" : ""} />
                  ${w.name} (${w.code})
                </label>
              `).join("") || `<span class="text-xs text-muted">No hay almacenes.</span>`}
            </div>
          </div>
          <div class="flex items-center justify-between border rounded p-2">
            <label class="label label-xs" style="margin:0">Cuenta activa</label>
            <input type="checkbox" id="u-active" ${u.active !== false ? "checked" : ""} />
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="u-cancel">Cancelar</button><button class="btn btn-primary" id="u-save">Guardar</button>`,
    });
    document.querySelector("#u-cancel").addEventListener("click", close);
    document.querySelector("#u-save").addEventListener("click", async () => {
      const name = document.querySelector("#u-name").value.trim();
      const email = document.querySelector("#u-email").value.trim();
      if (!name) { toast("Nombre es obligatorio", "error"); return; }
      if (!email) { toast("Email es obligatorio", "error"); return; }
      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) { toast("Email inválido", "error"); return; }
      const warehouseIds = Array.from(document.querySelectorAll("[data-warehouse]:checked")).map((c) => c.dataset.warehouse);
      await saveUser({
        ...(u.id ? { id: u.id } : {}),
        displayName: name,
        email,
        role: document.querySelector("#u-role").value,
        commissionRate: parseFloat(document.querySelector("#u-commission").value) || 0,
        warehouseIds,
        active: document.querySelector("#u-active").checked,
      });
      toast("Usuario guardado", "success");
      close();
      refresh();
    });
  }

  (async () => {
    warehouses = await listWarehouses();
    await refresh();
  })();

  return () => {};
}
