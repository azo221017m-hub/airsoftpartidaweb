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
