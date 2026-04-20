/**
 * ============================================================
 *  MAE Wellness Club — Exportador de Usuarios (Admin Tool)
 * ============================================================
 *
 *  PREREQUISITO:
 *    Añade esta línea al archivo .env con tu Service Role Key:
 *    SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
 *
 *    Obtener en: Supabase Dashboard → Settings → API → service_role (secret)
 *    ⚠️  Nunca compartas ni publiques esta clave.
 *
 *  USO:
 *    node export-users.mjs
 *
 *  RESULTADO:
 *    Genera un archivo CSV con nombre: mae_usuarios_YYYY-MM-DD.csv
 *    El archivo se abre automáticamente en Excel (Windows).
 *    Compatible con Google Sheets, LibreOffice, Numbers.
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { exec } from 'child_process';

dotenv.config();

// ─── Configuración ────────────────────────────────────────────
const SUPABASE_URL     = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// ─────────────────────────────────────────────────────────────

// Validar configuración
if (!SUPABASE_URL) {
  console.error('\n❌ ERROR: VITE_SUPABASE_URL no encontrada en .env\n');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.includes('PEGAR_AQUI') || SERVICE_ROLE_KEY.length < 10) {
  console.error('\n❌ ERROR: SUPABASE_SERVICE_ROLE_KEY no configurada correctamente en .env');
  console.error('   Obtener en: Supabase Dashboard → Settings → API → service_role (secret)\n');
  process.exit(1);
}

// Cliente admin (bypass de RLS)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ─── Helpers ──────────────────────────────────────────────────
const fmxDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
};

const fmxDateTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
};

const csvCell = (val) => {
  const str = String(val ?? '');
  // Escapar comillas dobles y envolver en comillas si contiene comas, saltos o comillas
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 MAE Wellness Club — Exportador de Usuarios');
  console.log('━'.repeat(50));

  // ── 1. Obtener perfiles ──────────────────────────────────
  process.stdout.write('  ⏳ Obteniendo perfiles...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, nickname, email_fallback, credits_indoor, credits_train, credits_pilates, credits_open, credits, preferred_discipline, updated_at')
    .order('updated_at', { ascending: false });

  if (profilesError) {
    console.error(`\n❌ Error al obtener perfiles: ${profilesError.message}`);
    process.exit(1);
  }
  console.log(` ✅ ${profiles.length} perfiles`);

  // ── 2. Obtener usuarios de auth (para fecha de registro real) ──
  process.stdout.write('  ⏳ Obteniendo datos de autenticación...');
  let authMap = {};
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      page: 1, perPage: 1000
    });
    if (authError) throw authError;
    (authData.users || []).forEach(u => { authMap[u.id] = u; });
    console.log(` ✅ ${Object.keys(authMap).length} usuarios auth`);
  } catch (e) {
    console.log(` ⚠️  No se pudo obtener auth (${e.message}) — omitiendo fecha de registro`);
  }

  // ── 3. Obtener ledger de créditos (resumen por usuario) ──────
  process.stdout.write('  ⏳ Calculando historial de créditos...');
  const { data: ledger, error: ledgerError } = await supabase
    .from('credit_ledger')
    .select('user_id, transaction_type, amount, credit_type, created_at, notes')
    .order('created_at', { ascending: false });

  if (ledgerError) {
    console.log(` ⚠️  Ledger no disponible: ${ledgerError.message}`);
  }

  // Construir índice de ledger por usuario
  const ledgerByUser = {};
  (ledger || []).forEach(entry => {
    if (!ledgerByUser[entry.user_id]) ledgerByUser[entry.user_id] = [];
    ledgerByUser[entry.user_id].push(entry);
  });
  console.log(` ✅`);

  // ── 4. Construir filas del reporte ───────────────────────────
  const rows = profiles.map(p => {
    const auth        = authMap[p.id] || {};
    const userLedger  = ledgerByUser[p.id] || [];

    const classesTaken = userLedger.filter(e => e.transaction_type === 'class_reservation').length;

    const purchases = userLedger.filter(
      e => ['stripe_webhook', 'manual_admin'].includes(e.transaction_type) && e.amount > 0
    );
    const lastPurchase = purchases.length > 0 ? purchases[0] : null;

    const indoor  = p.credits_indoor  ?? 0;
    const train   = p.credits_train   ?? 0;
    const pilates = p.credits_pilates ?? 0;
    const open    = p.credits_open    ?? 0;
    const total   = p.credits ?? (indoor + train + pilates + open);

    return {
      'Nombre Completo':     p.full_name || '',
      'Apodo / Alias':       p.nickname || '',
      'Email':               p.email_fallback || auth.email || '',
      'Indoor Cycling':      indoor,
      'Train':               train,
      'Pilates':             pilates,
      'VIP / Comodín':       open,
      'Total Créditos':      total,
      'Disciplina Preferida': p.preferred_discipline || '',
      'Clases Tomadas':      classesTaken,
      'Compras Realizadas':  purchases.length,
      'Última Compra':       lastPurchase ? fmxDate(lastPurchase.created_at) : '',
      'Nota Última Compra':  lastPurchase?.notes || '',
      'Fecha Registro':      auth.created_at ? fmxDate(auth.created_at) : '',
      'Último Acceso':       auth.last_sign_in_at ? fmxDateTime(auth.last_sign_in_at) : '',
      'Última Actualización': p.updated_at ? fmxDateTime(p.updated_at) : '',
    };
  });

  // ── 5. Generar CSV ───────────────────────────────────────────
  const headers  = Object.keys(rows[0] || {});
  const BOM      = '\uFEFF'; // UTF-8 BOM para que Excel abra con caracteres correctos
  const csvLines = [
    headers.map(csvCell).join(','),
    ...rows.map(row => headers.map(h => csvCell(row[h])).join(','))
  ];
  const csv = BOM + csvLines.join('\r\n');

  const today    = new Date().toISOString().slice(0, 10);
  const filename = `mae_usuarios_${today}.csv`;
  fs.writeFileSync(filename, csv, 'utf8');

  console.log('\n' + '━'.repeat(50));
  console.log(`✅ Archivo generado: ${filename}`);
  console.log(`   ${rows.length} usuarios exportados`);
  console.log(`   Columnas: ${headers.length}`);

  // ── 6. Imprimir resumen en consola ───────────────────────────
  console.log('\n📊 Resumen de Créditos:');
  const totalIndoor  = rows.reduce((s, r) => s + r['Indoor Cycling'], 0);
  const totalTrain   = rows.reduce((s, r) => s + r['Train'], 0);
  const totalPilates = rows.reduce((s, r) => s + r['Pilates'], 0);
  const totalVIP     = rows.reduce((s, r) => s + r['VIP / Comodín'], 0);
  const totalAll     = rows.reduce((s, r) => s + r['Total Créditos'], 0);
  const usersWithCredits = rows.filter(r => r['Total Créditos'] > 0).length;

  console.log(`   🚲 Indoor Cycling:  ${totalIndoor} créditos`);
  console.log(`   🏋️  Train:           ${totalTrain} créditos`);
  console.log(`   🧘 Pilates:          ${totalPilates} créditos`);
  console.log(`   👑 VIP / Comodín:    ${totalVIP} créditos`);
  console.log(`   💰 Total sistema:    ${totalAll} créditos`);
  console.log(`   👥 Usuarios con saldo: ${usersWithCredits} de ${rows.length}`);

  // ── 7. Abrir automáticamente en Windows ──────────────────────
  console.log(`\n📂 Abriendo ${filename} en Excel...`);
  exec(`start "" "${filename}"`, (err) => {
    if (err) {
      console.log(`   (Abrir manualmente: el archivo está en la carpeta del proyecto)`);
    }
  });

  console.log('');
}

main().catch(err => {
  console.error(`\n❌ Error fatal: ${err.message}`);
  process.exit(1);
});
