// =====================================================
// MANNOL POS — Setup Wizard
// =====================================================
// Guided UI that walks the user through connecting their
// MANNOL POS front-end to a Supabase project.
//
// Steps:
//   1. Bienvenida
//   2. Crear proyecto en Supabase
//   3. Ejecutar scripts SQL (schema + policies + seed)
//   4. Crear el primer admin
//   5. Pegar credenciales (URL + anon key) + test de conexión
//   6. Habilitar Realtime
//   7. Verificación final + ir a la app
//
// The wizard saves config to localStorage (key: mannol-supabase-config-v1)
// so users don't need to manually edit js/supabase-config.js.
// =====================================================

import {
  saveStoredSupabaseConfig,
  getStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  SUPABASE_CONFIG_STORAGE_KEY,
} from "./supabase.js";

// ===== Icons (inline SVG, same style as ui.js) =====
const ICONS = {
  droplet: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  sun: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  arrowRight: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  arrowLeft: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  external: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  alert: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  database: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  key: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 7"/></svg>',
  zap: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  rocket: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  spinner: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" style="animation: wizard-spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
};

// ===== Step definitions =====
const STEPS = [
  { id: "welcome",      label: "Inicio",            short: "Inicio" },
  { id: "create-proj",  label: "Crear proyecto",    short: "Proyecto" },
  { id: "run-sql",      label: "Ejecutar SQL",      short: "SQL" },
  { id: "create-admin", label: "Crear admin",      short: "Admin" },
  { id: "credentials",  label: "Credenciales",      short: "Claves" },
  { id: "realtime",     label: "Realtime",          short: "Realtime" },
  { id: "done",         label: "Verificación",      short: "Listo" },
];

// ===== SQL file URLs (relative to setup.html) =====
const SQL_FILES = [
  { name: "schema.sql",   url: "./supabase/schema.sql",   num: 1, desc: "Crea 14 tablas + índices + 3 RPCs + campos mayorista" },
  { name: "policies.sql", url: "./supabase/policies.sql", num: 2, desc: "Activa RLS + buckets Storage + grants + funciones seguridad" },
  { name: "seed.sql",      url: "./supabase/seed.sql",     num: 3, desc: "Datos demo: 4 almacenes, 12 productos, 4 gestores, tarjetas" },
];

// ===== State =====
let currentStepIdx = 0;
let loadedSql = {}; // { "schema.sql": "...", "policies.sql": "...", "seed.sql": "..." }
let activeSqlTab = "schema.sql";

// ===== Helpers =====
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function toast(message, type = "info", duration = 2500) {
  const container = document.getElementById("toast-container");
  if (!container) {
    console.log(`[toast:${type}]`, message);
    return;
  }
  // Use the app's toast styles (from styles.css)
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-leave");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard failed, falling back", err);
  }
  // Fallback for non-secure contexts (file://, http://)
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    console.error("copy fallback failed", err);
    return false;
  }
}

async function fetchSql(name) {
  if (loadedSql[name]) return loadedSql[name];
  const meta = SQL_FILES.find((f) => f.name === name);
  if (!meta) throw new Error(`Unknown SQL file: ${name}`);
  try {
    const res = await fetch(meta.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    loadedSql[name] = text;
    return text;
  } catch (err) {
    console.error(`Failed to fetch ${name}:`, err);
    throw new Error(`No se pudo cargar ${name}. ¿Estás sirviendo el proyecto con un servidor (http://)? No funciona con file://.`);
  }
}

function isValidSupabaseUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url || "");
}
function isValidAnonKey(key) {
  // Supabase anon keys are JWTs starting with eyJ
  return /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key || "");
}

// ===== Main render =====
export function mountWizard(container) {
  console.info("[Wizard] mounting...");
  renderShell(container);
  renderStep(container);
  console.info("[Wizard] mounted");
}

function renderShell(container) {
  container.innerHTML = `
    <div class="wizard-shell">
      <header class="wizard-header">
        <div class="wizard-header-brand">
          <div class="wizard-header-logo">${ICONS.droplet}</div>
          <div>
            <h1 class="wizard-header-title">MANNOL · Configurar Supabase</h1>
            <p class="wizard-header-subtitle">Asistente de conexión paso a paso</p>
          </div>
        </div>
        <div class="wizard-header-actions">
          <button class="wizard-theme-btn" id="wizard-theme-btn" title="Cambiar tema" aria-label="Cambiar tema"></button>
          <a href="./index.html" class="wizard-btn wizard-btn-ghost" title="Volver a la app">
            ${ICONS.arrowLeft} <span class="hidden sm:inline">Volver</span>
          </a>
        </div>
      </header>

      <div class="wizard-progress" id="wizard-progress">
        <div class="wizard-progress-track" id="wizard-progress-track"></div>
      </div>

      <main class="wizard-main" id="wizard-main"></main>

      <footer class="wizard-footer" id="wizard-footer"></footer>
    </div>
  `;

  // Theme button
  const themeBtn = $("#wizard-theme-btn");
  const updateThemeBtn = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
  };
  updateThemeBtn();
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    // Persist theme
    try {
      const raw = localStorage.getItem("almacen-pos-state-v1");
      const state = raw ? JSON.parse(raw) : {};
      state.theme = next;
      localStorage.setItem("almacen-pos-state-v1", JSON.stringify(state));
    } catch {}
    updateThemeBtn();
  });

  // Render progress bar
  const track = $("#wizard-progress-track");
  track.innerHTML = STEPS.map((s, i) => `
    <div class="wizard-progress-step" data-step-idx="${i}">
      <div class="wizard-progress-circle"><span>${i + 1}</span></div>
      <div class="wizard-progress-label">${s.short}</div>
      ${i < STEPS.length - 1 ? '<div class="wizard-progress-connector"></div>' : ''}
    </div>
  `).join("");

  // Allow clicking on completed steps to go back
  $$(".wizard-progress-step", track).forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.stepIdx, 10);
      if (idx <= currentStepIdx) goToStep(idx);
    });
  });
}

