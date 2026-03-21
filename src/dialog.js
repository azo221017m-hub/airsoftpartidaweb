/**
 * dialog.js — Sistema de diálogo estilo arcade RPG
 * ──────────────────────────────────────────────────
 * Cada línea puede tener:
 *   name   : string           — Nombre del personaje
 *   text   : string           — Texto del diálogo
 *   img    : string           — URL de imagen (opcional)
 *   emoji  : string           — Emoji como avatar (si no hay img)
 *   side   : 'left'|'right'   — Posición del personaje
 *   theme  : 'alpha'|'bravo'|'neutral'
 */

import { startDialogMusic, stopDialogMusic } from './sounds.js';

// ── Referencias DOM ──────────────────────────────────────────
const overlay   = () => document.getElementById('dialog-overlay');
const textEl    = () => document.getElementById('dialog-text');
const nameEl    = () => document.getElementById('dialog-char-name');
const dotsEl    = () => document.getElementById('dialog-dots');
const charImg   = () => document.getElementById('dialog-char-img');
const charEmoji = () => document.getElementById('dialog-char-emoji');
const dialogBox = () => document.getElementById('dialog-box-inner');

// ── Estado interno ───────────────────────────────────────────
let _lines       = [];
let _index       = 0;
let _typing      = false;
let _stopTyping  = null;
let _onClose     = null;
let _initialized = false;

// ── Persistencia "Omitir intro" ──────────────────────────────
const LS_SEEN_KEY = 'atc_intro_seen';    // el usuario completó el intro
const LS_SKIP_KEY = 'atc_intro_skip';    // el usuario activó "omitir"

function _introSeen()    { return localStorage.getItem(LS_SEEN_KEY) === '1'; }
function _introSkip()    { return localStorage.getItem(LS_SKIP_KEY) === '1'; }
function _markIntroSeen(){ localStorage.setItem(LS_SEEN_KEY, '1'); }

function _syncSkipLabel() {
  const label = document.getElementById('dialog-skip-label');
  const check = document.getElementById('dialog-skip-check');
  if (!label || !check) return;
  // Solo visible si el intro ya fue visto al menos una vez
  if (_introSeen()) {
    label.style.display = 'flex';
    check.checked = _introSkip();
  } else {
    label.style.display = 'none';
  }
}

function _bindSkipCheck() {
  const check = document.getElementById('dialog-skip-check');
  if (!check || check.dataset.bound) return;
  check.dataset.bound = '1';
  check.addEventListener('change', () => {
    localStorage.setItem(LS_SKIP_KEY, check.checked ? '1' : '0');
  });
}

// ── Typewriter ───────────────────────────────────────────────
const TYPEWRITER_SPEED = 26;

function typeWrite(el, text, onDone) {
  let i = 0;
  let buf = '';
  el.textContent = '';
  _typing = true;

  let cancelled = false;
  _stopTyping = () => {
    cancelled = true;
    el.textContent = text;
    _typing = false;
    if (onDone) onDone();
  };

  function tick() {
    if (cancelled) return;
    if (i < text.length) {
      buf += text[i++];
      el.textContent = buf;   // escribe el buffer completo (no concatena en el DOM)
      setTimeout(tick, TYPEWRITER_SPEED);
    } else {
      _typing = false;
      _stopTyping = null;
      if (onDone) onDone();
    }
  }
  tick();
}

// ── Dots de progreso ─────────────────────────────────────────
function renderDots(total, active) {
  const el = dotsEl();
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'dialog-dot' + (i === active ? ' active' : '');
    el.appendChild(d);
  }
}

// ── Aplicar tema de color por línea ──────────────────────────
function applyTheme(ov, theme) {
  ov.classList.remove('dialog-bravo', 'dialog-neutral');
  if (theme === 'bravo')   ov.classList.add('dialog-bravo');
  if (theme === 'neutral') ov.classList.add('dialog-neutral');
}

