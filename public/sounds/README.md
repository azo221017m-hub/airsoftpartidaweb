# Sonidos del Juego

## 📋 Estado Actual

El juego ahora usa **sonidos sintéticos como fallback** si no encuentra los archivos WAV.
Esto significa que el juego funcionará con sonidos aunque no tengas los archivos de audio.

## 🎵 Archivos de Audio (Opcionales)

Si quieres mejorar la experiencia con sonidos reales, coloca estos archivos WAV en esta carpeta:

### Archivos requeridos:

1. **bbs.wav** - Sonido de fondo al cargar la página principal
   - Duración recomendada: 1-2 segundos
   - Volumen configurado: 50%

2. **disprobbs.wav** - Sonido de clic en UI y disparos de Scout/Sniper
   - Duración recomendada: 0.3 segundos
   - Volumen configurado: 70%

3. **disprobbsauto.wav** - Sonido para botones principales y disparos de Heavy
   - Duración recomendada: 0.5 segundos  
   - Volumen configurado: 80%

## 🎮 Uso en el juego:

- **Página principal**: `bbs.wav` al cargar (fallback: tono sintético)
- **Clics en UI**: `disprobbs.wav` en botones, inputs, etc. (fallback: clic corto)
- **Entrar al juego**: `disprobbsauto.wav` al entrar al combate (fallback: tono de inicio)
- **Disparos Scout/Sniper**: `disprobbs.wav` (fallback: disparo semiautomático sintético)
- **Disparos Heavy**: `disprobbsauto.wav` (fallback: disparo automático sintético)
- **Hit confirmado**: Popup visual "HIT!" con animación (1 segundo)

## 🔧 Solución de Problemas

### Si no escuchas los sonidos:

1. **Verifica el volumen del sistema**: Los sonidos están configurados entre 50-90% de volumen
2. **Revisa la consola del navegador** (F12): Verás mensajes indicando si los archivos se cargaron
3. **Los sonidos sintéticos se reproducen automáticamente** si los WAV no están disponibles
4. **Interactúa con la página**: Algunos navegadores bloquean audio hasta que el usuario haga clic

### Mensajes en la consola:

- `✅ Audio cargado: bbs.wav` - El archivo WAV se cargó correctamente
- `No se pudo cargar: /sounds/bbs.wav, usando sonido sintético` - Usando fallback
- `Audio play prevented, usando fallback` - El navegador bloqueó el audio, se usó fallback

## 🛠️ Generador de Sonidos

Abre `generador-sonidos.html` en tu navegador para crear archivos WAV de prueba.

## 📝 Niveles del Juego (Actualizados):

- **Nivel 1 - RECLUTA** 🎯: Visión total, juego básico
- **Nivel 2 - YA SÉ PONER BBs - GUERRA TÁCTICA** 🔥: Ventajas tácticas + visión completa
- **Nivel 3 - JUEGO SIN PLAYERA - NEBLINA DE BBs** ⚡: Niebla de guerra + ventajas tácticas

## 🎛️ Configuración de Volúmenes:

Los volúmenes están optimizados para una experiencia balanceada:
- Sonido de fondo: 50% (no invasivo)
- Clics de UI: 70% (feedback claro)
- Entrada al juego: 80% (impacto inicial)
- Disparos: 90% (acción intensa)