function renderStep(container) {
  // Update progress bar
  $$(".wizard-progress-step").forEach((el, i) => {
    el.classList.toggle("active", i === currentStepIdx);
    el.classList.toggle("done", i < currentStepIdx);
  });

  const main = $("#wizard-main");
  const footer = $("#wizard-footer");
  const step = STEPS[currentStepIdx];

  // Render step content
  main.innerHTML = `<div class="wizard-step active" id="step-${step.id}">${renderStepContent(step.id)}</div>`;
  renderFooter(footer, step.id);

  // Wire step-specific events
  wireStep(step.id);
}

function renderFooter(footer, stepId) {
  const isFirst = currentStepIdx === 0;
  const isLast = currentStepIdx === STEPS.length - 1;

  footer.innerHTML = `
    <div class="wizard-footer-left">
      ${!isFirst ? `<button class="wizard-btn wizard-btn-secondary" data-action="prev">${ICONS.arrowLeft} Anterior</button>` : ""}
    </div>
    <div class="wizard-footer-right">
      ${stepId === "credentials" ? `<button class="wizard-btn wizard-btn-secondary" data-action="test-conn" id="footer-test-btn">Probar conexión</button>` : ""}
      ${stepId === "done" ? `<a href="./index.html" class="wizard-btn wizard-btn-primary">Ir a la app ${ICONS.arrowRight}</a>` : ""}
      ${!isLast && stepId !== "done" ? `<button class="wizard-btn wizard-btn-primary" data-action="next">Siguiente ${ICONS.arrowRight}</button>` : ""}
    </div>
  `;

  // Wire nav buttons
  $$("[data-action]", footer).forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "prev") goToStep(currentStepIdx - 1);
      else if (action === "next") goToStep(currentStepIdx + 1);
      else if (action === "test-conn") testConnection();
    });
  });
}

function goToStep(idx) {
  if (idx < 0 || idx >= STEPS.length) return;
  currentStepIdx = idx;
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderStep(document.getElementById("wizard-app"));
}

// ===== Step content renderers =====
function renderStepContent(stepId) {
  switch (stepId) {
    case "welcome":      return renderWelcomeStep();
    case "create-proj":  return renderCreateProjectStep();
    case "run-sql":      return renderRunSqlStep();
    case "create-admin": return renderCreateAdminStep();
    case "credentials":  return renderCredentialsStep();
    case "realtime":     return renderRealtimeStep();
    case "done":         return renderDoneStep();
    default:             return "<p>Step not found</p>";
  }
}

