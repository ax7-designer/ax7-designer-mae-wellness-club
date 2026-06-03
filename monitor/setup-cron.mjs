#!/usr/bin/env node
/**
 * setup-cron.mjs
 * MAE Wellness Club — Configura el cronjob de health check
 *
 * Agrega (si no existe) una línea al crontab del usuario actual para
 * ejecutar health-check.mjs cada 5 minutos y guardar el log en:
 *   <project>/monitor/logs/health.log
 *
 * Uso (una sola vez desde PowerShell / CMD):
 *   node monitor/setup-cron.mjs
 *
 * NOTA: En Windows se usa el Programador de Tareas (schtasks) en lugar
 * de cron. Este script lo configura automáticamente.
 */

import { execSync, spawnSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, "health-check.mjs");
const logDir     = path.resolve(__dirname, "logs");
const logFile    = path.join(logDir, "health.log");
const taskName   = "MAE_HealthCheck";

if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
  console.log(`📁 Directorio de logs creado: ${logDir}`);
}

const platform = os.platform();

if (platform === "win32") {
  // ── Windows: Programador de Tareas ──────────────────────────────────────
  console.log("🪟 Configurando tarea en Windows Task Scheduler...\n");

  const nodeExe  = process.execPath;           // ruta a node.exe
  const cmd      = `"${nodeExe}" "${scriptPath}" >> "${logFile}" 2>&1`;
  const xmlTask  = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <Repetition>
        <Interval>PT5M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2025-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT2M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
  </Settings>
  <Actions>
    <Exec>
      <Command>${nodeExe}</Command>
      <Arguments>"${scriptPath}" >> "${logFile}" 2>&amp;1</Arguments>
    </Exec>
  </Actions>
</Task>`;

  const tmpXml = path.join(os.tmpdir(), `${taskName}.xml`);

  try {
    // Escribir XML temporal
    import("fs").then(fs => {
      fs.writeFileSync(tmpXml, xmlTask, "utf16le");
    });

    // Eliminar tarea previa si existe
    try {
      execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: "pipe" });
      console.log("🗑️  Tarea anterior eliminada.");
    } catch { /* no existía */ }

    // Registrar nueva tarea
    execSync(`schtasks /Create /XML "${tmpXml}" /TN "${taskName}"`, { stdio: "inherit" });
    console.log(`\n✅ Tarea "${taskName}" registrada exitosamente.`);
    console.log(`   Se ejecuta cada 5 minutos.`);
    console.log(`   Log en: ${logFile}\n`);

  } catch (err) {
    console.error("❌ Error configurando la tarea:", err.message);
    console.log("\n⚠️  Intenta ejecutar este script como Administrador.");
    process.exit(1);
  }

} else {
  // ── Linux / macOS: crontab ───────────────────────────────────────────────
  console.log("🐧 Configurando crontab...\n");

  const nodeExe  = process.execPath;
  const cronLine = `*/5 * * * * "${nodeExe}" "${scriptPath}" >> "${logFile}" 2>&1`;

  let existing = "";
  try {
    existing = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
  } catch { /* sin crontab previo */ }

  if (existing.includes(scriptPath)) {
    console.log(`ℹ️  El cronjob ya existe en crontab. No se modificó.`);
    process.exit(0);
  }

  const newCrontab = existing.trimEnd() + "\n" + cronLine + "\n";
  const result = spawnSync("crontab", ["-"], {
    input:    newCrontab,
    encoding: "utf-8",
    stdio:    ["pipe", "inherit", "inherit"],
  });

  if (result.status === 0) {
    console.log(`✅ Cronjob agregado exitosamente.`);
    console.log(`   Corre: ${cronLine}`);
    console.log(`   Log en: ${logFile}\n`);
  } else {
    console.error("❌ Error configurando crontab.");
    process.exit(1);
  }
}
