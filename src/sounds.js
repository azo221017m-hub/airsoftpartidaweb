// src/sounds.js - Web Audio API sound effects
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(freq, type, duration, vol = 0.3, delay = 0) {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
    gain.gain.setValueAtTime(vol, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + duration + 0.05);
  } catch (e) { /* silence audio errors */ }
}

export function playShoot() {
  playTone(300, 'sawtooth', 0.08, 0.4);
  playTone(150, 'square', 0.12, 0.3, 0.06);
}

export function playHit() {
  playTone(200, 'sawtooth', 0.1, 0.5);
  playTone(100, 'square', 0.15, 0.4, 0.08);
  playTone(80, 'sine', 0.2, 0.3, 0.15);
}

export function playEliminate() {
  [0, 0.1, 0.2, 0.3].forEach((d, i) => {
    playTone(400 - i * 80, 'sawtooth', 0.15, 0.4, d);
  });
}

// Sonido misterioso ambiental — partida activa
export function playMysteriousAmbient() {
  try {
    const ac = getCtx();
    // Tono grave pulsante
    [0, 1.2, 2.6, 4.1].forEach((delay) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, ac.currentTime + delay);
      osc.frequency.linearRampToValueAtTime(48, ac.currentTime + delay + 0.9);
      gain.gain.setValueAtTime(0, ac.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.07, ac.currentTime + delay + 0.2);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + delay + 0.9);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 1.0);
    });
    // Chirrido lejano
    const osc2 = ac.createOscillator();
    const g2 = ac.createGain();
    osc2.connect(g2); g2.connect(ac.destination);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(220, ac.currentTime + 0.5);
    osc2.frequency.exponentialRampToValueAtTime(110, ac.currentTime + 2.0);
    g2.gain.setValueAtTime(0.015, ac.currentTime + 0.5);
    g2.gain.linearRampToValueAtTime(0, ac.currentTime + 2.5);
    osc2.start(ac.currentTime + 0.5);
    osc2.stop(ac.currentTime + 2.6);
    // Ping de alerta
    const osc3 = ac.createOscillator();
    const g3 = ac.createGain();
    osc3.connect(g3); g3.connect(ac.destination);
    osc3.type = 'sine';
    osc3.frequency.value = 880;
    g3.gain.setValueAtTime(0.06, ac.currentTime + 3.0);
    g3.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 3.4);
    osc3.start(ac.currentTime + 3.0);
    osc3.stop(ac.currentTime + 3.5);
  } catch(e) {}
}

export function playMove() {
  playTone(600, 'sine', 0.06, 0.15);
  playTone(800, 'sine', 0.05, 0.05, 0.07);
}

export function playMiss() {
  playTone(250, 'triangle', 0.1, 0.2);
  playTone(200, 'triangle', 0.08, 0.15, 0.1);
}

export function playTurnChange() {
  playTone(400, 'square', 0.1, 0.25);
  playTone(500, 'square', 0.1, 0.2, 0.12);
}

export function playVictory() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => playTone(n, 'square', 0.3, 0.25, i * 0.15));
}

export function playTimerUrgent() {
  playTone(880, 'square', 0.05, 0.15);
}

export function playSelect() {
  playTone(700, 'sine', 0.05, 0.1);
}

// ── Musiquita de cuenta regresiva de ronda (3, 2, 1, ¡JUEGO!) ─────────────
export function playRoundCountdown() {
  try {
    const ac = getCtx();
    // Tres pitidos ascendentes (3, 2, 1)
    const countNotes = [440, 554, 659];
    countNotes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = ac.currentTime + i * 0.75;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.6);
    });
    // ¡JUEGO! — fanfarria de 3 notas ascendentes rápidas
    const goNotes = [523, 784, 1047, 1319];
    goNotes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = ac.currentTime + 2.25 + i * 0.13;
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.start(t); osc.stop(t + 0.4);
    });
    // Tambor de inicio al ¡Juego!
    [2.25, 2.38, 2.50].forEach((dt) => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, ac.currentTime + dt);
      osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + dt + 0.15);
      g.gain.setValueAtTime(0.18, ac.currentTime + dt);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dt + 0.18);
      osc.start(ac.currentTime + dt); osc.stop(ac.currentTime + dt + 0.2);
    });
  } catch(e) {}
}

