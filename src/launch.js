/**
 * launch.js — Pantalla de lanzamiento ATC
 * ─────────────────────────────────────────
 * Muestra la pantalla si:
 *   • La fecha es >= 21/03/2026
 *   • La hora CDMX es < 22:00 hrs  (UTC-6)
 *
 * Muestra un contador regresivo hacia las 22:00 CDMX del 21/03/2026.
 * Cuando el contador llega a 0 oculta la pantalla automáticamente.
 */

// ── Configuración de lanzamiento ────────────────────────────
const LAUNCH_YEAR   = 2026;
const LAUNCH_MONTH  = 3;          // marzo (1-indexado)
const LAUNCH_DAY    = 21;
const LAUNCH_HOUR   = 22;         // 22:00 CDMX
const LAUNCH_MINUTE = 0;
const CDMX_OFFSET   = -6;         // UTC-6 (sin horario de verano)

// ── Obtener hora actual en CDMX ──────────────────────────────
function nowCDMX() {
  const utc = Date.now();
  return new Date(utc + CDMX_OFFSET * 3600 * 1000);
}

// ── Instante objetivo: 21/03/2026 22:00:00 CDMX (en ms UTC) ──
const TARGET_MS = Date.UTC(LAUNCH_YEAR, LAUNCH_MONTH - 1, LAUNCH_DAY,
                            LAUNCH_HOUR - CDMX_OFFSET, LAUNCH_MINUTE, 0);

// ── Lógica principal ─────────────────────────────────────────
export function initLaunchScreen() {
  const screen  = document.getElementById('launch-screen');
  const elH     = document.getElementById('lc-h');
  const elM     = document.getElementById('lc-m');
  const elS     = document.getElementById('lc-s');

  if (!screen || !elH || !elM || !elS) return;

  const cdmx   = nowCDMX();
  const nowMs  = Date.now();

  // ── ¿Aplica mostrar la pantalla? ─────────────────────────
  // Condición: fecha CDMX >= 21/03/2026  Y  aún no son las 22:00 CDMX
  const cdmxYear  = cdmx.getUTCFullYear();
  const cdmxMonth = cdmx.getUTCMonth() + 1;
  const cdmxDay   = cdmx.getUTCDate();
  const cdmxHour  = cdmx.getUTCHours();
  const cdmxMin   = cdmx.getUTCMinutes();

  // Fecha de lanzamiento como número comparable: YYYYMMDD
  const todayNum    = cdmxYear * 10000 + cdmxMonth * 100 + cdmxDay;
  const launchNum   = LAUNCH_YEAR * 10000 + LAUNCH_MONTH * 100 + LAUNCH_DAY;

  const dateOk      = todayNum >= launchNum;
  const beforeTime  = nowMs < TARGET_MS;

  if (!dateOk || !beforeTime) {
    // No hay nada que mostrar — pantalla permanece oculta
    return;
  }

  // ── Mostrar pantalla ──────────────────────────────────────
  screen.style.display = 'flex';

  // ── Ticker cada segundo ───────────────────────────────────
  function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

  function tick() {
    const remaining = TARGET_MS - Date.now();

    if (remaining <= 0) {
      // ¡Lanzamiento! Ocultar pantalla con fade
      screen.style.transition = 'opacity 1.2s ease';
      screen.style.opacity    = '0';
      setTimeout(() => { screen.style.display = 'none'; }, 1300);
      return;
    }

    const totalSec = Math.floor(remaining / 1000);
    const h  = Math.floor(totalSec / 3600);
    const m  = Math.floor((totalSec % 3600) / 60);
    const s  = totalSec % 60;

    elH.textContent = pad(h);
    elM.textContent = pad(m);
    elS.textContent = pad(s);

    setTimeout(tick, 1000);
  }

  tick();
}
