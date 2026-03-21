// src/main.js - Main entry point
import './style.css';
import { io } from 'socket.io-client';
import { GameRenderer, coordToXY, xyToCoord, buildHpPips, getHpClass } from './game.js';
import {
  playShoot, playHit, playEliminate, playMove,
  playMiss, playTurnChange, playVictory, playTimerUrgent, playSelect,
  playMysteriousAmbient, playRoundCountdown, playGameOver
} from './sounds.js';
import { showDialog, closeDialog, nextDialog, demoDialog, creditsDialog,
         matchSeriesInfoDialog, roundStartDialog, showCountdownOverlay, gameOverRoundDialog } from './dialog.js';
import { initLaunchScreen } from './launch.js';

// ── Pantalla de lanzamiento (se evalúa antes de cualquier otra cosa) ──
initLaunchScreen();

// ─── State ─────────────────────────────────────────────────────────────────
let socket = null;
let myTeam = null;
let myName = '';
let gameState = null;
let players = [];
let selectedUnitId = null;
let pendingAction = null; // 'move' | 'shoot'
let renderer = null;
let timerInterval = null;
let timerMax = 30;
let isAIGame = false;
let gameLevel = 1; // 1 = Recluta, 2 = Ya sé poner BBs

// ─── Estado de la serie de 3 rondas ─────────────────────────────────────────
let seriesActive = false;          // true cuando hay una serie en curso
let seriesScore = { alpha: 0, bravo: 0 }; // victorias por equipo
let currentRound = 0;              // ronda actual (1-3)
let seriesFirstTeam = null;        // equipo que inició la ronda 1 (al azar)
let _lastRoundEndPS = { alpha: 0, bravo: 0 }; // PS al final de cada ronda
// Regla de inicio por ronda:
//   R1 = al azar   → seriesFirstTeam
//   R2 = el otro   → el que NO inició en R1
//   R3 = quien tenga más PS total

function _updateSeriesScoreboard() {
  const sb = $('series-scoreboard');
  if (!sb) return;
  if (seriesActive) {
    sb.style.display = 'flex';
    $('series-score-alpha').textContent = seriesScore.alpha;
    $('series-score-bravo').textContent = seriesScore.bravo;
    $('series-round-label').textContent = `Ronda ${currentRound}/3`;
  } else {
    sb.style.display = 'none';
  }
}

// ─── Nivel 2: Estado de ventajas tácticas ───────────────────────────────────
let expAccumulated = 0; // Segundos acumulados
let tacticalAdvantages = {
  armor: { unlocked: false, active: false, turnsRemaining: 0 }, // Blindaje - 2 turnos
  scope: { unlocked: false, active: false, turnsRemaining: 0 }, // Mira - 2 turnos
  camouflage: { unlocked: false, active: false, turnsRemaining: 0 }, // Camuflaje - 2 turnos
  radar: { unlocked: false, active: false, turnsRemaining: 0 } // Radar - 1 turno
};
let lastTurnEndTime = 0;
let maxActiveAdvantages = 2; // Máximo 2 ventajas activas simultáneamente

// ─── Screens ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Modal ──────────────────────────────────────────────────────────────────
const gameModal = $('game-modal');
const openModalBtn = $('open-game-modal');
const closeModalBtn = $('close-modal');

openModalBtn.addEventListener('click', () => {
  gameModal.classList.add('active');
  // Diálogo de bienvenida al abrir el juego
  demoDialog();
});

closeModalBtn.addEventListener('click', () => {
  gameModal.classList.remove('active');
});

// Cerrar modal al hacer clic fuera del contenido
gameModal.addEventListener('click', (e) => {
  if (e.target === gameModal) {
    gameModal.classList.remove('active');
  }
});

// Cerrar modal con tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gameModal.classList.contains('active')) {
    gameModal.classList.remove('active');
  }
});

// Botón Créditos — cierra modal y muestra diálogo de créditos
$('btn-credits').addEventListener('click', () => {
  gameModal.classList.remove('active');
  creditsDialog();
});

// ─── Lobby ──────────────────────────────────────────────────────────────────
$('join-btn').addEventListener('click', joinGame);
$('join-ai-btn').addEventListener('click', joinAIGame);
$('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });
$('room-id').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });

function joinGame() {
  const name = $('player-name').value.trim() || 'Operador';
  const roomId = $('room-id').value.trim() || 'default';
  const selectedLevel = document.querySelector('input[name="game-level"]:checked')?.value || '1';
  gameLevel = parseInt(selectedLevel);
  $('lobby-status').textContent = '';

  // Reiniciar estado de la serie al entrar a nueva partida
  currentRound = 0;
  seriesScore = { alpha: 0, bravo: 0 };
  seriesFirstTeam = null;
  seriesActive = false;

  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] });
    setupSocket();
  }
  isAIGame = false;
  socket.emit('join_game', { playerName: name, roomId, gameLevel });
  myName = name;
  
  // Cerrar modal
  gameModal.classList.remove('active');
}

function joinAIGame() {
  const name = $('player-name').value.trim() || 'Operador';
  const selectedLevel = document.querySelector('input[name="game-level"]:checked')?.value || '1';
  gameLevel = parseInt(selectedLevel);
  $('lobby-status').textContent = '';

  // Reiniciar estado de la serie al entrar a nueva partida
  currentRound = 0;
  seriesScore = { alpha: 0, bravo: 0 };
  seriesFirstTeam = null;
  seriesActive = false;

  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] });
    setupSocket();
  }
  isAIGame = true;
  socket.emit('join_ai_game', { playerName: name, gameLevel });
  myName = name;
  
  // Cerrar modal y mostrar info de serie
  gameModal.classList.remove('active');
}

