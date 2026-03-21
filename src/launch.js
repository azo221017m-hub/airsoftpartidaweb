/**
 * launch.js — Pantalla de lanzamiento ATC
 * ─────────────────────────────────────────
 * MUESTRA la pantalla si:
 *   • Fecha CDMX >= 21/03/2026
 *   • Hora CDMX < 22:00 p.m.
 *
 * OCULTA cuando el contador llega a cero (hora objetivo alcanzada).
 */

const CDMX_OFFSET = -6; // UTC-6

// ── Hora objetivo del contador ────────────────────────────────
const TARGET_HOUR   = 22;
const TARGET_MINUTE = 0;

// ── Fecha de inicio ───────────────────────────────────────────
const LAUNCH_YEAR  = 2026;
const LAUNCH_MONTH = 3;
const LAUNCH_DAY   = 21;

// ── Obtener Date ajustado a CDMX ─────────────────────────────
function nowCDMX() {
  return new Date(Date.now() + CDMX_OFFSET * 3600 * 1000);
}

// ── Construir ms UTC para una hora CDMX en la fecha de lanzamiento ──
function launchMs(hour, minute) {
  return Date.UTC(
    LAUNCH_YEAR, LAUNCH_MONTH - 1, LAUNCH_DAY,
    hour - CDMX_OFFSET, minute, 0
  );
}

const TARGET_MS = launchMs(TARGET_HOUR, TARGET_MINUTE);

// ── Lógica principal ─────────────────────────────────────────
export function initLaunchScreen() {
  const screen = document.getElementById('launch-screen');
  const elH    = document.getElementById('lc-h');
  const elM    = document.getElementById('lc-m');
  const elS    = document.getElementById('lc-s');

  if (!screen || !elH || !elM || !elS) return;

  const cdmx  = nowCDMX();
  const nowMs = Date.now();

  // Fecha CDMX como número YYYYMMDD
  const todayNum  = cdmx.getUTCFullYear() * 10000
                  + (cdmx.getUTCMonth() + 1) * 100
                  + cdmx.getUTCDate();
  const launchNum = LAUNCH_YEAR * 10000 + LAUNCH_MONTH * 100 + LAUNCH_DAY;

  // ── ¿Fecha válida Y antes del target? ────────────────────
  const dateOk     = todayNum >= launchNum;
  const beforeTime = nowMs < TARGET_MS;

  if (!dateOk || !beforeTime) return;

  // ── Mostrar pantalla ──────────────────────────────────────
  screen.style.display = 'flex';

  // ── Helpers ───────────────────────────────────────────────
  function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

  function hideLaunch() {
    screen.style.transition = 'opacity 1.4s ease';
    screen.style.opacity    = '0';
    setTimeout(() => screen.remove(), 1500);
  }

  // ── Ticker cada segundo ───────────────────────────────────
  function tick() {
    const remaining = TARGET_MS - Date.now();
    if (remaining <= 0) {
      hideLaunch();
      return;
    }

    const totalSec = Math.floor(remaining / 1000);
    elH.textContent = pad(Math.floor(totalSec / 3600));
    elM.textContent = pad(Math.floor((totalSec % 3600) / 60));
    elS.textContent = pad(totalSec % 60);

    setTimeout(tick, 1000);
  }

  tick();
}