function renderWelcomeStep() {
  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 1 de 7</p>
      <h2 class="wizard-step-title">Bienvenido al asistente de configuración</h2>
      <p class="wizard-step-description">
        Este asistente te guiará paso a paso para conectar MANNOL POS con tu base de datos
        Supabase. No necesitas conocimientos técnicos — solo seguir las instrucciones
        y copiar/pegar cuando se te pida.
      </p>
    </div>

    <div class="wizard-step-hero">
      <div class="wizard-step-hero-icon">${ICONS.droplet}</div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">${ICONS.info} ¿Qué es Supabase?</h3>
      <div class="wizard-card-body">
        <p>
          Supabase es un servicio en la nube que proporciona <strong>base de datos</strong>,
          <strong>autenticación de usuarios</strong>, <strong>almacenamiento de archivos</strong>
          y <strong>actualizaciones en tiempo real</strong>. Para MANNOL POS, reemplaza
          la necesidad de tener un servidor propio.
        </p>
        <p>
          Es gratis para empezar (plan Free) y suficiente para una tienda pequeña.
          Solo necesitas crear una cuenta y un proyecto.
        </p>
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">${ICONS.info} ¿Qué haremos en este asistente?</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li><strong>Crear un proyecto</strong> en supabase.com (gratis).</li>
          <li><strong>Ejecutar 3 scripts SQL</strong> que crean las tablas, las políticas de seguridad y los datos demo. Solo copy/paste — no tienes que escribir SQL.</li>
          <li><strong>Crear tu usuario administrador</strong> en el panel de Supabase.</li>
          <li><strong>Pegar las credenciales</strong> (URL + key pública) en este asistente. Las guardamos en este navegador.</li>
          <li><strong>Habilitar Realtime</strong> para que los cambios se sincronicen entre dispositivos en vivo.</li>
          <li><strong>Verificar</strong> que todo funciona — y a usar la app.</li>
        </ol>
      </div>
    </div>

    <div class="wizard-alert wizard-alert-info">
      <span class="wizard-alert-icon">${ICONS.info}</span>
      <div>
        <strong>Tiempo aproximado:</strong> 10-15 minutos. La mayor parte es esperar a que
        Supabase procese los scripts (1-2 min cada uno).
      </div>
    </div>

    <div class="wizard-alert wizard-alert-warning">
      <span class="wizard-alert-icon">${ICONS.alert}</span>
      <div>
        <strong>Requisitos:</strong> Una cuenta de email válida (para registrarte en Supabase)
        y conexión a internet. No necesitas instalar nada en tu computadora.
      </div>
    </div>
  `;
}

function renderCreateProjectStep() {
  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 2 de 7</p>
      <h2 class="wizard-step-title">Crear el proyecto en Supabase</h2>
      <p class="wizard-step-description">
        Vamos a crear tu cuenta y tu primer proyecto en Supabase. Si ya tienes uno,
        puedes saltarte este paso.
      </p>
    </div>

    <div class="wizard-step-hero">
      <div class="wizard-step-hero-icon">${ICONS.database}</div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Crear cuenta y proyecto</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>Ve a <strong>supabase.com</strong> y haz click en <strong>"Start your project"</strong> o "Sign in".</li>
          <li>Inicia sesión con GitHub (recomendado) o con tu email.</li>
          <li>Una vez dentro, haz click en <strong>"New project"</strong>.</li>
          <li>Elige tu organización (usualmente tu nombre de usuario) y completa:
            <ul style="margin:0.5rem 0 0 1.5rem; padding:0; list-style: disc; font-size: 0.8125rem; line-height: 1.6;">
              <li><strong>Nombre:</strong> <code>mannol-pos</code> (o el que prefieras)</li>
              <li><strong>Database Password:</strong> genera una contraseña fuerte y <strong>guárdala en un lugar seguro</strong> (no la vas a usar en la app, pero la necesitarás si quieres acceder al DB directamente).</li>
              <li><strong>Region:</strong> la más cercana a Cuba — <code>US East (North Virginia)</code> o <code>South America (São Paulo)</code></li>
              <li><strong>Pricing Plan:</strong> <code>Free</code> ($0, suficiente para empezar)</li>
            </ul>
          </li>
          <li>Haz click en <strong>"Create new project"</strong> y espera <strong>~2 minutos</strong> a que termine el provisioning.</li>
        </ol>
      </div>
    </div>

    <div class="wizard-card" style="text-align:center; padding: 2rem;">
      <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" class="wizard-ext-link">
        Abrir Supabase ${ICONS.external}
      </a>
      <p class="wizard-form-hint" style="margin-top:0.75rem">
        Se abre en una pestaña nueva. Vuelve aquí cuando tengas el proyecto creado.
      </p>
    </div>

    <div class="wizard-alert wizard-alert-info">
      <span class="wizard-alert-icon">${ICONS.info}</span>
      <div>
        <strong>¿Ya tienes un proyecto?</strong> Perfecto, sigue al siguiente paso.
        Solo necesitas poder acceder al <strong>SQL Editor</strong> y a
        <strong>Project Settings → API</strong> dentro de tu proyecto.
      </div>
    </div>

    <div class="wizard-alert wizard-alert-warning">
      <span class="wizard-alert-icon">${ICONS.alert}</span>
      <div>
        <strong>Plan Free:</strong> 500 MB de base de datos, 50,000 usuarios autenticados/mes,
        1 GB de Storage. Es más que suficiente para una tienda mediana. Puedes actualizar
        a Pro ($25/mes) más adelante si lo necesitas.
      </div>
    </div>
  `;
}