// ─── Socket ──────────────────────────────────────────────────────────────────
function setupSocket() {
  socket.on('connect', () => console.log('Connected:', socket.id));
  socket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
    // Solo regresar al lobby si fue una desconexión explícita del usuario
    // (io server disconnect = el servidor cerró la conexión activamente)
    // Las desconexiones temporales de red (transport close, ping timeout) no deben regresar al lobby
    const fatalReasons = ['io server disconnect'];
    if (fatalReasons.includes(reason) && !gameState) {
      showStatus('Desconectado del servidor', 'error');
      showScreen('lobby-screen');
    } else if (fatalReasons.includes(reason) && gameState) {
      showStatus('Desconectado del servidor', 'error');
    } else {
      // Desconexión temporal — mostrar aviso sin salir del juego
      showStatus('Reconectando...', 'error');
    }
  });

  socket.on('error', ({ message }) => {
    $('lobby-status').textContent = '⚠ ' + message;
  });

  socket.on('action_error', ({ message }) => {
    showStatus('⚠ ' + message, 'error');
  });

  socket.on('joined', ({ team, playerName, roomId, playersCount }) => {
    myTeam = team;
    myName = playerName;
    if (isAIGame) {
      // Mostrar info de serie antes del juego contra IA (el game_start llega justo después)
      matchSeriesInfoDialog(null); // Se cierra solo; game_start llegará y arrancará
      $('waiting-room-info').textContent = `Sala: ${roomId}`;
    } else {
      showScreen('waiting-screen');
      $('waiting-room-info').textContent = `Sala: ${roomId}`;
      updateWaitingSlots([{ team, name: playerName }]);
      // Mostrar info de serie en espera PvP
      matchSeriesInfoDialog(null);
    }
  });

  socket.on('player_count', ({ count, players: pl }) => {
    updateWaitingSlots(pl);
  });

  socket.on('game_start', ({ gameState: gs, players: pl }) => {
    gameState = gs;
    players = pl;

    // ── Gestión de serie de 3 rondas ─────────────────────────
    currentRound++;
    if (currentRound === 1) {
      seriesActive = true;
      seriesScore = { alpha: 0, bravo: 0 };
      // Ronda 1: inicio al azar
      seriesFirstTeam = Math.random() < 0.5 ? 'alpha' : 'bravo';
    }

    // Mostrar UI de la serie
    _updateSeriesScoreboard();

    initGame();
    showScreen('game-screen');
    $('btn-codigo-negro').style.display = 'block';

    // ── Determinar razón de inicio ────────────────────────────
    let startReason = '';
    let startingTeam = gs.currentTeam;

    if (currentRound === 1) {
      startReason = `🎲 Ronda 1 — inicio al AZAR.\n¡El dado ha decidido!`;
    } else if (currentRound === 2) {
      startReason = `🔄 Ronda 2 — inicia el equipo contrario.\n¡El turno cambia de bando!`;
    } else if (currentRound === 3) {
      // Calcular PS total de cada equipo del gameState anterior (se calcula en game_over)
      startReason = `💪 Ronda 3 — inicia quien tenga más PS total.\n¡La ventaja la ganaron con sus unidades!`;
    }

    // ── Diálogo de inicio de ronda → cuenta regresiva → juego ─
    roundStartDialog(currentRound, startingTeam, startReason, () => {
      playRoundCountdown();
      showCountdownOverlay(() => {
        playMysteriousAmbient();
        if (isAIGame) {
          showStatus(`¡Ronda ${currentRound}! Eres el equipo ${myTeam.toUpperCase()}`, 'success');
          addChat('SISTEMA', 'neutral', `🤖 Ronda ${currentRound} — Partida contra IA. ALPHA comienza.`);
        } else {
          showStatus(`¡Ronda ${currentRound}! Eres el equipo ${myTeam.toUpperCase()}`, 'success');
          addChat('SISTEMA', 'neutral', `🎮 Ronda ${currentRound} iniciada. ${startingTeam.toUpperCase()} comienza.`);
        }
      });
    });
  });

  socket.on('state_update', ({ gameState: gs, players: pl, enemyCamouflage }) => {
    const prevState = gameState;
    gameState = gs;
    players = pl;
    
    // Guardar estado de camuflaje enemigo
    if (typeof enemyCamouflage !== 'undefined') {
      renderer.enemyCamouflage = enemyCamouflage;
    }
    
    renderer.updateState(gs);
    renderHUD();
    renderUnitList();
    // Keep selected unit in sync
    if (selectedUnitId) {
      const unit = getUnit(selectedUnitId);
      if (!unit || unit.hp <= 0) {
        clearSelection();
      } else {
        renderer.selectUnit(unit);
      }
    }
  });

  socket.on('action_result', ({ success, message, type, hit, team, unitName }) => {
    if (type === 'move') playMove();
    else if (type === 'shoot') { 
      if (hit) {
        playHit();
        showHitPopup();
      } else {
        playMiss();
      }
    }

    // Detectar eliminación por mensaje (contiene "eliminad")
    if (hit && message && message.toLowerCase().includes('eliminad')) {
      playEliminate();
      showEliminatedPopup();
    }

    // En Nivel 3: solo mostrar movimientos si radar activo y enemigo sin camuflaje
    // En Nivel 2: siempre mostrar movimientos
    let shouldShowLog = true;
    if (gameLevel === 3 && type === 'move' && team !== myTeam) {
      // Es un movimiento enemigo en Nivel 3 (con niebla de guerra)
      const radarActive = tacticalAdvantages?.radar?.active || false;
      const enemyCamouflage = renderer?.enemyCamouflage || false;
      
      // Solo mostrar si radar activo Y enemigo sin camuflaje
      shouldShowLog = radarActive && !enemyCamouflage;
    }
    // Nivel 2: shouldShowLog = true (siempre mostrar)

    if (shouldShowLog) {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry ${type === 'move' ? 'move' : hit ? 'hit' : 'miss'}`;
      logEntry.textContent = message;
      const log = $('action-log');
      log.insertBefore(logEntry, log.firstChild);
      if (log.children.length > 30) log.removeChild(log.lastChild);
    }
  });

  socket.on('turn_change', ({ currentTeam, turnNumber }) => {
    playTurnChange();
    const isMyTurn = currentTeam === myTeam;
    
    // Decrementar turnos de ventajas tácticas si es mi turno (Nivel 2 o 3)
    if (isMyTurn && (gameLevel === 2 || gameLevel === 3)) {
      decrementAdvantageTurns();
    }
    
    clearSelection();
    showStatus(isMyTurn ? '⚡ ¡ES TU TURNO!' : `Turno del equipo ${currentTeam.toUpperCase()}`, isMyTurn ? 'success' : '');
    addChat('SISTEMA', 'neutral', `🔄 Turno ${turnNumber} — ${currentTeam.toUpperCase()} actúa`);
    renderHUD();
    renderUnitList();
  });

  socket.on('timer_tick', ({ timeLeft }) => {
    if (!gameState) return;
    gameState.turnTimeLeft = timeLeft;
    updateTimer(timeLeft);
  });

  socket.on('game_over', ({ winner, message: msg }) => {
    playGameOver();

    // ── Actualizar marcador de la serie ───────────────────────
    if (winner === 'alpha') seriesScore.alpha++;
    else if (winner === 'bravo') seriesScore.bravo++;

    // Guardar PS totales de fin de ronda (para decidir quién inicia R3)
    _lastRoundEndPS = {
      alpha: gameState ? gameState.units.alpha.reduce((s, u) => s + Math.max(0, u.hp), 0) : 0,
      bravo: gameState ? gameState.units.bravo.reduce((s, u) => s + Math.max(0, u.hp), 0) : 0,
    };

    const winnerName = players.find(p => p.team === winner)?.name || winner.toUpperCase();
    const seriesWinner = seriesScore.alpha >= 2 ? 'alpha' : seriesScore.bravo >= 2 ? 'bravo' : null;

    // Actualizar pantalla de game over
    $('gameover-title').textContent = seriesWinner ? '¡¡SERIE GANADA!!' : `RONDA ${currentRound}`;
    $('gameover-team').textContent = `EQUIPO ${winner.toUpperCase()}: ${winnerName}`;
    $('gameover-team').className = `gameover-team ${winner}`;
    $('gameover-icon').textContent = winner === myTeam ? '🏆' : '💀';
    $('gameover-msg').textContent = msg || `El equipo ${winner.toUpperCase()} ha eliminado a todos los enemigos`;
    $('btn-codigo-negro').style.display = 'none';

    // Botón "Una partida más" visible solo si la serie no terminó
    $('btn-restart').style.display = seriesWinner ? 'none' : 'inline-block';
    // Botón "última partida" siempre visible
    $('btn-last-game').style.display = 'inline-block';

    _updateSeriesScoreboard();
    showScreen('gameover-screen');

    // ── Diálogo fin de ronda con Spectrum ──────────────────────
    gameOverRoundDialog(winner, winnerName, currentRound, seriesScore, null);
  });

  socket.on('player_left', ({ name, team }) => {
    addChat('SISTEMA', 'neutral', `❌ ${name} (${team}) se desconectó`);
  });

  socket.on('chat_message', ({ from, team, message }) => {
    addChat(from, team, message);
  });
}

// ─── Waiting screen ──────────────────────────────────────────────────────────
function updateWaitingSlots(pl) {
  const alphaPlayer = pl.find(p => p.team === 'alpha');
  const bravoPlayer = pl.find(p => p.team === 'bravo');
  $('slot-alpha-name').textContent = alphaPlayer ? alphaPlayer.name : 'ESPERANDO...';
  $('slot-bravo-name').textContent = bravoPlayer ? bravoPlayer.name : 'ESPERANDO...';
}

$('leave-btn').addEventListener('click', () => {
  if (socket) socket.disconnect();
  socket = null;
  showScreen('lobby-screen');
});

// ─── Game init ───────────────────────────────────────────────────────────────
// Flags para registrar listeners solo una vez
let _gameButtonsInitialized = false;

function initGame() {
  if (!renderer) {
    const canvas = $('game-canvas');
    renderer = new GameRenderer(canvas);
    setupCanvasEvents(canvas);
  } else {
    // Limpiar estado residual del renderer al reiniciar partida
    renderer.selectedUnit = null;
    renderer.pendingAction = null;
    renderer.validCells = [];
    renderer.flashCells = [];
    renderer.hoveredCell = null;
  }
  renderer.myTeam = myTeam;
  renderer.gameLevel = gameLevel;
  renderer.enemyCamouflage = false;
  renderer.tacticalAdvantages = tacticalAdvantages;
  renderer.updateState(gameState);
  renderGridLabels();
  renderHUD();
  renderUnitList();
  updateTimer(gameState.turnTimeLeft || 30);

  // Mostrar panel táctico si es nivel 2 o 3
  if (gameLevel === 2 || gameLevel === 3) {
    // Panel en el HUD (superior)
    $('tactical-hud-panel').style.display = 'flex';
    
    // Panel lateral (oculto ahora que está en el HUD)
    if ($('tactical-panel')) {
      $('tactical-panel').style.display = 'none';
    }
    
    initTacticalAdvantages();
  } else {
    $('tactical-hud-panel').style.display = 'none';
    if ($('tactical-panel')) {
      $('tactical-panel').style.display = 'none';
    }
  }

  // Registrar listeners de botones de acción UNA SOLA VEZ
  if (!_gameButtonsInitialized) {
    $('btn-move').addEventListener('click', () => setAction('move'));
    $('btn-shoot').addEventListener('click', () => setAction('shoot'));
    $('btn-confirm').addEventListener('click', confirmCoordAction);
    $('coord-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmCoordAction(); });
    $('btn-end-turn').addEventListener('click', endTurn);
    $('btn-codigo-negro').addEventListener('click', codigoNegro);
    $('chat-send').addEventListener('click', sendChat);
    $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    _gameButtonsInitialized = true;
  }
}

// ─── Grid labels ─────────────────────────────────────────────────────────────
function renderGridLabels() {
  const gs = gameState.gridSize;
  const cs = renderer.cellSize;

  // Column labels (1..15)
  const header = $('grid-header');
  header.innerHTML = '';
  header.style.width = `${gs * cs}px`;
  for (let x = 0; x < gs; x++) {
    const lbl = document.createElement('div');
    lbl.className = 'grid-col-label';
    lbl.style.width = `${cs}px`;
    lbl.textContent = x + 1;
    header.appendChild(lbl);
  }

  // Row labels (A..O)
  const rowLabels = $('grid-row-labels');
  rowLabels.innerHTML = '';
  for (let y = 0; y < gs; y++) {
    const lbl = document.createElement('div');
    lbl.className = 'grid-label';
    lbl.style.height = `${cs}px`;
    lbl.style.lineHeight = `${cs}px`;
    lbl.textContent = String.fromCharCode(65 + y);
    rowLabels.appendChild(lbl);
  }
}

// ─── Canvas events ───────────────────────────────────────────────────────────
function setupCanvasEvents(canvas) {
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const { x, y } = renderer.canvasToGrid(cx, cy);
    if (x >= 0 && x < gameState.gridSize && y >= 0 && y < gameState.gridSize) {
      renderer.setHoveredCell(x, y);
      const coord = xyToCoord(x, y);
      const unit = getUnitAtXY(x, y);
      $('coord-display').textContent = unit
        ? `${coord} — ${unit.team.toUpperCase()} ${unit.name} (${unit.hp}/${unit.maxHp} HP)${unit.inCover ? ' 🪨' : ''}`
        : coord;
      // Mostrar hint de distancia si hay acción pendiente
      if (pendingAction && selectedUnitId) {
        updateCoordHint(x, y);
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    renderer.setHoveredCell(-1, -1);
    $('coord-display').textContent = 'Hover sobre la cuadrícula';
  });

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const { x, y } = renderer.canvasToGrid(cx, cy);
    handleGridClick(x, y);
  });
}

function handleGridClick(x, y) {
  if (!gameState || gameState.phase !== 'playing') return;

  if (pendingAction) {
    // Confirm action on click - ejecutar directamente con las coordenadas
    confirmCoordActionDirect(x, y);
    return;
  }

  // Try to select a unit
  const unit = getUnitAtXY(x, y);
  if (unit && unit.team === myTeam && unit.hp > 0) {
    if (gameState.currentTeam !== myTeam) {
      showStatus('No es tu turno', 'error');
      return;
    }
    if (unit.acted) {
      showStatus(`${unit.name} ya actuó este turno`, 'error');
      return;
    }
    selectUnit(unit.id);
  } else {
    clearSelection();
  }
}

// ─── Unit selection ──────────────────────────────────────────────────────────
function selectUnit(unitId) {
  selectedUnitId = unitId;
  pendingAction = null;
  const unit = getUnit(unitId);
  if (!unit) return;
  playSelect();

  renderer.selectUnit(unit);
  renderer.setPendingAction(null);

  $('action-panel').style.display = 'flex';
  $('btn-end-turn').style.display = 'block';
  $('coord-input-group').style.display = 'none';
  $('btn-move').classList.remove('active');
  $('btn-shoot').classList.remove('active');

  const isMyTurn = gameState.currentTeam === myTeam;
  $('btn-move').disabled = !isMyTurn || unit.acted;
  $('btn-shoot').disabled = !isMyTurn || unit.acted;

  // Calcular rangos (con bonus de mira si está activo)
  const shootRangeBonus = ((gameLevel === 2 || gameLevel === 3) && tacticalAdvantages.scope.active) ? 2 : 0;
  const displayShootRange = unit.shootRange + shootRangeBonus;

  $('selected-unit-info').innerHTML = `
    <b>${unit.name.toUpperCase()}</b> [${unit.id.toUpperCase()}]<br>
    Coord: <b>${xyToCoord(unit.x, unit.y)}</b><br>
    HP: <b>${unit.hp}/${unit.maxHp}</b> &nbsp;|&nbsp; FPS: <b>${unit.damage ?? 1}</b><br>
    Mov: <b>${unit.moveRange}</b> | Disparo: <b>${displayShootRange}${shootRangeBonus > 0 ? ' 🔭' : ''}</b><br>
    ${unit.inCover ? '🪨 <b>En cobertura</b>' : ''}
    ${unit.acted ? '<span style="color:#ff4e4e">✓ Ya actuó</span>' : ''}
    ${(gameLevel === 2 || gameLevel === 3) && tacticalAdvantages.armor.active ? '🛡 <b style="color:#00d4ff">Blindaje</b>' : ''}
  `;

  // Highlight selected in unit list
  document.querySelectorAll('.unit-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.unitId === unitId);
  });
}

function clearSelection() {
  selectedUnitId = null;
  pendingAction = null;
  renderer.selectUnit(null);
  renderer.setPendingAction(null);
  $('action-panel').style.display = 'none';
  $('coord-input-group').style.display = 'none';
  document.querySelectorAll('.unit-card').forEach(el => el.classList.remove('selected'));
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function setAction(type) {
  if (!selectedUnitId) return;
  if (gameState.currentTeam !== myTeam) { showStatus('No es tu turno', 'error'); return; }

  pendingAction = type;
  renderer.setPendingAction(type);

  $('btn-move').classList.toggle('active', type === 'move');
  $('btn-shoot').classList.toggle('active', type === 'shoot');
  // NO mostrar el input de coordenadas - ahora se hace clic directo en el tablero
  // $('coord-input-group').style.display = 'flex';
  $('coord-input-group').style.display = 'none';
  
  // Mostrar mensaje de ayuda en el status
  const unit = getUnit(selectedUnitId);
  const shootRangeBonus = ((gameLevel === 2 || gameLevel === 3) && tacticalAdvantages.scope.active) ? 2 : 0;
  const actionText = type === 'move' ? 'MOVER' : 'DISPARAR';
  const rangeText = type === 'move' 
    ? `Rango de movimiento: ${unit?.moveRange || 0} casillas`
    : `Rango de disparo: ${(unit?.shootRange || 0) + shootRangeBonus} casillas${shootRangeBonus > 0 ? ' 🔭' : ''}`;
  showStatus(`${actionText} - Haz clic en el tablero. ${rangeText}`, '');
}

function confirmCoordActionDirect(x, y) {
  if (!selectedUnitId || !pendingAction) return;

  socket.emit('action', {
    type: pendingAction,
    unitId: selectedUnitId,
    x: x,
    y: y,
  });

  // Flash the target cell
  renderer.addFlash(x, y, pendingAction === 'shoot' ? '#ff4e4e' : '#AAFF00', 500);

  // Clear after action
  pendingAction = null;
  $('coord-input-group').style.display = 'none';
  $('btn-move').classList.remove('active');
  $('btn-shoot').classList.remove('active');
  renderer.setPendingAction(null);
}

function confirmCoordAction() {
  const rawCoord = $('coord-input').value.trim().toUpperCase();
  if (!rawCoord || !selectedUnitId || !pendingAction) return;

  const xy = coordToXY(rawCoord);
  if (!xy) { showStatus('Coordenada inválida (ej: A1)', 'error'); return; }

  confirmCoordActionDirect(xy.x, xy.y);
}

function updateCoordHint(x, y) {
  if (!selectedUnitId || !pendingAction) return;
  const unit = getUnit(selectedUnitId);
  if (!unit) return;
  const dist = Math.abs(x - unit.x) + Math.abs(y - unit.y);
  const maxRange = pendingAction === 'move' ? unit.moveRange : unit.shootRange;
  const withinRange = dist <= maxRange && dist > 0;
  $('coord-hint').textContent = `Distancia: ${dist} / ${maxRange} ${withinRange ? '✓' : '✗'}`;
  $('coord-hint').style.color = withinRange ? '#c8ff00' : '#ff4e4e';
}

function endTurn() {
  if (gameState.currentTeam !== myTeam) { showStatus('No es tu turno', 'error'); return; }
  
  // Nivel 2 y 3: Acumular EXP basado en tiempo restante
  if (gameLevel === 2 || gameLevel === 3) {
    const timeRemaining = gameState.turnTimeLeft || 0;
    if (timeRemaining > 0) {
      expAccumulated += timeRemaining;
      updateExpBar();
      showStatus(`Turno terminado (+${timeRemaining}s EXP)`, 'success');
      
      // Verificar si se alcanzó el umbral para desbloquear ventajas
      checkAdvantageUnlocks();
    }
  } else {
    showStatus('Turno terminado', '');
  }
  
  clearSelection();
  socket.emit('end_turn');
}

function codigoNegro() {
  if (confirm('⚠️ CÓDIGO NEGRO: ¿Abandonar la partida y volver al lobby?')) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    
    // Resetear estado del juego
    gameState = null;
    myTeam = null;
    selectedUnitId = null;
    pendingAction = null;
    renderer = null;
    _gameButtonsInitialized = false; // Permitir re-registro de listeners al volver
    gameLevel = 1;
    expAccumulated = 0;
    tacticalAdvantages = {
      armor: { unlocked: false, active: false, turnsRemaining: 0 },
      scope: { unlocked: false, active: false, turnsRemaining: 0 },
      camouflage: { unlocked: false, active: false, turnsRemaining: 0 },
      radar: { unlocked: false, active: false, turnsRemaining: 0 }
    };
    
    showScreen('lobby-screen');
    showStatus('Partida abandonada', '');
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function renderHUD() {
  if (!gameState) return;
  const { units, currentTeam, turnNumber, turnTimeLeft } = gameState;

  $('hud-turn').textContent = `TURNO ${turnNumber}`;

  const ct = $('hud-current-team');
  ct.textContent = currentTeam.toUpperCase();
  ct.className = `hud-current-team team-${currentTeam}`;

  updateTimer(turnTimeLeft ?? 30);

  ['alpha', 'bravo'].forEach(team => {
    const container = $(`hud-${team}-units`);
    container.innerHTML = '';
    for (const unit of units[team]) {
      const el = document.createElement('div');
      el.className = `hud-unit ${unit.hp <= 0 ? 'dead' : ''}`;
      const hpClass = getHpClass(unit.hp, unit.maxHp);
      // Abreviatura táctica: ART / EXP / FRA
      const abbr = { HEAVY: 'ART', SCOUT: 'EXP', SNIPER: 'FRA' }[unit.type] || unit.type.slice(0,3);
      el.innerHTML = `
        <span class="hud-unit-icon">${getUnitIcon(unit.type)}</span>
        <span class="hud-unit-name" title="${getUnitTypeName(unit.type)}">${abbr}</span>
        <span class="hud-unit-hp ${hpClass}">${unit.hp > 0 ? unit.hp + '♥' : '💀'}</span>
      `;
      container.appendChild(el);
    }
  });
}

function getUnitIcon(type) {
  return { HEAVY: '⚔', SCOUT: '🏃', SNIPER: '🎯' }[type] || '●';
}

function getUnitTypeName(type) {
  return { HEAVY: 'Artillería', SCOUT: 'Explorador', SNIPER: 'Francotirador' }[type] || type;
}

function updateTimer(timeLeft) {
  timerMax = 30;
  const el = $('hud-timer');
  el.textContent = timeLeft;
  el.className = `hud-timer${timeLeft <= 10 ? ' urgent' : ''}`;
  if (timeLeft <= 5) playTimerUrgent();

  // Update SVG ring
  const ring = $('timer-ring-fill');
  const circumference = 2 * Math.PI * 20; // r=20
  const progress = timeLeft / timerMax;
  ring.style.strokeDashoffset = circumference * (1 - progress);
  ring.classList.toggle('urgent', timeLeft <= 10);
}

// ─── Unit List (left panel) ───────────────────────────────────────────────────
function renderUnitList() {
  if (!gameState) return;
  const container = $('unit-list');
  container.innerHTML = '';
  const myUnits = gameState.units[myTeam] || [];
  const isMyTurn = gameState.currentTeam === myTeam;

  for (const unit of myUnits) {
    const card = document.createElement('div');
    card.className = `unit-card ${unit.hp <= 0 ? 'dead' : ''} ${unit.acted && unit.hp > 0 ? 'acted' : ''} ${!isMyTurn ? 'not-my-turn' : ''}`;
    card.dataset.unitId = unit.id;
    if (unit.id === selectedUnitId) card.classList.add('selected');

    card.innerHTML = `
      <div class="unit-card-header">
        <span class="unit-card-icon">${getUnitIcon(unit.type)}</span>
        <span class="unit-card-name">${unit.name}</span>
        <span class="unit-card-coord">${xyToCoord(unit.x, unit.y)}</span>
      </div>
      <div class="unit-card-hp">${buildHpPips(unit.hp, unit.maxHp)}</div>
      ${unit.acted && unit.hp > 0 ? '<div class="unit-acted-badge">✓ ACTUÓ</div>' : ''}
      ${unit.inCover && unit.hp > 0 ? '<div class="unit-cover-badge">🪨 EN COBERTURA</div>' : ''}
    `;

    if (unit.hp > 0 && !unit.acted && isMyTurn) {
      card.addEventListener('click', () => selectUnit(unit.id));
    }

    container.appendChild(card);
  }

  // Show/hide end turn button
  const endTurnBtn = $('btn-end-turn');
  endTurnBtn.style.display = isMyTurn ? 'block' : 'none';
  endTurnBtn.disabled = !isMyTurn;

  // Show action panel if unit selected
  if (selectedUnitId && !isMyTurn) clearSelection();
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function sendChat() {
  const msg = $('chat-input').value.trim();
  if (!msg || !socket) return;
  socket.emit('chat', { message: msg });
  $('chat-input').value = '';
}

function addChat(from, team, message) {
  const el = document.createElement('div');
  el.className = 'chat-entry';
  el.innerHTML = `<span class="chat-from ${team}">${from}:</span><span class="chat-msg"> ${escapeHtml(message)}</span>`;
  const log = $('chat-log');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUnit(unitId) {
  if (!gameState) return null;
  for (const team of ['alpha', 'bravo']) {
    const unit = gameState.units[team].find(u => u.id === unitId);
    if (unit) return unit;
  }
  return null;
}

function getUnitAtXY(x, y) {
  if (!gameState) return null;
  for (const team of ['alpha', 'bravo']) {
    const unit = gameState.units[team].find(u => u.x === x && u.y === y && u.hp > 0);
    if (unit) return unit;
  }
  return null;
}

function showStatus(msg, type = '') {
  const el = $('action-status');
  el.textContent = msg;
  el.className = `action-status ${type}`;
  if (msg && type !== 'error') {
    setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
  }
}

// Mostrar popup de "Hit!" en el centro del canvas
function showHitPopup() {
  const canvas = $('game-canvas');
  const canvasRect = canvas.getBoundingClientRect();
  
  const popup = document.createElement('div');
  popup.className = 'hit-popup';
  popup.textContent = 'HIT!';
  popup.style.left = `${canvasRect.left + canvasRect.width / 2}px`;
  popup.style.top = `${canvasRect.top + canvasRect.height / 2}px`;
  
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1000);
}

// Mostrar popup de "Muerto ALV" cuando una unidad es eliminada
function showEliminatedPopup() {
  const canvas = $('game-canvas');
  const canvasRect = canvas.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.className = 'hit-popup eliminated-popup';
  popup.textContent = '☠️ Muerto ALV';
  popup.style.left = `${canvasRect.left + canvasRect.width / 2}px`;
  popup.style.top = `${canvasRect.top + canvasRect.height / 2 - 40}px`;

  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 2000);
}

// ─── Game over buttons ────────────────────────────────────────────────────────
$('btn-restart').addEventListener('click', () => {
  // Limpiar selección y estado pendiente antes de reiniciar
  selectedUnitId = null;
  pendingAction = null;
  // Resetear ventajas tácticas para la nueva ronda
  expAccumulated = 0;
  tacticalAdvantages = {
    armor: { unlocked: false, active: false, turnsRemaining: 0 },
    scope: { unlocked: false, active: false, turnsRemaining: 0 },
    camouflage: { unlocked: false, active: false, turnsRemaining: 0 },
    radar: { unlocked: false, active: false, turnsRemaining: 0 }
  };

  // Si la serie está completa (alguien ganó 2), reiniciar serie
  const seriesWinner = seriesScore.alpha >= 2 ? 'alpha' : seriesScore.bravo >= 2 ? 'bravo' : null;
  if (seriesWinner || currentRound >= 3) {
    currentRound = 0;
    seriesScore = { alpha: 0, bravo: 0 };
    seriesFirstTeam = null;
    seriesActive = false;
    // Mostrar diálogo de nueva serie antes de empezar
    matchSeriesInfoDialog(() => socket.emit('restart_game'));
  } else {
    socket.emit('restart_game');
  }
  showScreen('game-screen');
});

// "¡Una última partida!" → siempre lanza partida contra IA
$('btn-last-game').addEventListener('click', () => {
  selectedUnitId = null;
  pendingAction = null;
  expAccumulated = 0;
  tacticalAdvantages = {
    armor: { unlocked: false, active: false, turnsRemaining: 0 },
    scope: { unlocked: false, active: false, turnsRemaining: 0 },
    camouflage: { unlocked: false, active: false, turnsRemaining: 0 },
    radar: { unlocked: false, active: false, turnsRemaining: 0 }
  };
  // Reiniciar serie para la nueva partida IA
  currentRound = 0;
  seriesScore = { alpha: 0, bravo: 0 };
  seriesFirstTeam = null;
  seriesActive = false;
  // Desconectar socket actual si existía y crear uno nuevo contra IA
  if (socket) { socket.disconnect(); socket = null; }
  renderer = null;
  _gameButtonsInitialized = false;
  isAIGame = true;
  // Reconectar y lanzar contra IA
  socket = io({ transports: ['websocket', 'polling'] });
  setupSocket();
  socket.emit('join_ai_game', { playerName: myName || 'Operador', gameLevel });
});

$('btn-lobby').addEventListener('click', () => {
  if (socket) socket.disconnect();
  socket = null;
  myTeam = null;
  gameState = null;
  selectedUnitId = null;
  pendingAction = null;
  renderer = null;
  isAIGame = false;
  _gameButtonsInitialized = false; // Permitir re-registro de listeners al volver
  // Reset nivel 2 state
  expAccumulated = 0;
  tacticalAdvantages = {
    armor: { unlocked: false, active: false, turnsRemaining: 0 },
    scope: { unlocked: false, active: false, turnsRemaining: 0 },
    camouflage: { unlocked: false, active: false, turnsRemaining: 0 },
    radar: { unlocked: false, active: false, turnsRemaining: 0 }
  };
  $('btn-codigo-negro').style.display = 'none';
  showScreen('lobby-screen');
  // Abrir modal automáticamente sin disparar diálogos
  gameModal.classList.add('active');
});

// ─── NIVEL 2: Ventajas Tácticas ──────────────────────────────────────────────
const ADVANTAGE_CONFIGS = {
  armor: {
    icon: '🛡',
    name: 'BLINDAJE',
    description: 'Bloquea un impacto (2 turnos)',
    duration: 2
  },
  scope: {
    icon: '🔭',
    name: 'MIRA',
    description: 'Rango disparo +2 (2 turnos)',
    duration: 2
  },
  camouflage: {
    icon: '👤',
    name: 'CAMUFLAJE',
    description: 'Invisible al radar (2 turnos)',
    duration: 2
  },
  radar: {
    icon: '📡',
    name: 'RADAR',
    description: 'Ver enemigos (1 turno)',
    duration: 1
  }
};

function initTacticalAdvantages() {
  updateExpBar();
  renderAdvantagesHUD();
}

function updateExpBar() {
  const percentage = Math.min((expAccumulated / 250) * 100, 100);
  
  // Actualizar barra en HUD
  if ($('exp-hud-bar-fill')) {
    $('exp-hud-bar-fill').style.width = `${percentage}%`;
    $('exp-hud-current').textContent = expAccumulated;
  }
  
  // Actualizar barra en panel lateral (si existe)
  if ($('exp-bar-fill')) {
    $('exp-bar-fill').style.width = `${percentage}%`;
    $('exp-current').textContent = expAccumulated;
  }
}

function checkAdvantageUnlocks() {
  // Al llegar a 250 o más, habilitar selección de UNA ventaja
  if (expAccumulated >= 250) {
    // NO resetear EXP aquí, se resetea al seleccionar una ventaja
    
    // Permitir desbloquear una ventaja
    renderAdvantages();
    renderAdvantagesHUD();
    showStatus('¡250 EXP! Selecciona UNA ventaja táctica', 'success');
    addChat('SISTEMA', 'neutral', `⭐ ${expAccumulated}s EXP — ¡Elige una ventaja!`);
  }
}

function renderAdvantagesHUD() {
  const container = $('tactical-hud-advantages');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Verificar si hay EXP suficiente para desbloquear
  const canUnlockNew = expAccumulated >= 250;
  
  Object.entries(ADVANTAGE_CONFIGS).forEach(([key, config]) => {
    const advantage = tacticalAdvantages[key];
    const canUnlock = !advantage.unlocked && canUnlockNew;
    
    const item = document.createElement('div');
    item.className = `advantage-hud-item ${advantage.unlocked ? (advantage.active ? 'active' : 'unlocked') : (canUnlock ? 'available' : 'locked')}`;
    item.title = `${config.name} - ${config.description}`;
    
    let content = config.icon;
    if (advantage.active && advantage.turnsRemaining > 0) {
      content += `<span class="advantage-turns">${advantage.turnsRemaining}</span>`;
    }
    
    item.innerHTML = content;
    
    if (canUnlock) {
      item.addEventListener('click', () => {
        unlockAdvantage(key);
        renderAdvantagesHUD();
      });
    } else if (advantage.unlocked) {
      item.addEventListener('click', () => {
        toggleAdvantage(key);
        renderAdvantagesHUD();
      });
    }
    
    container.appendChild(item);
  });
}

function renderAdvantages() {
  const container = $('tactical-advantages');
  container.innerHTML = '';
  
  // Verificar si hay EXP suficiente para desbloquear
  const canUnlockNew = expAccumulated >= 250;
  
  Object.entries(ADVANTAGE_CONFIGS).forEach(([key, config]) => {
    const advantage = tacticalAdvantages[key];
    const canUnlock = !advantage.unlocked && canUnlockNew;
    
    const item = document.createElement('div');
    item.className = `advantage-item ${advantage.unlocked ? (advantage.active ? 'active' : '') : (canUnlock ? 'available' : 'locked')}`;
    
    let statusText = 'BLOQUEADO';
    let statusClass = 'locked';
    if (advantage.unlocked) {
      if (advantage.active) {
        statusText = `ACTIVO (${advantage.turnsRemaining}T)`;
        statusClass = 'active';
      } else {
        statusText = 'LISTO';
        statusClass = '';
      }
    } else if (canUnlock) {
      statusText = 'DISPONIBLE';
      statusClass = 'available';
    }
    
    item.innerHTML = `
      <span class="advantage-icon">${config.icon}</span>
      <div class="advantage-info">
        <div class="advantage-name">${config.name}</div>
        <div class="advantage-desc">${config.description}</div>
      </div>
      <span class="advantage-status ${statusClass}">${statusText}</span>
    `;
    
    if (canUnlock) {
      item.addEventListener('click', () => unlockAdvantage(key));
    } else if (advantage.unlocked) {
      item.addEventListener('click', () => toggleAdvantage(key));
    }
    
    container.appendChild(item);
  });
}

function unlockAdvantage(key) {
  if (tacticalAdvantages[key].unlocked) return;
  if (expAccumulated < 250) return;
  
  const config = ADVANTAGE_CONFIGS[key];
  
  // Desbloquear y activar automáticamente
  tacticalAdvantages[key].unlocked = true;
  tacticalAdvantages[key].active = true;
  tacticalAdvantages[key].turnsRemaining = config.duration;
  
  // Resetear EXP después de desbloquear
  expAccumulated = 0;
  updateExpBar();
  
  renderAdvantages();
  renderAdvantagesHUD();
  applyAdvantageEffects();
  
  showStatus(`${config.name} activado! (${config.duration} turno${config.duration > 1 ? 's' : ''})`, 'success');
  addChat('SISTEMA', 'neutral', `🎖 ${config.name} activado por ${config.duration} turno${config.duration > 1 ? 's' : ''}`);
}

function toggleAdvantage(key) {
  if (!tacticalAdvantages[key].unlocked) return;
  
  const advantage = tacticalAdvantages[key];
  const config = ADVANTAGE_CONFIGS[key];
  
  if (!advantage.active) {
    // Verificar límite de ventajas activas
    const activeCount = Object.values(tacticalAdvantages).filter(a => a.active).length;
    if (activeCount >= maxActiveAdvantages) {
      showStatus(`Máximo ${maxActiveAdvantages} ventajas activas`, 'error');
      return;
    }
    
    // Activar ventaja
    advantage.active = true;
    advantage.turnsRemaining = config.duration;
    showStatus(`${config.name} activado (${config.duration} turno${config.duration > 1 ? 's' : ''})`, 'success');
  } else {
    // Desactivar ventaja manualmente
    advantage.active = false;
    advantage.turnsRemaining = 0;
    showStatus(`${config.name} desactivado`, '');
  }
  
  renderAdvantages();
  renderAdvantagesHUD();
  applyAdvantageEffects();
}

function decrementAdvantageTurns() {
  // Llamar al inicio de cada turno del jugador
  let anyExpired = false;
  
  Object.entries(tacticalAdvantages).forEach(([key, advantage]) => {
    if (advantage.active && advantage.turnsRemaining > 0) {
      advantage.turnsRemaining--;
      
      if (advantage.turnsRemaining <= 0) {
        advantage.active = false;
        advantage.unlocked = false; // Deshabilitar la ventaja al expirar
        const config = ADVANTAGE_CONFIGS[key];
        showStatus(`${config.name} expiró y se deshabilitó`, '');
        anyExpired = true;
      }
    }
  });
  
  if (anyExpired) {
    renderAdvantages();
    renderAdvantagesHUD();
    applyAdvantageEffects();
  }
}

function applyAdvantageEffects() {
  // Los efectos se aplican en el renderer y en la lógica del juego
  if (renderer) {
    renderer.tacticalAdvantages = tacticalAdvantages;
    renderer.render();
  }
  
  // Actualizar información de unidades si hay scope activo
  if (tacticalAdvantages.scope.active) {
    renderUnitList();
  }
  
  // Sincronizar camuflaje con el servidor
  if (socket && (gameLevel === 2 || gameLevel === 3)) {
    socket.emit('update_tactical_advantages', {
      camouflage: tacticalAdvantages.camouflage.active
    });
  }
}