// ── ¡Juego! ¡Juego! — fin de partida ─────────────────────────────────────
export function playGameOver() {
  try {
    const ac = getCtx();
    // Dos fanfarrias de victoria separadas ("¡Juego! ¡Juego!")
    [0, 1.4].forEach((offset) => {
      const fanfare = [523, 659, 784, 1047];
      fanfare.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'square';
        osc.frequency.value = freq;
        const t = ac.currentTime + offset + i * 0.14;
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        osc.start(t); osc.stop(t + 0.45);
      });
      // Tambor de cierre
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, ac.currentTime + offset + 0.6);
      osc.frequency.exponentialRampToValueAtTime(30, ac.currentTime + offset + 0.85);
      g.gain.setValueAtTime(0.2, ac.currentTime + offset + 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + offset + 0.9);
      osc.start(ac.currentTime + offset + 0.6); osc.stop(ac.currentTime + offset + 0.95);
    });
  } catch(e) {}
}

// ── MÚSICA DE DIÁLOGOS — Épica / aventura táctica ────────────
let _dialogMusicNodes = [];
let _dialogMusicPlaying = false;

export function startDialogMusic() {
  if (_dialogMusicPlaying) return;
  _dialogMusicPlaying = true;

  try {
    const ac = getCtx();

    function scheduleLoop() {
      if (!_dialogMusicPlaying) return;

      const t0 = ac.currentTime;

      // ── BAJO ÉPICO: acorde menor que sube y baja ──
      const bassNotes = [82, 98, 110, 98, 82, 73, 82, 98];
      bassNotes.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = t0 + i * 0.5;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.15);
        g.gain.linearRampToValueAtTime(0, t + 0.45);
        osc.start(t); osc.stop(t + 0.5);
        _dialogMusicNodes.push(osc);
      });

      // ── MELODÍA HEROICA: intervalo ascendente ──
      const melodyNotes = [
        { f: 330, t: 0.3 },
        { f: 392, t: 0.9 },
        { f: 440, t: 1.5 },
        { f: 494, t: 2.1 },
        { f: 440, t: 2.7 },
        { f: 392, t: 3.3 },
      ];
      melodyNotes.forEach(({ f, t }) => {
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'square';
        osc.frequency.value = f;
        const ts = t0 + t;
        g.gain.setValueAtTime(0.04, ts);
        g.gain.exponentialRampToValueAtTime(0.001, ts + 0.35);
        osc.start(ts); osc.stop(ts + 0.4);
        _dialogMusicNodes.push(osc);
      });

      // ── TAMBOR GRAVE: pulso de marcha cada beat ──
      [0, 1.0, 2.0, 3.0].forEach((dt) => {
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t0 + dt);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + dt + 0.18);
        g.gain.setValueAtTime(0.12, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.2);
        osc.start(t0 + dt); osc.stop(t0 + dt + 0.22);
        _dialogMusicNodes.push(osc);
      });

      // ── PAD AMBIENTAL: acorde de fondo sostenido ──
      [164, 196, 246].forEach((freq) => {
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.025, t0 + 0.4);
        g.gain.linearRampToValueAtTime(0.025, t0 + 3.5);
        g.gain.linearRampToValueAtTime(0, t0 + 4.0);
        osc.start(t0); osc.stop(t0 + 4.1);
        _dialogMusicNodes.push(osc);
      });

      // Repetir cada 4 segundos
      const loopTimer = setTimeout(scheduleLoop, 4000);
      _dialogMusicNodes.push({ stop: () => clearTimeout(loopTimer) });
    }

    scheduleLoop();
  } catch (e) { /* silence */ }
}

export function stopDialogMusic() {
  _dialogMusicPlaying = false;
  _dialogMusicNodes.forEach(n => { try { if (n.stop) n.stop(); } catch(e){} });
  _dialogMusicNodes = [];
}