function renderRunSqlStep() {
  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 3 de 7</p>
      <h2 class="wizard-step-title">Ejecutar los scripts SQL</h2>
      <p class="wizard-step-description">
        Ahora vamos a crear las tablas, las políticas de seguridad y los datos demo
        en tu base de datos Supabase. Solo tienes que copiar cada script y pegarlo
        en el <strong>SQL Editor</strong> de Supabase.
      </p>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Abrir el SQL Editor</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>En tu proyecto Supabase, busca el icono de <strong>base de datos</strong> en el sidebar izquierdo.</li>
          <li>Haz click en <strong>"SQL Editor"</strong>.</li>
          <li>Haz click en <strong>"New query"</strong> (botón azul arriba a la derecha).</li>
        </ol>
        <p>Ahora verás un editor de texto grande. Ahí es donde pegarás los scripts.</p>
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Copiar y ejecutar cada script</h3>
      <div class="wizard-card-body">
        <p>Pulsa cada pestaña, copia el SQL con el botón <strong>Copy</strong>, pégalo en el SQL Editor
        y haz click en <strong>"Run"</strong>. Repite con los 3, <strong>en este orden exacto</strong>:</p>
      </div>

      <div class="wizard-sql-tabs" id="sql-tabs">
        ${SQL_FILES.map((f, i) => `
          <button class="wizard-sql-tab ${f.name === activeSqlTab ? "active" : ""}" data-sql-tab="${f.name}">
            <span class="wizard-sql-tab-num">${f.num}</span>
            <span>${f.name}</span>
          </button>
        `).join("")}
      </div>

      <div id="sql-tab-meta" class="wizard-form-hint" style="margin-bottom:0.5rem"></div>

      <div class="wizard-code-block" id="sql-code-block">
        <button class="wizard-code-copy" id="sql-copy-btn" title="Copiar al portapapeles">
          ${ICONS.copy} <span>Copy</span>
        </button>
        <pre id="sql-code-content" style="margin:0">Cargando…</pre>
      </div>

      <div class="wizard-alert wizard-alert-danger" id="sql-load-error" style="display:none">
        <span class="wizard-alert-icon">${ICONS.alert}</span>
        <div id="sql-load-error-msg"></div>
      </div>
    </div>

    <div class="wizard-alert wizard alert wizard-alert-warning">
      <span class="wizard-alert-icon">${ICONS.alert}</span>
      <div>
        <strong>Orden estricto:</strong> schema.sql → policies.sql → seed.sql.
        Si ejecutas policies.sql o seed.sql antes que schema.sql, dará error
        "relation does not exist". Si pasa, completa primero schema.sql y vuelve a intentar.
      </div>
    </div>

    <div class="wizard-alert wizard alert-info">
      <span class="wizard-alert-icon">${ICONS.info}</span>
      <div>
        Cada script muestra <strong>"Success. No rows returned"</strong> al terminar.
        Eso es normal — los scripts DDL (CREATE TABLE, etc.) no devuelven filas.
      </div>
    </div>
  `;
}

function renderCreateAdminStep() {
  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 4 de 7</p>
      <h2 class="wizard-step-title">Crear el primer usuario administrador</h2>
      <p class="wizard-step-description">
        Vamos a crear tu usuario admin. Por seguridad, el primer admin se crea manualmente
        en Supabase. Después, desde la app podrás crear más usuarios (vendedores, gestores).
      </p>
    </div>

    <div class="wizard-step-hero">
      <div class="wizard-step-hero-icon">${ICONS.user}</div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Crear el usuario en Authentication</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>En el sidebar de Supabase, busca la sección <strong>"Authentication"</strong> (icono de candado/llave).</li>
          <li>Haz click en <strong>"Users"</strong> → botón <strong>"Add user"</strong> → <strong>"Create new user"</strong>.</li>
          <li>Completa:
            <ul style="margin:0.5rem 0 0 1.5rem; padding:0; list-style: disc; font-size: 0.8125rem; line-height: 1.6;">
              <li><strong>Email:</strong> <code>admin@mannol.cu</code> (o el que prefieras — pero anótalo)</li>
              <li><strong>Password:</strong> una contraseña segura (anótala también — la usarás para entrar a la app)</li>
              <li><strong>Auto Confirm User:</strong> ✅ <strong>marcarlo SÍ</strong> (sino, no podrás loguearte hasta confirmar por email)</li>
            </ul>
          </li>
          <li>Haz click en <strong>"Create user"</strong>.</li>
        </ol>
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Obtener el UUID del usuario</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>En la lista de usuarios (Authentication → Users), busca el usuario recién creado.</li>
          <li>Copia el <strong>UID</strong> — es un string largo tipo <code>a1b2c3d4-e5f6-7890-abcd-ef1234567890</code>.</li>
          <li>Lo necesitas para el siguiente paso.</li>
        </ol>
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Marcarlo como admin en la base de datos</h3>
      <div class="wizard-card-body">
        <p>Vuelve al <strong>SQL Editor</strong> (New query), pega tu UUID donde dice <code>&lt;UUID&gt;</code> y ejecuta:</p>
      </div>

      <div class="wizard-form-group" style="margin-top:0.75rem">
        <label class="wizard-form-label" for="admin-uuid-input">Pega aquí el UUID del usuario que acabas de copiar</label>
        <input type="text" id="admin-uuid-input" class="wizard-form-input" placeholder="a1b2c3d4-e5f6-7890-abcd-ef1234567890" />
        <p class="wizard-form-hint">Se generará el SQL con tu UUID ya reemplazado.</p>
      </div>

      <div class="wizard-form-group" style="margin-top:0.75rem">
        <label class="wizard-form-label" for="admin-email-input">Email del admin (opcional, por defecto: admin@mannol.cu)</label>
        <input type="email" id="admin-email-input" class="wizard-form-input" placeholder="admin@mannol.cu" />
      </div>

      <div class="wizard-form-group" style="margin-top:0.75rem">
        <label class="wizard-form-label" for="admin-name-input">Nombre a mostrar (opcional)</label>
        <input type="text" id="admin-name-input" class="wizard-form-input" placeholder="Administrador" />
      </div>

      <div class="wizard-code-block" style="margin-top:1rem">
        <button class="wizard-code-copy" id="admin-sql-copy" title="Copiar SQL">
          ${ICONS.copy} <span>Copy</span>
        </button>
        <pre id="admin-sql-output" style="margin:0">insert into public.users (auth_uid, username, display_name, email, role, active)
values ('&lt;UUID&gt;'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);</pre>
      </div>

      <div class="wizard-alert wizard-alert-info" style="margin-top:0.75rem">
        <span class="wizard-alert-icon">${ICONS.info}</span>
        <div>
          Pega este SQL en el <strong>SQL Editor</strong> y haz click en <strong>Run</strong>.
          Debes ver <strong>"Success. No rows returned"</strong>.
        </div>
      </div>
    </div>

    <div class="wizard-alert wizard alert-warning">
      <span class="wizard-alert-icon">${ICONS.alert}</span>
      <div>
        <strong>Si te aparece "permission denied for table public.users":</strong>
        Es que todavía no ejecutaste <code>policies.sql</code> en el paso 3. Vuelve atrás,
        ejecútalo y regresa aquí.
      </div>
    </div>
  `;
}

