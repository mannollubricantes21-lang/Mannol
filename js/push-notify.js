// =====================================================
// Push notifications — PWA Notifications API
// =====================================================
// Solicita permiso al usuario y muestra notificaciones
// del sistema cuando la app está en background.
//
// Uso:
//   import { notifySaleCompleted, askPermission } from "./push-notify.js";
//   await askPermission();
//   notifySaleCompleted({ code: "V-00001", total: 50, currency: "USD" });
// =====================================================

let _permission = Notification.permission;

export function isSupported() {
  return typeof Notification !== "undefined";
}

export function getPermission() {
  return _permission;
}

export async function askPermission() {
  if (!isSupported()) return "denied";
  if (_permission === "granted") return "granted";
  if (_permission === "denied") return "denied";
  try {
    _permission = await Notification.requestPermission();
  } catch {
    _permission = "denied";
  }
  return _permission;
}

function shouldNotify() {
  if (!isSupported() || _permission !== "granted") return false;
  // Don't notify if document is focused and visible
  if (document.visibilityState === "visible" && document.hasFocus()) return false;
  return true;
}

export function notify(title, options = {}) {
  if (!shouldNotify()) return null;
  try {
    const n = new Notification(title, {
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-64.png",
      ...options,
    });
    // Auto-close after 8s
    setTimeout(() => { try { n.close(); } catch {} }, 8000);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return n;
  } catch (err) {
    console.warn("[Push] notify failed:", err);
    return null;
  }
}

// Convenience: notify a completed sale
export function notifySaleCompleted(sale) {
  return notify(`Venta completada · ${sale.code}`, {
    body: `Total: ${sale.totalAmount} ${sale.currency || "USD"}\n${sale.items?.length || 0} items · ${sale.warehouseName || ""}`.trim(),
    tag: `sale-${sale.id}`,
  });
}

// Convenience: notify a pending sync queue
export function notifyPendingSync(count) {
  return notify(`${count} venta(s) pendiente(s)`, {
    body: "Se sincronizarán automáticamente cuando recuperes conexión.",
    tag: "pending-sync",
  });
}

// Convenience: notify connection restored
export function notifyConnectionRestored() {
  return notify("Conexión restaurada", {
    body: "Las ventas pendientes se están sincronizando.",
    tag: "connection-restored",
  });
}
