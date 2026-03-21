/**
 * dialog.js — Sistema de diálogo estilo arcade RPG
 * ──────────────────────────────────────────────────
 * Uso:
 *   import { showDialog, closeDialog } from './dialog.js';
 *
 *   showDialog([
 *     { name: 'OPERADOR',  text: 'Bienvenido al campo de batalla...' },
 *     { name: 'OPERADOR',  text: '¡Elige tu equipo y prepárate!' },
 *   ]);
 *
 *   // Variante roja (enemigo / alerta):
 *   showDialog([...], { theme: 'bravo' });
 *
 *   // Con callback al cerrar:
 *   showDialog([...], { onClose: () => console.log('cerrado') });
 */

// ── Referencias DOM ──────────────────────────────────────────
const overlay   = () => document.getElementById('dialog-overlay');
const textEl    = () => document.getElementById('dialog-text');
const nameEl    = () => document.getElementById('dialog-char-name');
const dotsEl    = () => document.getElementById('dialog-dots');
const charImg   = () => document.getElementById('dialog-char-img');

// ── Estado interno ───────────────────────────────────────────
let _lines      = [];   // Array de { name, text, img? }
let _index      = 0;    // Línea actual
let _typing     = false;// ¿Está escribiendo?
let _stopTyping = null; // Cancela el typewriter en curso
let _onClose    = null; // Callback al cerrar
let _initialized = false;

// ── Typewriter ───────────────────────────────────────────────
const TYPEWRITER_SPEED = 28; // ms por carácter

function typeWrite(el, text, onDone) {
  let i = 0;
  el.textContent = '';
  _typing = true;

  let cancelled = false;
  _stopTyping = () => {
    cancelled = true;
    el.textContent = text;  // muestra texto completo de golpe
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

// ── Mostrar línea ─────────────────────────────────────────────
function showLine(index) {
  const line = _lines[index];
  if (!line) return;

  // Nombre del personaje
  const ne = nameEl();
  if (ne) ne.textContent = line.name || 'OPERADOR';

  // Imagen opcional por línea
  const ci = charImg();
  if (ci && line.img) ci.src = line.img;

  // Dots
  renderDots(_lines.length, index);

  // Texto con typewriter
  typeWrite(textEl(), line.text, null);
}

// ── API pública ───────────────────────────────────────────────

/**
 * Muestra una secuencia de diálogos.
 * @param {Array<{name:string, text:string, img?:string}>} lines
 * @param {{ theme?: 'alpha'|'bravo', onClose?: Function }} [opts]
 */
export function showDialog(lines, opts = {}) {
  if (!lines || lines.length === 0) return;

  _lines   = lines;
  _index   = 0;
  _onClose = opts.onClose || null;

  const ov = overlay();
  if (!ov) return;

  // Tema de color
  ov.classList.remove('dialog-bravo');
  if (opts.theme === 'bravo') ov.classList.add('dialog-bravo');

  // Reset imagen al default si la línea no tiene img propia
  const ci = charImg();
  if (ci && !lines[0].img) ci.src = '/spectrumTexcoco.png';

  ov.style.display = 'flex';

  // Inicializar listeners una sola vez
  if (!_initialized) {
    _bindEvents();
    _initialized = true;
  }

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
  if (_onClose) { _onClose(); _onClose = null; }
}

/**
 * Avanza al siguiente texto, o cierra si ya no hay más.
 */
export function nextDialog() {
  // Si está escribiendo → muestra el texto completo primero
  if (_typing && _stopTyping) {
    _stopTyping();
    return;
  }

  _index++;
  if (_index < _lines.length) {
    showLine(_index);
  } else {
    closeDialog();
  }
}

// ── Eventos ──────────────────────────────────────────────────
function _bindEvents() {
  // Click en el overlay
  overlay().addEventListener('click', (e) => {
    // Evitar propagación si se hizo click en algún botón interno
    nextDialog();
  });

  // Tecla espacio o Enter
  document.addEventListener('keydown', (e) => {
    const ov = overlay();
    if (!ov || ov.style.display === 'none') return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      nextDialog();
    }
    if (e.code === 'Escape') {
      closeDialog();
    }
  });
}

// ── Demo / prueba rápida (se exporta para testing) ────────────
export function demoDialog() {
  showDialog([
    {
      name: 'SPECTRUM TEXCOCO',
      text: '¡Bienvenido, operador! El campo de batalla te espera...',
    },
    {
      name: 'SPECTRUM TEXCOCO',
      text: 'Tienes tres unidades: Heavy, Scout y Sniper. Cada una tiene habilidades distintas.',
    },
    {
      name: 'SPECTRUM TEXCOCO',
      text: '¡Elige tu nivel de dificultad y entra al combate! ☠️',
    },
  ]);
}