function renderCredentialsStep() {
  const stored = getStoredSupabaseConfig();
  const urlVal = stored?.url || "";
  const keyVal = stored?.anonKey || "";

  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 5 de 7</p>
      <h2 class="wizard-step-title">Pegar las credenciales de Supabase</h2>
      <p class="wizard-step-description">
        Ahora vamos a conectar la app con tu proyecto Supabase. Necesitas dos valores:
        la <strong>URL del proyecto</strong> y la <strong>anon public key</strong>.
      </p>
    </div>

    <div class="wizard-step-hero">
      <div class="wizard-step-hero-icon">${ICONS.key}</div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Dónde encontrar las credenciales</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>En el sidebar de Supabase, haz click en <strong>"Project Settings"</strong> (icono de engranaje, abajo del todo).</li>
          <li>Haz click en <strong>"API"</strong>.</li>
          <li>Copia estos dos valores:
            <ul style="margin:0.5rem 0 0 1.5rem; padding:0; list-style: disc; font-size: 0.8125rem; line-height: 1.6;">
              <li><strong>Project URL</strong> — algo como <code>https://abcdefgh.supabase.co</code></li>
              <li><strong>Project API keys → anon public</strong> — un JWT largo que empieza con <code>eyJ</code></li>
            </ul>
          </li>
        </ol>
        <div class="wizard-alert wizard-alert-warning" style="margin-top:0.75rem">
          <span class="wizard-alert-icon">${ICONS.alert}</span>
          <div>
            <strong>No uses</strong> la <code>service_role</code> key — esa es privada y da acceso
            total a tu base de datos. Solo usamos la <code>anon public</code>, que es segura
            para el frontend (respeta las políticas RLS).
          </div>
        </div>
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Pegar credenciales aquí</h3>
      <div class="wizard-card-body">
        <p>Estas credenciales se guardan <strong>solo en este navegador</strong> (localStorage).
        No se envían a ningún servidor excepto a Supabase.</p>
      </div>

      <div class="wizard-form-group" style="margin-top:1rem">
        <label class="wizard-form-label" for="supabase-url-input">Project URL</label>
        <input type="url" id="supabase-url-input" class="wizard-form-input" placeholder="https://abcdefgh.supabase.co" value="${urlVal.replace(/"/g, "&quot;")}" autocomplete="off" spellcheck="false" />
        <p class="wizard-form-hint">Encuéntrala en Project Settings → API → "Project URL"</p>
      </div>

      <div class="wizard-form-group" style="margin-top:0.75rem">
        <label class="wizard-form-label" for="supabase-key-input">anon public key</label>
        <textarea id="supabase-key-input" class="wizard-form-input wizard-textarea" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." spellcheck="false" autocomplete="off">${keyVal.replace(/</g, "&lt;")}</textarea>
        <p class="wizard-form-hint">Es un string largo que empieza con "eyJ". NO uses la service_role key.</p>
      </div>

      <div class="wizard-alert wizard alert-info" id="creds-validation" style="display:none; margin-top:0.75rem"></div>

      <div style="display:flex; gap:0.5rem; flex-wrap: wrap; margin-top:0.75rem">
        <button class="wizard-btn wizard-btn-primary" id="save-creds-btn">
          ${ICONS.check} <span>Guardar credenciales</span>
        </button>
        <button class="wizard-btn wizard-btn-secondary" id="test-conn-btn">
          ${ICONS.zap} <span>Probar conexión</span>
        </button>
        ${stored ? `<button class="wizard-btn wizard-btn-ghost" id="clear-creds-btn">Borrar</button>` : ""}
      </div>

      <div class="wizard-conn-result" id="conn-result"></div>
    </div>

    <div class="wizard-alert wizard alert-info">
      <span class="wizard-alert-icon">${ICONS.info}</span>
      <div>
        El botón <strong>"Probar conexión"</strong> intenta conectarse a tu Supabase y
        verificar que las tablas <code>products</code>, <code>users</code>, <code>warehouses</code>
        existan. Si todo está verde, estás listo.
      </div>
    </div>
  `;
}

function renderRealtimeStep() {
  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 6 de 7</p>
      <h2 class="wizard-step-title">Habilitar Realtime (opcional pero recomendado)</h2>
      <p class="wizard-step-description">
        Realtime hace que los cambios en la base de datos se reflejen en todos los
        dispositivos en vivo, sin necesidad de recargar. Por ejemplo: si vendes un
        producto en un almacén, el stock se actualiza solo en la pantalla del admin.
      </p>
    </div>

    <div class="wizard-step-hero">
      <div class="wizard-step-hero-icon">${ICONS.zap}</div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Verificar tablas en Realtime</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>En Supabase, ve a <strong>Database → Replication</strong>.</li>
          <li>Busca la publicación <strong>supabase_realtime</strong>.</li>
          <li>Haz click en el botón <strong>"0 tables"</strong> o similar y revisa que las 13 tablas de la app estén marcadas.</li>
        </ol>
        <p>Si falta alguna o no aparece ninguna, ejecuta este SQL en el SQL Editor:</p>
      </div>

      <div class="wizard-code-block">
        <button class="wizard-code-copy" data-copy-target="realtime-sql">
          ${ICONS.copy} <span>Copy</span>
        </button>
        <pre id="realtime-sql" style="margin:0">alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.stock;
alter publication supabase_realtime add table public.stock_movements;
alter publication supabase_realtime add table public.rates;
alter publication supabase_realtime add table public.warehouses;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.subcategories;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.managers;
alter publication supabase_realtime add table public.cards;</pre>
      </div>
    </div>

    <div class="wizard-alert wizard alert-info">
      <span class="wizard-alert-icon">${ICONS.info}</span>
      <div>
        Si al ejecutar el SQL te aparece <strong>"could not add table to publication because it is already a member"</strong>,
        está perfecto — significa que ya estaba agregada. Continúa.
      </div>
    </div>

    <div class="wizard-alert wizard alert-warning">
      <span class="wizard-alert-icon">${ICONS.alert}</span>
      <div>
        <strong>¿Omitir este paso?</strong> Si no lo haces, la app sigue funcionando,
        pero las actualizaciones entre dispositivos no serán en tiempo real — necesitarás
        recargar la página para ver los cambios. Recomendado hacerlo.
      </div>
    </div>
  `;
}

