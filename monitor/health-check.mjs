#!/usr/bin/env node
/**
 * health-check.mjs
 * MAE Wellness Club — Monitor de disponibilidad
 *
 * Verifica:
 *  1. Que el sitio principal responda con HTTP 200
 *  2. Que la API de Supabase (Auth) responda correctamente
 *  3. Que la Edge Function stripe-webhook esté activa
 *
 * En caso de fallo envía una notificación vía Telegram.
 * Diseñado para ejecutarse como cron cada 5 minutos.
 *
 * Uso: node health-check.mjs
 * Requiere variables de entorno en .env o en el shell.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// ── Cargar .env manualmente (sin dependencias) ─────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, "../.env");

try {
  const envRaw = readFileSync(envPath, "utf-8");
  for (const line of envRaw.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*?)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // .env no encontrado — continuar con variables del sistema
}

// ── Configuración ──────────────────────────────────────────────────────────
const CONFIG = {
  site:           "https://maewellnessclub.com.mx",
  supabaseUrl:    process.env.VITE_SUPABASE_URL,
  supabaseAnon:   process.env.VITE_SUPABASE_ANON_KEY,
  telegramToken:  process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  timeoutMs:      8000,
};

// ── Utilidades ─────────────────────────────────────────────────────────────
const timestamp = () => new Date().toISOString();

async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function sendTelegramAlert(message) {
  if (!CONFIG.telegramToken || !CONFIG.telegramChatId) {
    console.warn("[Monitor] Sin config Telegram — alerta no enviada.");
    return;
  }
  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${CONFIG.telegramToken}/sendMessage`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          chat_id:    CONFIG.telegramChatId,
          text:       message,
          parse_mode: "Markdown",
        }),
      }
    );
    console.log("[Monitor] Alerta Telegram enviada.");
  } catch (err) {
    console.error("[Monitor] Error enviando alerta Telegram:", err.message);
  }
}

// ── Checks individuales ────────────────────────────────────────────────────

async function checkSite() {
  const label = "Sitio principal";
  try {
    const res = await fetchWithTimeout(CONFIG.site);
    if (res.ok) {
      console.log(`✅ [${label}] HTTP ${res.status}`);
      return { ok: true, label };
    }
    console.error(`❌ [${label}] HTTP ${res.status}`);
    return { ok: false, label, detail: `HTTP ${res.status}` };
  } catch (err) {
    console.error(`❌ [${label}] ${err.message}`);
    return { ok: false, label, detail: err.message };
  }
}

async function checkSupabaseAuth() {
  const label = "Supabase Auth";
  if (!CONFIG.supabaseUrl) return { ok: false, label, detail: "VITE_SUPABASE_URL no configurado" };
  try {
    const url = `${CONFIG.supabaseUrl}/auth/v1/settings`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "apikey":        CONFIG.supabaseAnon || "",
        "Authorization": `Bearer ${CONFIG.supabaseAnon || ""}`,
      },
    });
    if (res.ok) {
      console.log(`✅ [${label}] HTTP ${res.status}`);
      return { ok: true, label };
    }
    console.error(`❌ [${label}] HTTP ${res.status}`);
    return { ok: false, label, detail: `HTTP ${res.status}` };
  } catch (err) {
    console.error(`❌ [${label}] ${err.message}`);
    return { ok: false, label, detail: err.message };
  }
}

async function checkSupabaseDB() {
  const label = "Supabase DB (REST)";
  if (!CONFIG.supabaseUrl) return { ok: false, label, detail: "VITE_SUPABASE_URL no configurado" };
  try {
    // Ping ligero: lista de clases (sin auth, solo verifica que PostgREST responde)
    const url = `${CONFIG.supabaseUrl}/rest/v1/classes?select=id&limit=1`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "apikey":        CONFIG.supabaseAnon || "",
        "Authorization": `Bearer ${CONFIG.supabaseAnon || ""}`,
      },
    });
    // 200 o 401 (sin auth) son ambos señal de que la DB responde
    if (res.status === 200 || res.status === 401) {
      console.log(`✅ [${label}] HTTP ${res.status} (PostgREST activo)`);
      return { ok: true, label };
    }
    console.error(`❌ [${label}] HTTP ${res.status}`);
    return { ok: false, label, detail: `HTTP ${res.status}` };
  } catch (err) {
    console.error(`❌ [${label}] ${err.message}`);
    return { ok: false, label, detail: err.message };
  }
}

async function checkBusinessHealth() {
  const label = "Negocio / Consistencia DB";
  if (!CONFIG.supabaseUrl) return { ok: false, label, detail: "VITE_SUPABASE_URL no configurado" };
  try {
    const url = `${CONFIG.supabaseUrl}/rest/v1/rpc/check_business_health`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "apikey":        CONFIG.supabaseAnon || "",
        "Authorization": `Bearer ${CONFIG.supabaseAnon || ""}`,
        "Content-Type":  "application/json",
      },
    });
    
    if (!res.ok) {
      return { ok: false, label, detail: `Error HTTP ${res.status} al consultar RPC` };
    }
    
    const data = await res.json();
    const anomalies = [];
    
    if (data.negative_credits_count > 0) {
      anomalies.push(`Saldos negativos: ${data.negative_credits_count} usuario(s)`);
    }
    if (data.overflow_classes_count > 0) {
      anomalies.push(`Clases sobrevendidas: ${data.overflow_classes_count} clase(s)`);
    }
    if (data.failed_webhooks_count > 0) {
      anomalies.push(`Pagos Stripe fallidos: ${data.failed_webhooks_count} evento(s)`);
    }
    if (data.orphan_reservations_count > 0) {
      anomalies.push(`Reservas huérfanas: ${data.orphan_reservations_count} reserva(s)`);
    }
    if (data.unswept_expired_credits_count > 0) {
      anomalies.push(`Créditos expirados sin barrer: ${data.unswept_expired_credits_count} usuario(s)`);
    }
    if (data.webhook_last_received_hours > 168) {
      anomalies.push(`Inactividad webhook Stripe: ${data.webhook_last_received_hours} horas sin recibir eventos`);
    }
    
    if (anomalies.length > 0) {
      console.warn(`⚠️ [${label}] Inconsistencias detectadas:\n  - ${anomalies.join('\n  - ')}`);
      return { ok: false, label, detail: anomalies.join('; ') };
    }
    
    console.log(`✅ [${label}] Sin anomalías de negocio`);
    return { ok: true, label };
  } catch (err) {
    console.error(`❌ [${label}] ${err.message}`);
    return { ok: false, label, detail: err.message };
  }
}

// ── Runner principal ───────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 [${timestamp()}] Iniciando health check MAE Wellness Club...`);

  const results = await Promise.all([
    checkSite(),
    checkSupabaseAuth(),
    checkSupabaseDB(),
    checkBusinessHealth(),
  ]);

  const failures = results.filter(r => !r.ok);

  if (failures.length === 0) {
    console.log(`\n🟢 Todos los servicios operando correctamente.\n`);
    process.exit(0);
  }

  // Hay fallos — construir alerta
  const failList = failures
    .map(f => `• *${f.label}*: ${f.detail}`)
    .join("\n");

  const alert = `🚨 *MAE Wellness Club — Alerta de disponibilidad*

Los siguientes servicios están fallando:
${failList}

🕐 Detectado: ${timestamp()}
🌐 Sitio: https://maewellnessclub.com.mx`;

  console.error(`\n🔴 FALLOS DETECTADOS:\n${failList}\n`);

  await sendTelegramAlert(alert);
  process.exit(1);
}

main().catch(err => {
  console.error("Error crítico en health-check:", err);
  process.exit(2);
});