// ── Aplicar posición del personaje ───────────────────────────
function applySide(box, side) {
  if (!box) return;
  box.classList.remove('dialog-side-right');
  if (side === 'right') box.classList.add('dialog-side-right');
}

// ── Inyectar / quitar botón CTA en la burbuja ────────────────
function _renderCTA(line) {
  // Elimina cualquier botón previo
  const prev = document.getElementById('dialog-cta-btn');
  if (prev) prev.remove();

  if (!line.ctaButton) return;

  const btn = document.createElement('a');
  btn.id        = 'dialog-cta-btn';
  btn.href      = line.ctaButton.url;
  btn.target    = '_blank';
  btn.rel       = 'noopener noreferrer';
  btn.className = 'dialog-cta-btn';
  btn.textContent = line.ctaButton.label;

  // Insertar después del texto, dentro de la burbuja
  const bubble = document.querySelector('.dialog-bubble');
  if (bubble) bubble.appendChild(btn);
}

// ── Mostrar línea ─────────────────────────────────────────────
function showLine(index) {
  const line = _lines[index];
  if (!line) return;

  const ov  = overlay();
  const box = dialogBox();
  const ci  = charImg();
  const ce  = charEmoji();
  const ne  = nameEl();

  // Nombre
  if (ne) ne.textContent = line.name || 'OPERADOR';

  // Avatar: imagen o emoji
  if (line.img) {
    if (ci) { ci.src = line.img; ci.style.display = 'block'; }
    if (ce) ce.style.display = 'none';
  } else if (line.emoji) {
    if (ci) ci.style.display = 'none';
    if (ce) { ce.textContent = line.emoji; ce.style.display = 'flex'; }
  } else {
    if (ci) { ci.src = '/spectrumTexcoco.png'; ci.style.display = 'block'; }
    if (ce) ce.style.display = 'none';
  }

  // Tema y posición por línea
  applyTheme(ov, line.theme || 'alpha');
  applySide(box, line.side || 'left');

  // Dots
  renderDots(_lines.length, index);

  // CTA button (ej: WhatsApp)
  _renderCTA(line);

  // Typewriter
  typeWrite(textEl(), line.text, null);
}

// ── API pública ───────────────────────────────────────────────

/**
 * Muestra una secuencia de diálogos.
 * @param {Array<{name,text,img?,emoji?,side?,theme?}>} lines
 * @param {{ onClose?: Function }} [opts]
 */
export function showDialog(lines, opts = {}) {
  if (!lines || lines.length === 0) return;

  _lines   = lines;
  _index   = 0;
  _onClose = opts.onClose || null;

  const ov = overlay();
  if (!ov) return;

  ov.style.display = 'flex';
  startDialogMusic();

  if (!_initialized) {
    _bindEvents();
    _initialized = true;
  }

  _bindSkipCheck();
  _syncSkipLabel();

  showLine(0);
}

/**
 * Cierra el diálogo inmediatamente.
 */
export function closeDialog() {
  const ov = overlay();
  if (ov) ov.style.display = 'none';
  if (_stopTyping) { _stopTyping(); _stopTyping = null; }
  _lines = [];
  _index = 0;
  _typing = false;
  stopDialogMusic();
  // Limpia botón CTA si quedó
  const cta = document.getElementById('dialog-cta-btn');
  if (cta) cta.remove();
  if (_onClose) { _onClose(); _onClose = null; }
}

/**
 * Avanza al siguiente texto, o muestra el completo si está escribiendo.
 */
export function nextDialog() {
  if (_typing && _stopTyping) {
    _stopTyping();
    return;
  }
  _index++;
  if (_index < _lines.length) {
    showLine(_index);
  } else {
    // Llegó al final — marcar intro como visto y sincronizar label
    _markIntroSeen();
    _syncSkipLabel();
    closeDialog();
  }
}

// ── Eventos ──────────────────────────────────────────────────
function _bindEvents() {
  overlay().addEventListener('click', () => nextDialog());

  document.addEventListener('keydown', (e) => {
    const ov = overlay();
    if (!ov || ov.style.display === 'none') return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      nextDialog();
    }
    if (e.code === 'Escape') closeDialog();
  });
}

