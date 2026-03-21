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

// ── MÚSICA DE SISTEMA — Durante diálogos ──────────────────────
let _dialogMusicNodes = [];
let _dialogMusicPlaying = false;

export function startDialogMusic() {
  if (_dialogMusicPlaying) return;
  _dialogMusicPlaying = true;

  try {
    const ac = getCtx();

    // Loop principal: patrón de pulso ambiental de sistema
    function scheduleLoop() {
      if (!_dialogMusicPlaying) return;

      // Bajo pulso ambiental (pad)
      const padFreqs = [110, 138, 110, 123];
      padFreqs.forEach((freq, i) => {
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ac.currentTime + i * 0.8;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.04, t + 0.3);
        gain.gain.linearRampToValueAtTime(0, t + 0.75);
        osc.start(t); osc.stop(t + 0.8);
        _dialogMusicNodes.push(osc);
      });

      // Arpeggio de sistema (beeps cortos estilo terminal)
      const arpFreqs = [440, 554, 659, 554];
      arpFreqs.forEach((freq, i) => {
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'square';
        osc.frequency.value = freq;
        const t = ac.currentTime + 0.2 + i * 0.55;
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.15);
        _dialogMusicNodes.push(osc);
      });

      // Pulso de "radar" cada ciclo
      const radar = ac.createOscillator();
      const radarGain = ac.createGain();
      radar.connect(radarGain); radarGain.connect(ac.destination);
      radar.type = 'sine';
      radar.frequency.value = 880;
      const rt = ac.currentTime + 2.0;
      radarGain.gain.setValueAtTime(0.05, rt);
      radarGain.gain.exponentialRampToValueAtTime(0.001, rt + 0.08);
      radar.start(rt); radar.stop(rt + 0.1);
      _dialogMusicNodes.push(radar);

      // Repetir cada 3.2 segundos
      const loopTimer = setTimeout(scheduleLoop, 3200);
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