function renderDoneStep() {
  const stored = getStoredSupabaseConfig();
  const url = stored?.url || "—";
  const maskedKey = stored?.anonKey
    ? stored.anonKey.substring(0, 12) + "…" + stored.anonKey.substring(stored.anonKey.length - 8)
    : "—";

  return `
    <div class="wizard-step-header">
      <p class="wizard-step-eyebrow">Paso 7 de 7</p>
      <h2 class="wizard-step-title">¡Todo listo! Verificación final</h2>
      <p class="wizard-step-description">
        Vamos a hacer una verificación final para confirmar que todo está conectado
        correctamente. Después, ya puedes empezar a usar MANNOL POS.
      </p>
    </div>

    <div class="wizard-step-hero">
      <div class="wizard-step-hero-icon">${ICONS.rocket}</div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Tu configuración actual</h3>
      <div class="wizard-summary-grid">
        <div class="wizard-summary-item">
          <span class="wizard-summary-item-label">Project URL</span>
          <span class="wizard-summary-item-value">${url}</span>
        </div>
        <div class="wizard-summary-item">
          <span class="wizard-summary-item-label">anon key</span>
          <span class="wizard-summary-item-value">${maskedKey}</span>
        </div>
        <div class="wizard-summary-item">
          <span class="wizard-summary-item-label">Almacenamiento</span>
          <span class="wizard-summary-item-value">localStorage (este navegador)</span>
        </div>
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Verificación de conexión</h3>
      <div class="wizard-card-body">
        <p>Haz click en "Verificar todo" para confirmar que la app puede conectarse
        a Supabase y leer las tablas correctamente.</p>
      </div>
      <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap">
        <button class="wizard-btn wizard-btn-primary" id="final-verify-btn">
          ${ICONS.zap} <span>Verificar todo</span>
        </button>
      </div>
      <div class="wizard-conn-result" id="final-result"></div>
    </div>

    <div class="wizard-alert wizard alert-success" id="ready-banner" style="display:none">
      <span class="wizard-alert-icon">${ICONS.check}</span>
      <div>
        <strong>¡Todo listo!</strong> Tu MANNOL POS ya está conectado a Supabase.
        Haz click en "Ir a la app" (abajo) para empezar a usarlo. Inicia sesión con
        el email y contraseña del admin que creaste en el paso 4.
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Próximos pasos en la app</h3>
      <div class="wizard-card-body">
        <ol class="wizard-ordered-list">
          <li>En la pantalla de inicio, haz click 3 veces en el logo MANNOL para revelar el botón "Iniciar sesión".</li>
          <li>Inicia sesión con el <strong>email</strong> y <strong>contraseña</strong> del admin que creaste.</li>
          <li>El panel admin se abre automáticamente. Ahí podrás crear almacenes, productos, vendedores y gestores.</li>
          <li>Para configurar tasas automáticas (API elToque), ve a <strong>Tasas</strong> en el panel admin.</li>
        </ol>
      </div>
    </div>

    <div class="wizard-alert wizard alert-info">
      <span class="wizard-alert-icon">${ICONS.info}</span>
      <div>
        <strong>Configuración en otro dispositivo:</strong> Las credenciales se guardan
        solo en este navegador. Si abres la app en otra computadora, tendrás que repetir
        el paso 5 (pegar URL + key). O puedes compartir el archivo <code>js/supabase-config.js</code>
        descargable desde el botón "Descargar archivo .js" (ver abajo).
      </div>
    </div>

    <div class="wizard-card">
      <h3 class="wizard-card-title">Descargar archivo de configuración (opcional)</h3>
      <div class="wizard-card-body">
        <p>Si quieres distribuir la app ya configurada (por ejemplo, en un hosting estático),
        descarga este archivo y ponlo en <code>js/supabase-config.js</code> de tu despliegue.</p>
      </div>
      <div style="margin-top:0.75rem">
        <button class="wizard-btn wizard-btn-secondary" id="download-config-btn">
          ${ICONS.copy} <span>Descargar supabase-config.js</span>
        </button>
      </div>
    </div>
  `;
}

// ===== Step wiring =====
function wireStep(stepId) {
  if (stepId === "run-sql") wireRunSqlStep();
  if (stepId === "create-admin") wireCreateAdminStep();
  if (stepId === "credentials") wireCredentialsStep();
  if (stepId === "done") wireDoneStep();
}

function wireRunSqlStep() {
  // Tabs
  $$("#sql-tabs .wizard-sql-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      activeSqlTab = btn.dataset.sqlTab;
      $$("#sql-tabs .wizard-sql-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.sqlTab === activeSqlTab);
      });
      await loadActiveSqlTab();
    });
  });

  // Copy button
  const copyBtn = $("#sql-copy-btn");
  copyBtn?.addEventListener("click", async () => {
    const text = loadedSql[activeSqlTab] || "";
    const ok = await copyToClipboard(text);
    if (ok) {
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = `${ICONS.check} <span>Copiado</span>`;
      toast(`Copiado ${activeSqlTab} (${text.length} caracteres)`, "success");
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `${ICONS.copy} <span>Copy</span>`;
      }, 2000);
    } else {
      toast("No se pudo copiar al portapapeles", "error");
    }
  });

  loadActiveSqlTab();
}

async function loadActiveSqlTab() {
  const content = $("#sql-code-content");
  const meta = $("#sql-tab-meta");
  const errBox = $("#sql-load-error");
  const errMsg = $("#sql-load-error-msg");
  if (!content) return;

  const fileInfo = SQL_FILES.find((f) => f.name === activeSqlTab);
  if (meta && fileInfo) meta.textContent = `${fileInfo.num}. ${fileInfo.desc}`;

  content.textContent = "Cargando…";
  if (errBox) errBox.style.display = "none";

  try {
    const sql = await fetchSql(activeSqlTab);
    content.textContent = sql;
  } catch (err) {
    content.textContent = "";
    if (errBox && errMsg) {
      errBox.style.display = "flex";
      errMsg.innerHTML = `<strong>Error:</strong> ${err.message}.<br>Asegúrate de servir el proyecto con <code>python3 -m http.server 8080</code> o similar (no abras setup.html con file://).`;
    }
  }
}