// ════════════════════════════════════════════════════════════
//  HISTORIA — TEMPORADA 1 / DÍA 0
//  "INMORTALES EN EL TABLERO"
// ════════════════════════════════════════════════════════════
export function demoDialog() {
  // Si el usuario ya vio el intro y tiene "Omitir intro" activado, no mostrar
  if (_introSeen() && _introSkip()) return;

  showDialog([

    // ── INTRO ────────────────────────────────────────────
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  'SISTEMA DE COMBATE INICIADO\nBienvenido, Operador. El tablero de batalla te espera.\nTemporada 1 — DIA 0.',
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'neutral',
      text:  'Mision: Dos unidades elite se enfrentan en el tablero.\nSolo una puede quedar en pie.\nElije tu equipo y entra al combate.',
    },

    // ── LIDER MONTANA ────────────────────────────────────
    {
      name:  'OCELOT — Lider Unidad Montana',
      img:   '/avatar-ocelot.svg',
      side:  'left',
      theme: 'alpha',
      text:  'Soy OCELOT, lider de la Unidad Montana.\nOpero en terreno abierto. Mis hombres son rapidos y precisos.\nHabilidad: Vision tactica — veo las debilidades del enemigo.',
    },
    {
      name:  'OCELOT — Lider Unidad Montana',
      img:   '/avatar-ocelot.svg',
      side:  'left',
      theme: 'alpha',
      text:  'UNIDAD MONTANA — EQUIPO ALPHA\n  Explorador: movimiento 4, rapido y silencioso\n  Artilleria: PS alto, resiste impactos\n  Francotirador: alcance 9, letal a distancia',
    },

    // ── LIDER ASALTO ─────────────────────────────────────
    {
      name:  'FINER — Lider Unidad Asalto',
      img:   '/avatar-finer.svg',
      side:  'right',
      theme: 'bravo',
      text:  'Soy FINER, lider de la Unidad Asalto.\nAtaco rapido, sin piedad, sin avisar.\nHabilidad: Rompedor — penetro coberturas enemigas.',
    },
    {
      name:  'FINER — Lider Unidad Asalto',
      img:   '/avatar-finer.svg',
      side:  'right',
      theme: 'bravo',
      text:  'UNIDAD ASALTO — EQUIPO BRAVO\n  Explorador: infiltracion rapida, movimiento 4\n  Artilleria: columna vertebral, PS alto\n  Francotirador: control de zona, alcance 9',
    },

    // ── LOS INMORTALES ───────────────────────────────────
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  'ADVERTENCIA: Los Inmortales son el enemigo del airsoft.\nSin equipo. Sin honor. Solo eliminaciones.\nLos primeros 100 eliminados valen la insignia AIRSOFT TACTICAL CHESS.',
    },

    // ── REGLAS ────────────────────────────────────────────
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'neutral',
      text:  'REGLAS DE COMBATE:\n- 1 disparo por turno por unidad\n- Cobertura reduce el dano recibido\n- Gana quien elimine a todo el equipo rival',
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  'FORMATO DE SERIE: 3 RONDAS\n- Gana la serie quien conquiste 2 rondas\n- Ronda 1: inicia al azar\n- Ronda 2: inicia el otro equipo\n- Ronda 3: inicia quien tenga mas PS',
    },

    // ── CIERRE ────────────────────────────────────────────
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'neutral',
      text:  'DIA 0 — MISION INICIADA\n\nElige tu equipo. Entra al combate.\nEl tablero espera, Operador.',
    },

  ]);
}

