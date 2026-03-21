# Sonidos del Juego

Coloca los siguientes archivos de audio WAV en esta carpeta:

## Archivos requeridos:

1. **bbs.wav** - Sonido de fondo al cargar la página principal
2. **disprobbs.wav** - Sonido de clic en la interfaz y disparos de Scout/Sniper
3. **disprobbsauto.wav** - Sonido para botones "Entrar al combate" / "Jugador vs IA" y disparos de Heavy

## Uso en el juego:

- **Página principal**: Reproduce `bbs.wav` al cargar
- **Clics en UI**: Reproduce `disprobbs.wav` en botones, inputs, etc.
- **Entrar al juego**: Reproduce `disprobbsauto.wav` al hacer clic en "ENTRAR AL COMBATE" o "JUGADOR VS IA"
- **Disparos Scout/Sniper**: Reproduce `disprobbs.wav`
- **Disparos Heavy**: Reproduce `disprobbsauto.wav`
- **Hit confirmado**: Muestra popup "HIT!" con animación durante 1 segundo

## Formatos recomendados:
- Formato: WAV (16-bit PCM)
- Sample rate: 44.1kHz o 48kHz
- Duración: 0.5-2 segundos para efectos cortos