function wireCreateAdminStep() {
  const uuidInput = $("#admin-uuid-input");
  const emailInput = $("#admin-email-input");
  const nameInput = $("#admin-name-input");
  const output = $("#admin-sql-output");
  const copyBtn = $("#admin-sql-copy");

  function updateSql() {
    const uuid = (uuidInput?.value || "").trim() || "<UUID>";
    const email = (emailInput?.value || "").trim() || "admin@mannol.cu";
    const name = (nameInput?.value || "").trim() || "Administrador";
    const safeEmail = email.replace(/'/g, "''");
    const safeName = name.replace(/'/g, "''");
    output.textContent = `insert into public.users (auth_uid, username, display_name, email, role, active)
values ('${uuid}'::uuid, 'admin', '${safeName}', '${safeEmail}', 'admin', true);`;
  }

  uuidInput?.addEventListener("input", updateSql);
  emailInput?.addEventListener("input", updateSql);
  nameInput?.addEventListener("input", updateSql);
  updateSql();

  copyBtn?.addEventListener("click", async () => {
    const ok = await copyToClipboard(output.textContent);
    if (ok) {
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = `${ICONS.check} <span>Copiado</span>`;
      toast("SQL copiado al portapapeles", "success");
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `${ICONS.copy} <span>Copy</span>`;
      }, 2000);
    } else {
      toast("No se pudo copiar", "error");
    }
  });
}

function wireCredentialsStep() {
  const urlInput = $("#supabase-url-input");
  const keyInput = $("#supabase-key-input");
  const saveBtn = $("#save-creds-btn");
  const testBtn = $("#test-conn-btn");
  const clearBtn = $("#clear-creds-btn");
  const validation = $("#creds-validation");
  const connResult = $("#conn-result");

  function validate() {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    const urlOk = isValidSupabaseUrl(url);
    const keyOk = isValidAnonKey(key);

    urlInput.classList.toggle("invalid", url !== "" && !urlOk);
    keyInput.classList.toggle("invalid", key !== "" && !keyOk);

    if (!url && !key) {
      validation.style.display = "none";
      return false;
    }
    validation.style.display = "flex";
    if (!urlOk) {
      validation.className = "wizard-alert wizard-alert-danger";
      validation.innerHTML = `<span class="wizard-alert-icon">${ICONS.alert}</span><div><strong>URL inválida.</strong> Debe ser <code>https://algo.supabase.co</code> (sin barra al final).</div>`;
    } else if (!keyOk) {
      validation.className = "wizard-alert wizard-alert-warning";
      validation.innerHTML = `<span class="wizard-alert-icon">${ICONS.alert}</span><div><strong>anon key inválida.</strong> Debe empezar con <code>eyJ</code> y contener 3 partes separadas por puntos.</div>`;
    } else {
      validation.className = "wizard-alert wizard-alert-success";
      validation.innerHTML = `<span class="wizard-alert-icon">${ICONS.check}</span><div><strong>Formato válido.</strong> Ya puedes guardar y probar la conexión.</div>`;
    }
    return urlOk && keyOk;
  }

  urlInput?.addEventListener("input", validate);
  keyInput?.addEventListener("input", validate);
  validate();

  saveBtn?.addEventListener("click", () => {
    if (!validate()) {
      toast("Revisa el formato de las credenciales", "error");
      return;
    }
    const ok = saveStoredSupabaseConfig(urlInput.value.trim(), keyInput.value.trim());
    if (ok) {
      toast("Credenciales guardadas en este navegador", "success");
      saveBtn.innerHTML = `${ICONS.check} <span>Guardado</span>`;
      setTimeout(() => {
        goToStep(currentStepIdx + 1);
      }, 800);
    } else {
      toast("No se pudieron guardar las credenciales", "error");
    }
  });

  testBtn?.addEventListener("click", () => testConnection());

  clearBtn?.addEventListener("click", () => {
    if (confirm("¿Borrar las credenciales guardadas en este navegador?")) {
      clearStoredSupabaseConfig();
      urlInput.value = "";
      keyInput.value = "";
      validate();
      toast("Credenciales borradas", "info");
      // Re-render to remove the Clear button
      setTimeout(() => renderStep(document.getElementById("wizard-app")), 100);
    }
  });

  // Hide conn-result on input change
  urlInput?.addEventListener("input", () => connResult.classList.remove("show"));
  keyInput?.addEventListener("input", () => connResult.classList.remove("show"));
}

