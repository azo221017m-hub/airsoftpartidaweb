/**
 * launch.js — Pantalla de lanzamiento ATC
 * ─────────────────────────────────────────
 * MUESTRA la pantalla si:
 *   • Fecha CDMX >= 21/03/2026
 *   • Hora CDMX < 12:00 p.m. (PRUEBA — cambiar a 22:00 para producción)
 *
 * OCULTA y nunca vuelve a mostrar si:
 *   • Hora CDMX >= 22:01 (lanzamiento ya ocurrió)
 *
 * El contador regresivo apunta a las 12:00 p.m. CDMX del 21/03/2026 (PRUEBA).
 * En producción cambiar EXPIRE_HOUR/EXPIRE_MINUTE a 22 y 1, y
 * TARGET_HOUR/TARGET_MINUTE a 22 y 0.
 */

const CDMX_OFFSET = -6; // UTC-6

// ── Hora objetivo del contador (lo que el contador cuenta hacia abajo) ──
const TARGET_HOUR   = 12; // PRUEBA: mediodía   → producción: 22
const TARGET_MINUTE = 0;

// ── Hora de expiración definitiva (pantalla desaparece para siempre) ──
const EXPIRE_HOUR   = 12; // 12:01 CDMX — nunca más se muestra
const EXPIRE_MINUTE = 1;

// ── Fecha de inicio (la pantalla solo aparece desde este día) ──
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
const EXPIRE_MS = launchMs(EXPIRE_HOUR, EXPIRE_MINUTE);

// ── Lógica principal ─────────────────────────────────────────
export function initLaunchScreen() {
  const screen = document.getElementById('launch-screen');
  const elH    = document.getElementById('lc-h');
  const elM    = document.getElementById('lc-m');
  const elS    = document.getElementById('lc-s');

  if (!screen || !elH || !elM || !elS) return;

  const cdmx    = nowCDMX();
  const nowMs   = Date.now();

  // Fecha CDMX como número YYYYMMDD
  const todayNum  = cdmx.getUTCFullYear() * 10000
                  + (cdmx.getUTCMonth() + 1) * 100
                  + cdmx.getUTCDate();
  const launchNum = LAUNCH_YEAR * 10000 + LAUNCH_MONTH * 100 + LAUNCH_DAY;

  // ── ¿Ya venció definitivamente? (>= 22:01 CDMX) ──────────
  // Si sí → nunca mostrar, borrar del DOM para no ocupar nada
  if (nowMs >= EXPIRE_MS) {
    screen.remove();
    return;
  }

  // ── ¿Fecha válida Y antes del target? ────────────────────
  const dateOk     = todayNum >= launchNum;
  const beforeTime = nowMs < TARGET_MS;

  if (!dateOk || !beforeTime) {
    // Fuera del rango de muestra (demasiado pronto o ya pasó el target
    // pero aún no las 22:01) → no mostrar
    return;
  }

  // ── Mostrar pantalla ──────────────────────────────────────
  screen.style.display = 'flex';

  // ── Ticker cada segundo ───────────────────────────────────
  function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

  function hideLaunch() {
    screen.style.transition = 'opacity 1.4s ease';
    screen.style.opacity    = '0';
    setTimeout(() => screen.remove(), 1500); // quita del DOM definitivamente
  }

  function tick() {
    const nowNow    = Date.now();

    // Si ya pasó la expiración definitiva → fuera
    if (nowNow >= EXPIRE_MS) {
      hideLaunch();
      return;
    }

    const remaining = TARGET_MS - nowNow;

    if (remaining <= 0) {
      // El contador llegó a 0 → pantalla de lanzamiento cumplió su función
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
