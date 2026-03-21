// Script simple para generar archivos WAV de prueba
// Ejecutar este archivo directamente en la consola del navegador o en Node.js

console.log('🎵 Generando archivos de audio de prueba...');

// Para usar en el navegador, abre la consola y pega este código:

function generateSimpleBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = 440; // A4 note
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.5);
  
  console.log('✅ Sonido de prueba reproducido');
}

// Alternativa: usar sonidos sintéticos directamente
console.log('Para probar sonidos, ejecuta: generateSimpleBeep()');