async function testConnection() {
  const urlInput = $("#supabase-url-input");
  const keyInput = $("#supabase-key-input");
  const connResult = $("#conn-result") || $("#final-result");

  const url = (urlInput?.value || getStoredSupabaseConfig()?.url || "").trim();
  const key = (keyInput?.value || getStoredSupabaseConfig()?.anonKey || "").trim();

  if (!isValidSupabaseUrl(url) || !isValidAnonKey(key)) {
    connResult.classList.add("show", "error");
    connResult.classList.remove("success");
    connResult.innerHTML = `
      <p class="wizard-conn-result-title">${ICONS.alert} Credenciales inválidas</p>
      <ul class="wizard-conn-result-list">
        <li class="fail">URL debe ser <code>https://algo.supabase.co</code></li>
        <li class="fail">anon key debe empezar con <code>eyJ</code> y tener 3 partes separadas por puntos</li>
      </ul>
    `;
    return;
  }

  // Save to localStorage first if inputs are present
  if (urlInput && keyInput) {
    saveStoredSupabaseConfig(url, key);
  }

  connResult.classList.add("show");
  connResult.classList.remove("success", "error");
  connResult.innerHTML = `
    <p class="wizard-conn-result-title"><span class="wizard-spinner-inline"></span> Conectando a ${url}…</p>
  `;

  try {
    // Dynamically import supabase-js from CDN (same as js/supabase.js)
    const SUPABASE_VERSION = "2.108.2";
    const { createClient } = await import(`https://esm.sh/@supabase/supabase-js@${SUPABASE_VERSION}`);

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const checks = [];
    const tablesToCheck = ["products", "users", "warehouses", "categories", "sales", "stock"];

    // First: a simple health check by querying a small table
    let healthOk = false;
    let healthErr = null;
    try {
      const { data, error } = await client
        .from("categories")
        .select("id")
        .limit(1);
      if (error) throw error;
      healthOk = true;
      checks.push({ ok: true, label: "Conexión a Supabase OK" });
    } catch (err) {
      healthErr = err.message || String(err);
      checks.push({ ok: false, label: `Conexión: ${healthErr}` });
    }

    if (healthOk) {
      // Check each table
      for (const table of tablesToCheck) {
        try {
          const { error } = await client.from(table).select("id").limit(1);
          if (error) {
            checks.push({ ok: false, label: `Tabla "${table}": ${error.message}` });
          } else {
            checks.push({ ok: true, label: `Tabla "${table}" existe y es accesible` });
          }
        } catch (err) {
          checks.push({ ok: false, label: `Tabla "${table}": ${err.message || err}` });
        }
      }
    }

    const okCount = checks.filter((c) => c.ok).length;
    const allOk = okCount === checks.length && checks.length > 0;

    connResult.classList.add(allOk ? "success" : "error");
    connResult.innerHTML = `
      <p class="wizard-conn-result-title">${allOk ? ICONS.check : ICONS.alert} ${allOk ? "Conexión exitosa" : "Conexión con problemas"}</p>
      <ul class="wizard-conn-result-list">
        ${checks.map((c) => `<li class="${c.ok ? "ok" : "fail"}">${c.label}</li>`).join("")}
      </ul>
      ${allOk ? `<p class="wizard-form-hint" style="margin-top:0.5rem">Todo OK. Puedes continuar al siguiente paso.</p>` : ""}
    `;

    if (allOk) {
      toast("Conexión exitosa", "success");
    } else {
      toast("Hay problemas con la conexión — revisa la lista", "error");
    }
  } catch (err) {
    connResult.classList.add("error");
    connResult.innerHTML = `
      <p class="wizard-conn-result-title">${ICONS.alert} Error al cargar Supabase</p>
      <ul class="wizard-conn-result-list">
        <li class="fail">No se pudo cargar la librería @supabase/supabase-js desde el CDN. Verifica tu conexión a internet.</li>
        <li class="fail">Detalle: ${err.message || err}</li>
      </ul>
    `;
    toast("Error cargando Supabase SDK", "error");
  }
}

function wireRealtimeStep() {
  // Copy button for realtime-sql (uses data-copy-target pattern)
  $$("[data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.copyTarget;
      const target = document.getElementById(targetId);
      if (!target) return;
      const ok = await copyToClipboard(target.textContent);
      if (ok) {
        btn.classList.add("copied");
        btn.innerHTML = `${ICONS.check} <span>Copiado</span>`;
        toast("SQL copiado", "success");
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = `${ICONS.copy} <span>Copy</span>`;
        }, 2000);
      }
    });
  });
}

function wireDoneStep() {
  // Auto-run final verify on mount if we have stored config
  const stored = getStoredSupabaseConfig();
  if (stored) {
    // Don't auto-run, just show the button. User clicks it.
  }

  const verifyBtn = $("#final-verify-btn");
  verifyBtn?.addEventListener("click", async () => {
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `<span class="wizard-spinner-inline"></span> <span>Verificando…</span>`;
    // Reuse testConnection but with stored config
    await testConnection();
    verifyBtn.disabled = false;
    verifyBtn.innerHTML = `${ICONS.zap} <span>Verificar de nuevo</span>`;

    // Show ready banner if all checks passed
    const finalResult = $("#final-result");
    if (finalResult && finalResult.classList.contains("success")) {
      $("#ready-banner").style.display = "flex";
      $("#ready-banner")[0]?.scrollIntoView({ behavior: "smooth" });
      document.getElementById("ready-banner")?.scrollIntoView({ behavior: "smooth" });
      toast("¡Todo listo! Ya puedes usar la app", "success");
    }
  });

  // Download config file
  const dlBtn = $("#download-config-btn");
  dlBtn?.addEventListener("click", () => {
    const stored = getStoredSupabaseConfig();
    if (!stored) {
      toast("Primero guarda las credenciales en el paso 5", "error");
      return;
    }
    const content = `// js/supabase-config.js
// Generated by MANNOL Setup Wizard on ${new Date().toISOString()}
// Place this file at js/supabase-config.js in your deployment.

export const supabaseConfig = {
  url: ${JSON.stringify(stored.url)},
  anonKey: ${JSON.stringify(stored.anonKey)}
};

export const isSupabaseConfigured = true;
`;
    const blob = new Blob([content], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supabase-config.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Archivo descargado — ponlo en js/supabase-config.js", "success");
  });
}