// ════════════════════════════════════════════════════════════
//  CRÉDITOS — SPECTRUM AIRSOFT
// ════════════════════════════════════════════════════════════
export function creditsDialog() {
  showDialog([
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  'Saludos comandos 👋 Somos SpectrumAirsoft, creamos este arcade para cuando hay ganas de jugar en la oficina, en la casa o en alguna junta importante... ¡o si ya te aburren los inmortales y boxeadores de COD! 😄',
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'neutral',
      text:  '¿Te gustaría tener a tu equipo en avatares dentro de Airsoft Tactical Chess? 🎮\n¡Escríbenos por WhatsApp y lo hacemos realidad! 👇',
      ctaButton: {
        label: '💬 Escríbenos en WhatsApp',
        url:   'https://wa.me/525527618631',
      },
    },
  ]);
}

// ════════════════════════════════════════════════════════════
//  INFORMACIÓN DE SERIE DE 3 RONDAS
// ════════════════════════════════════════════════════════════
/**
 * Muestra las reglas de la serie al comenzar.
 * @param {Function} onClose - Callback al cerrar
 */
export function matchSeriesInfoDialog(onClose) {
  showDialog([
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  'FORMATO DE PARTIDA\nBienvenidos al campo de batalla.\nSe disputarán 3 RONDAS. Gana la serie quien conquiste 2 rondas.',
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'neutral',
      text:  'REGLAS DE INICIO:\n- Ronda 1: inicia al AZAR\n- Ronda 2: inicia el otro equipo\n- Ronda 3: inicia quien tenga más PS total en sus unidades',
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  'Gana la SERIE quien gane 2 de 3 rondas.\n\nEstrategia, trabajo en equipo y puntería.\nPrepárense, operadores.',
    },
  ], { onClose });
}

// ════════════════════════════════════════════════════════════
//  INICIO DE RONDA — quién empieza
// ════════════════════════════════════════════════════════════
/**
 * @param {number} roundNum - 1, 2 o 3
 * @param {string} startingTeam - 'alpha' | 'bravo'
 * @param {string} reason - texto explicando por qué inicia ese equipo
 * @param {Function} onClose
 */
export function roundStartDialog(roundNum, startingTeam, reason, onClose) {
  // alpha = Montaña, bravo = Asalto
  const teamLabel = startingTeam === 'alpha' ? 'MONTANA ⚡' : 'ASALTO 🔴';
  const teamTheme = startingTeam === 'alpha' ? 'alpha' : 'bravo';

  showDialog([
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  `RONDA ${roundNum} DE 3\n\n${reason}`,
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: teamTheme,
      text:  `INICIA: UNIDAD ${teamLabel}\n\nPreparen sus unidades.\nLa cuenta regresiva esta por comenzar...`,
    },
  ], { onClose });
}

// ════════════════════════════════════════════════════════════
//  CUENTA REGRESIVA 3, 2, 1… ¡JUEGO!
//  (sin diálogo — overlay numérico directo)
// ════════════════════════════════════════════════════════════
/**
 * Muestra overlay 3 → 2 → 1 → ¡JUEGO! y llama onDone al terminar.
 * @param {Function} onDone
 */
