// src/main.js - Main entry point
import './style.css';
import { io } from 'socket.io-client';
import { GameRenderer, coordToXY, xyToCoord, buildHpPips, getHpClass } from './game.js';
import {
  playShoot, playHit, playEliminate, playMove,
  playMiss, playTurnChange, playVictory, playTimerUrgent, playSelect
} from './sounds.js';

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

  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] });
    setupSocket();
  }
  isAIGame = true;
  socket.emit('join_ai_game', { playerName: name, gameLevel });
  myName = name;
  
  // Cerrar modal
  gameModal.classList.remove('active');
}

// ─── Socket ──────────────────────────────────────────────────────────────────
function setupSocket() {
  socket.on('connect', () => console.log('Connected:', socket.id));
  socket.on('disconnect', () => {
    showStatus('Desconectado del servidor', 'error');
    showScreen('lobby-screen');
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
      // Skip waiting screen for AI games — game_start will follow immediately
      $('waiting-room-info').textContent = `Sala: ${roomId}`;
    } else {
      showScreen('waiting-screen');
      $('waiting-room-info').textContent = `Sala: ${roomId}`;
      updateWaitingSlots([{ team, name: playerName }]);
    }
  });

  socket.on('player_count', ({ count, players: pl }) => {
    updateWaitingSlots(pl);
  });

  socket.on('game_start', ({ gameState: gs, players: pl }) => {
    gameState = gs;
    players = pl;
    initGame();
    showScreen('game-screen');
    if (isAIGame) {
      showStatus(`¡Partida contra IA iniciada! Eres el equipo ${myTeam.toUpperCase()}`, 'success');
      addChat('SISTEMA', 'neutral', '🤖 ¡Partida contra IA iniciada! Equipo ALPHA comienza.');
    } else {
      showStatus(`¡Partida iniciada! Eres el equipo ${myTeam.toUpperCase()}`, 'success');
      addChat('SISTEMA', 'neutral', '🎮 ¡Partida iniciada! Equipo ALPHA comienza.');
    }
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

  socket.on('action_result', ({ success, message, type, hit, team }) => {
    if (type === 'move') playMove();
    else if (type === 'shoot') { if (hit) playHit(); else playMiss(); }

    // En Nivel 2: solo mostrar movimientos si radar activo y enemigo sin camuflaje
    let shouldShowLog = true;
    if (gameLevel === 2 && type === 'move' && team !== myTeam) {
      // Es un movimiento enemigo
      const radarActive = tacticalAdvantages?.radar?.active || false;
      const enemyCamouflage = renderer?.enemyCamouflage || false;
      
      // Solo mostrar si radar activo Y enemigo sin camuflaje
      shouldShowLog = radarActive && !enemyCamouflage;
    }

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
    
    // Decrementar turnos de ventajas tácticas si es mi turno
    if (isMyTurn && gameLevel === 2) {
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
    playVictory();
    const winnerName = players.find(p => p.team === winner)?.name || winner.toUpperCase();
    $('gameover-title').textContent = 'VICTORIA';
    $('gameover-team').textContent = `EQUIPO ${winner.toUpperCase()}: ${winnerName}`;
    $('gameover-team').className = `gameover-team ${winner}`;
    $('gameover-icon').textContent = winner === myTeam ? '🏆' : '💀';
    $('gameover-msg').textContent = msg || `El equipo ${winner.toUpperCase()} ha eliminado a todos los enemigos`;
    showScreen('gameover-screen');
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
function initGame() {
  if (!renderer) {
    const canvas = $('game-canvas');
    renderer = new GameRenderer(canvas);
    setupCanvasEvents(canvas);
  }
  renderer.myTeam = myTeam;
  renderer.gameLevel = gameLevel;
  renderer.updateState(gameState);
  renderGridLabels();
  renderHUD();
  renderUnitList();
  updateTimer(gameState.turnTimeLeft || 30);

  // Mostrar panel táctico si es nivel 2
  if (gameLevel === 2) {
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

  // Action buttons
  $('btn-move').addEventListener('click', () => setAction('move'));
  $('btn-shoot').addEventListener('click', () => setAction('shoot'));
  $('btn-confirm').addEventListener('click', confirmCoordAction);
  $('coord-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmCoordAction(); });
  $('btn-end-turn').addEventListener('click', endTurn);
  $('btn-codigo-negro').addEventListener('click', codigoNegro);
  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
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
  const shootRangeBonus = (gameLevel === 2 && tacticalAdvantages.scope.active) ? 2 : 0;
  const displayShootRange = unit.shootRange + shootRangeBonus;

  $('selected-unit-info').innerHTML = `
    <b>${unit.name.toUpperCase()}</b> [${unit.id.toUpperCase()}]<br>
    Coord: <b>${xyToCoord(unit.x, unit.y)}</b><br>
    HP: <b>${unit.hp}/${unit.maxHp}</b><br>
    Mov: <b>${unit.moveRange}</b> | Disparo: <b>${displayShootRange}${shootRangeBonus > 0 ? ' 🔭' : ''}</b><br>
    ${unit.inCover ? '🪨 <b>En cobertura</b>' : ''}
    ${unit.acted ? '<span style="color:#ff4e4e">✓ Ya actuó</span>' : ''}
    ${gameLevel === 2 && tacticalAdvantages.armor.active ? '🛡 <b style="color:#00d4ff">Blindaje</b>' : ''}
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
  const shootRangeBonus = (gameLevel === 2 && tacticalAdvantages.scope.active) ? 2 : 0;
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
  
  // Nivel 2: Acumular EXP basado en tiempo restante
  if (gameLevel === 2) {
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
      el.innerHTML = `
        <span class="hud-unit-icon">${getUnitIcon(unit.type)}</span>
        <span class="hud-unit-name">${unit.name.slice(0, 4).toUpperCase()}</span>
        <span class="hud-unit-hp ${hpClass}">${unit.hp > 0 ? unit.hp + '♥' : '💀'}</span>
      `;
      container.appendChild(el);
    }
  });
}

function getUnitIcon(type) {
  return { HEAVY: '⚔', SCOUT: '🏃', SNIPER: '🎯' }[type] || '●';
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

// ─── Game over buttons ────────────────────────────────────────────────────────
$('btn-restart').addEventListener('click', () => {
  socket.emit('restart_game');
  showScreen('game-screen');
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
  // Reset nivel 2 state
  expAccumulated = 0;
  tacticalAdvantages = {
    armor: { unlocked: false, active: false, turnsRemaining: 0 },
    scope: { unlocked: false, active: false, turnsRemaining: 0 },
    camouflage: { unlocked: false, active: false, turnsRemaining: 0 },
    radar: { unlocked: false, active: false, turnsRemaining: 0 }
  };
  showScreen('lobby-screen');
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
        const config = ADVANTAGE_CONFIGS[key];
        showStatus(`${config.name} expiró`, '');
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
  if (socket && gameLevel === 2) {
    socket.emit('update_tactical_advantages', {
      camouflage: tacticalAdvantages.camouflage.active
    });
  }
}
