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
      el.textContent += text[i++];
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

    // ── INTRO SISTEMA ────────────────────────────────────
    {
      name:  'SISTEMA · AIRSOFT TACTICAL',
      emoji: '🎮',
      side:  'left',
      theme: 'alpha',
      text:  '... INICIALIZANDO SISTEMA DE COMBATE ...\nBienvenido, OPERADOR. El tablero de batalla te espera.',
    },
    {
      name:  'SISTEMA · AIRSOFT TACTICAL',
      emoji: '🎮',
      side:  'right',
      theme: 'alpha',
      text:  'Temporada 1 — DÍA 0.\nMisión: eliminar a 100 INMORTALES del tablero.',
    },

    // ── LOS INMORTALES ───────────────────────────────────
    {
      name:  'OCELOT · Líder Unidad Montaña',
      emoji: '🐆',
      side:  'left',
      theme: 'alpha',
      text:  'Operador... los Inmortales son el mal del airsoft.\nSe han reportado varios en el tablero. No tienen equipo. No tienen honor.',
    },
    {
      name:  'FINER · Líder Unidad Asalto',
      emoji: '⚔️',
      side:  'right',
      theme: 'bravo',
      text:  '¡Son peligrosos! PS alto y estrategia secreta.\nNo los subestimes, operador.',
    },
    {
      name:  'SISTEMA · AIRSOFT TACTICAL',
      emoji: '🎮',
      side:  'left',
      theme: 'alpha',
      text:  'Los primeros 50 jugadores que eliminen 100 Inmortales\nrecibirán la insignia ⭐ AIRSOFT TACTICAL CHESS.',
    },

    // ── SPECTRUM AIRSOFT ─────────────────────────────────
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'left',
      theme: 'alpha',
      text:  'Somos SPECTRUM AIRSOFT IXTAPALUCA.\nDos unidades élite. Un solo objetivo: limpiar el tablero.',
    },
    {
      name:  'SPECTRUM AIRSOFT',
      img:   '/spectrumTexcoco.png',
      side:  'right',
      theme: 'alpha',
      text:  'Unidad MONTAÑA — terreno difícil.\nUnidad ASALTO — combate directo y contundente.',
    },

    // ── UNIDAD ASALTO ────────────────────────────────────
    {
      name:  'FINER · Líder Unidad Asalto',
      emoji: '⚔️',
      side:  'left',
      theme: 'bravo',
      text:  'Soy FINER, líder de la Unidad Asalto.\nMi batallón: YUL y YAYO. Entramos primero, salimos últimos.',
    },
    {
      name:  'YUL · Explorador',
      emoji: '🏃',
      side:  'right',
      theme: 'alpha',
      text:  'YUL — EXPLORADOR\n────────────────\nPS: 2  |  FPS: 1\nAlcance: 3  |  Mov: 4\nRápido. Siempre delante.',
    },
    {
      name:  'YAYO · Francotirador',
      emoji: '🎯',
      side:  'left',
      theme: 'alpha',
      text:  'YAYO — FRANCOTIRADOR\n────────────────────\nPS: 2  |  FPS: 2\nAlcance: 9  |  Mov: 1\nUn disparo. Una eliminación.',
    },

    // ── UNIDAD MONTAÑA ───────────────────────────────────
    {
      name:  'OCELOT · Líder Unidad Montaña',
      emoji: '🐆',
      side:  'right',
      theme: 'alpha',
      text:  'OCELOT al frente. Líder de la Unidad Montaña.\nMi batallón: SNIP3R y ANIQUILADOR.',
    },
    {
      name:  'SNIP3R · Francotirador',
      emoji: '🔭',
      side:  'left',
      theme: 'neutral',
      text:  'SNIP3R — FRANCOTIRADOR\n──────────────────────\nPS: 2  |  FPS: 2\nAlcance: 9  |  Mov: 1\nSi me ves... ya es demasiado tarde.',
    },
    {
      name:  'ANIQUILADOR · Asalto',
      emoji: '💥',
      side:  'right',
      theme: 'bravo',
      text:  'ANIQUILADOR — ASALTO\n────────────────────\nPS: 3  |  FPS: 1\nAlcance: 4  |  Mov: 2\nBlindado. Imparable. Listo para el caos.',
    },

    // ── REGLAS DE COMBATE ─────────────────────────────────
    {
      name:  'SISTEMA · REGLAS DE COMBATE',
      emoji: '📋',
      side:  'left',
      theme: 'alpha',
      text:  'REGLAS:\n• 1 BBs = 1 disparo\n• Inicio: 100 BBs por partida\n• Blindaje (Bln): reduce 0.5 PS de daño',
    },
    {
      name:  'SISTEMA · REGLAS DE COMBATE',
      emoji: '📋',
      side:  'right',
      theme: 'alpha',
      text:  'Observa el tablero.\nMemoriza posiciones. Crea tu estrategia.\nDerrota al contrario... o serás el derrotado.',
    },

    // ── CIERRE ────────────────────────────────────────────
    {
      name:  'OCELOT · Líder Unidad Montaña',
      emoji: '🐆',
      side:  'left',
      theme: 'alpha',
      text:  'Durante nuestros entrenamientos aparecieron los primeros Inmortales.\nNo fue un accidente. Alguien los envió.',
    },
    {
      name:  'FINER · Líder Unidad Asalto',
      emoji: '⚔️',
      side:  'right',
      theme: 'bravo',
      text:  '¡100 Inmortales en el tablero, operador!\n¿Estás listo para la cacería?\n¡SPECTRUM no se rinde!',
    },
    {
      name:  'SISTEMA · AIRSOFT TACTICAL',
      emoji: '🎮',
      side:  'left',
      theme: 'alpha',
      text:  '[ DÍA 0 — MISIÓN INICIADA ]\n\nElige tu equipo. Entra al combate.\n¡El tablero espera, OPERADOR! ☠️',
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