export function showCountdownOverlay(onDone) {
  // Crear overlay de cuenta regresiva
  const existing = document.getElementById('countdown-overlay');
  if (existing) existing.remove();

  const ov = document.createElement('div');
  ov.id = 'countdown-overlay';
  ov.style.cssText = `
    position: fixed; inset: 0; z-index: 9000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.82);
    flex-direction: column; gap: 12px;
    pointer-events: none;
  `;

  const numEl = document.createElement('div');
  numEl.style.cssText = `
    font-family: 'Orbitron', monospace;
    font-size: clamp(80px, 18vw, 180px);
    font-weight: 900;
    color: #AAFF00;
    text-shadow: 0 0 40px rgba(170,255,0,0.9), 0 0 80px rgba(170,255,0,0.5);
    letter-spacing: 4px;
    transition: transform 0.15s ease, opacity 0.15s ease;
  `;

  const lblEl = document.createElement('div');
  lblEl.style.cssText = `
    font-family: 'Orbitron', monospace;
    font-size: clamp(14px, 3vw, 22px);
    color: rgba(170,255,0,0.7);
    letter-spacing: 6px;
    text-transform: uppercase;
  `;
  lblEl.textContent = 'RONDA EN CURSO';

  ov.appendChild(numEl);
  ov.appendChild(lblEl);
  document.body.appendChild(ov);

  const steps = [
    { text: '3', color: '#AAFF00', shadow: 'rgba(170,255,0,0.9)' },
    { text: '2', color: '#c8ff00', shadow: 'rgba(200,255,0,0.9)' },
    { text: '1', color: '#ff4e4e', shadow: 'rgba(255,78,78,0.9)'  },
    { text: '¡JUEGO!', color: '#ffffff', shadow: 'rgba(255,255,255,0.9)', small: true },
  ];

  let i = 0;
  function next() {
    if (i >= steps.length) {
      ov.style.transition = 'opacity 0.5s ease';
      ov.style.opacity = '0';
      setTimeout(() => { ov.remove(); if (onDone) onDone(); }, 500);
      return;
    }
    const s = steps[i++];
    numEl.style.color = s.color;
    numEl.style.textShadow = `0 0 40px ${s.shadow}, 0 0 80px ${s.shadow.replace('0.9', '0.4')}`;
    numEl.style.fontSize = s.small ? 'clamp(40px, 9vw, 90px)' : 'clamp(80px, 18vw, 180px)';
    numEl.textContent = s.text;
    // Animación de escala
    numEl.style.transform = 'scale(1.3)';
    numEl.style.opacity = '0';
    requestAnimationFrame(() => {
      setTimeout(() => {
        numEl.style.transition = 'transform 0.25s cubic-bezier(.2,1.4,.5,1), opacity 0.2s ease';
        numEl.style.transform = 'scale(1)';
        numEl.style.opacity = '1';
      }, 20);
    });
    setTimeout(next, s.small ? 900 : 800);
  }
  next();
}

// ════════════════════════════════════════════════════════════
//  FIN DE PARTIDA — ¡Juego! ¡Juego!
// ════════════════════════════════════════════════════════════
/**
 * @param {string} winnerTeam - 'alpha' | 'bravo'
 * @param {string} winnerName - nombre del jugador ganador
 * @param {number} roundNum   - ronda que acaba de terminar (1-3)
 * @param {object} seriesScore - { alpha: n, bravo: n }
 * @param {Function} onClose
 */
export function gameOverRoundDialog(winnerTeam, winnerName, roundNum, seriesScore, onClose) {
  // alpha = Montana, bravo = Asalto
  const teamLabel    = winnerTeam === 'alpha' ? 'MONTANA ⚡' : 'ASALTO 🔴';
  const teamTheme    = winnerTeam === 'alpha' ? 'alpha' : 'bravo';
  const seriesWinner = seriesScore.alpha >= 2 ? 'alpha' : seriesScore.bravo >= 2 ? 'bravo' : null;

  const lines = [
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: teamTheme,
      text:  `JUEGO!  JUEGO!\n\nRonda ${roundNum} terminada.\nUnidad ${teamLabel} gana esta ronda.`,
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'neutral',
      text:  `MARCADOR DE LA SERIE:\n   MONTANA ⚡ ${seriesScore.alpha}  —  ${seriesScore.bravo} 🔴 ASALTO`,
    },
  ];

  if (seriesWinner) {
    const sLabel = seriesWinner === 'alpha' ? 'UNIDAD MONTANA ⚡' : 'UNIDAD ASALTO 🔴';
    lines.push({
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: seriesWinner === 'alpha' ? 'alpha' : 'bravo',
      text:  `${sLabel} GANA LA SERIE!\n\nFelicidades ${winnerName}!\nGran combate, operadores.`,
    });
  } else {
    lines.push({
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'neutral',
      text:  `La serie continua.\nPrepárense para la Ronda ${roundNum + 1}.\nNo hay descanso en el campo de batalla.`,
    });
  }

  showDialog(lines, { onClose });
}
