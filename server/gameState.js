'use strict';

const GRID_WIDTH = 30;
const GRID_HEIGHT = 15;
const MAX_PLACEMENT_ATTEMPTS = 200;

const UNIT_TYPES = {
  HEAVY: { name: 'Heavy', maxHp: 3, moveRange: 2, shootRange: 4, damage: 1, symbol: '⚔' },
  SCOUT: { name: 'Scout', maxHp: 2, moveRange: 4, shootRange: 3, damage: 1, symbol: '🏃' },
  SNIPER: { name: 'Sniper', maxHp: 2, moveRange: 1, shootRange: 9, damage: 2, symbol: '🎯' },
};

const OBSTACLES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ZONA IZQUIERDA (ALPHA - columnas 0-9)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Muros de spawn Alpha
  { x: 2, y: 2, type: 'wall' }, { x: 2, y: 3, type: 'wall' },
  { x: 2, y: 11, type: 'wall' }, { x: 2, y: 12, type: 'wall' },
  
  // Coberturas zona Alpha
  { x: 1, y: 6, type: 'cover' }, { x: 1, y: 7, type: 'cover' },
  { x: 3, y: 4, type: 'cover' }, { x: 3, y: 10, type: 'cover' },
  { x: 4, y: 6, type: 'cover' }, { x: 4, y: 7, type: 'cover' },
  
  // Muros laterales izquierdos
  { x: 5, y: 1, type: 'wall' }, { x: 5, y: 2, type: 'wall' }, { x: 5, y: 3, type: 'wall' },
  { x: 5, y: 11, type: 'wall' }, { x: 5, y: 12, type: 'wall' }, { x: 5, y: 13, type: 'wall' },
  
  // Corredor izquierdo
  { x: 6, y: 5, type: 'cover' }, { x: 6, y: 9, type: 'cover' },
  { x: 7, y: 6, type: 'wall' }, { x: 7, y: 7, type: 'wall' },
  { x: 8, y: 4, type: 'cover' }, { x: 8, y: 10, type: 'cover' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ZONA CENTRAL IZQUIERDA (columnas 10-14)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Muro vertical divisor 1
  { x: 10, y: 0, type: 'wall' }, { x: 10, y: 1, type: 'wall' }, { x: 10, y: 2, type: 'wall' },
  { x: 10, y: 12, type: 'wall' }, { x: 10, y: 13, type: 'wall' }, { x: 10, y: 14, type: 'wall' },
  
  // Coberturas centrales izquierda
  { x: 11, y: 5, type: 'cover' }, { x: 11, y: 9, type: 'cover' },
  { x: 12, y: 6, type: 'cover' }, { x: 12, y: 7, type: 'cover' },
  { x: 13, y: 3, type: 'wall' }, { x: 13, y: 4, type: 'wall' },
  { x: 13, y: 10, type: 'wall' }, { x: 13, y: 11, type: 'wall' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ZONA CENTRAL (columnas 14-16) - EL CRUCE
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Muro central principal
  { x: 14, y: 0, type: 'wall' }, { x: 14, y: 1, type: 'wall' },
  { x: 14, y: 13, type: 'wall' }, { x: 14, y: 14, type: 'wall' },
  
  { x: 15, y: 2, type: 'wall' }, { x: 15, y: 3, type: 'wall' }, { x: 15, y: 4, type: 'wall' },
  { x: 15, y: 10, type: 'wall' }, { x: 15, y: 11, type: 'wall' }, { x: 15, y: 12, type: 'wall' },
  
  // Coberturas del cruce central
  { x: 14, y: 6, type: 'cover' }, { x: 14, y: 7, type: 'cover' }, { x: 14, y: 8, type: 'cover' },
  { x: 15, y: 6, type: 'cover' }, { x: 15, y: 7, type: 'cover' },
  { x: 16, y: 5, type: 'cover' }, { x: 16, y: 8, type: 'cover' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ZONA CENTRAL DERECHA (columnas 16-20)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Muro vertical divisor 2
  { x: 17, y: 3, type: 'wall' }, { x: 17, y: 4, type: 'wall' },
  { x: 17, y: 10, type: 'wall' }, { x: 17, y: 11, type: 'wall' },
  
  { x: 18, y: 5, type: 'cover' }, { x: 18, y: 9, type: 'cover' },
  { x: 19, y: 6, type: 'cover' }, { x: 19, y: 7, type: 'cover' },
  
  // Muro vertical divisor 3
  { x: 20, y: 0, type: 'wall' }, { x: 20, y: 1, type: 'wall' }, { x: 20, y: 2, type: 'wall' },
  { x: 20, y: 12, type: 'wall' }, { x: 20, y: 13, type: 'wall' }, { x: 20, y: 14, type: 'wall' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ZONA DERECHA (BRAVO - columnas 20-29)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Corredor derecho
  { x: 21, y: 4, type: 'cover' }, { x: 21, y: 10, type: 'cover' },
  { x: 22, y: 6, type: 'wall' }, { x: 22, y: 7, type: 'wall' },
  { x: 23, y: 5, type: 'cover' }, { x: 23, y: 9, type: 'cover' },
  
  // Muros laterales derechos
  { x: 24, y: 1, type: 'wall' }, { x: 24, y: 2, type: 'wall' }, { x: 24, y: 3, type: 'wall' },
  { x: 24, y: 11, type: 'wall' }, { x: 24, y: 12, type: 'wall' }, { x: 24, y: 13, type: 'wall' },
  
  // Coberturas zona Bravo
  { x: 25, y: 6, type: 'cover' }, { x: 25, y: 7, type: 'cover' },
  { x: 26, y: 4, type: 'cover' }, { x: 26, y: 10, type: 'cover' },
  { x: 28, y: 6, type: 'cover' }, { x: 28, y: 7, type: 'cover' },
  
  // Muros de spawn Bravo
  { x: 27, y: 2, type: 'wall' }, { x: 27, y: 3, type: 'wall' },
  { x: 27, y: 11, type: 'wall' }, { x: 27, y: 12, type: 'wall' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MUROS DE BORDE (arriba y abajo)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Esquinas
  { x: 0, y: 0, type: 'wall' }, { x: 29, y: 0, type: 'wall' },
  { x: 0, y: 14, type: 'wall' }, { x: 29, y: 14, type: 'wall' },
  
  // Muros superiores adicionales
  { x: 7, y: 0, type: 'wall' }, { x: 8, y: 0, type: 'wall' },
  { x: 21, y: 0, type: 'wall' }, { x: 22, y: 0, type: 'wall' },
  
  // Muros inferiores adicionales
  { x: 7, y: 14, type: 'wall' }, { x: 8, y: 14, type: 'wall' },
  { x: 21, y: 14, type: 'wall' }, { x: 22, y: 14, type: 'wall' },
];

function createUnits() {
  return {
    alpha: [
      { id: 'a1', team: 'alpha', type: 'HEAVY',  x: 2,  y: 7,  hp: 3, maxHp: 3, moveRange: 2, shootRange: 4, damage: 1, name: 'Artillería', inCover: false, acted: false },
      { id: 'a2', team: 'alpha', type: 'SCOUT',  x: 3,  y: 3,  hp: 2, maxHp: 2, moveRange: 4, shootRange: 3, damage: 1, name: 'Explorador', inCover: false, acted: false },
      { id: 'a3', team: 'alpha', type: 'SNIPER', x: 3,  y: 11, hp: 2, maxHp: 2, moveRange: 1, shootRange: 9, damage: 2, name: 'Francotirador', inCover: false, acted: false },
    ],
    bravo: [
      { id: 'b1', team: 'bravo', type: 'HEAVY',  x: 27, y: 7,  hp: 3, maxHp: 3, moveRange: 2, shootRange: 4, damage: 1, name: 'Artillería', inCover: false, acted: false },
      { id: 'b2', team: 'bravo', type: 'SCOUT',  x: 26, y: 3,  hp: 2, maxHp: 2, moveRange: 4, shootRange: 3, damage: 1, name: 'Explorador', inCover: false, acted: false },
      { id: 'b3', team: 'bravo', type: 'SNIPER', x: 26, y: 11, hp: 2, maxHp: 2, moveRange: 1, shootRange: 9, damage: 2, name: 'Francotirador', inCover: false, acted: false },
    ],
  };
}

function createGameState() {
  return {
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    gridSize: GRID_HEIGHT, // Para compatibilidad con código existente
    obstacles: OBSTACLES,
    units: createUnits(),
    currentTeam: 'alpha',
    turnNumber: 1,
    phase: 'playing',
    winner: null,
    actionLog: [],
    turnTimeLeft: 30,
  };
}

function getObstacleAt(state, x, y) {
  return state.obstacles.find(o => o.x === x && o.y === y) || null;
}

function getUnitAt(state, x, y) {
  for (const team of ['alpha', 'bravo']) {
    const unit = state.units[team].find(u => u.x === x && u.y === y && u.hp > 0);
    if (unit) return unit;
  }
  return null;
}

function getDistance(x1, y1, x2, y2) {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

function hasLineOfSight(state, x1, y1, x2, y2) {
  // Simple LOS check using Bresenham's line algorithm
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let cx = x1, cy = y1;

  while (cx !== x2 || cy !== y2) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
    if (cx === x2 && cy === y2) break;
    const obs = getObstacleAt(state, cx, cy);
    if (obs && obs.type === 'wall') return false;
  }
  return true;
}

function isValidMove(state, unit, tx, ty) {
  if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return false;
  const dist = getDistance(unit.x, unit.y, tx, ty);
  if (dist > unit.moveRange || dist === 0) return false;
  const obs = getObstacleAt(state, tx, ty);
  if (obs && obs.type === 'wall') return false;
  const occupant = getUnitAt(state, tx, ty);
  if (occupant) return false;
  return true;
}

function applyMove(state, unit, tx, ty) {
  if (!isValidMove(state, unit, tx, ty)) {
    return { success: false, message: 'Invalid move target' };
  }
  const obs = getObstacleAt(state, tx, ty);
  unit.x = tx;
  unit.y = ty;
  unit.inCover = obs && obs.type === 'cover';
  unit.acted = true;
  const coord = `${String.fromCharCode(65 + ty)}${tx + 1}`;
  const log = `[T${state.turnNumber}] ${unit.team.toUpperCase()} ${unit.name} (${unit.id}) moved to ${coord}${unit.inCover ? ' (cover)' : ''}`;
  state.actionLog.unshift(log);
  if (state.actionLog.length > 20) state.actionLog.pop();
  return { success: true, message: log };
}

function applyShoot(state, unit, tx, ty) {
  if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) {
    return { success: false, message: 'Target out of bounds' };
  }
  const dist = getDistance(unit.x, unit.y, tx, ty);
  if (dist > unit.shootRange) {
    return { success: false, message: `Out of range (max ${unit.shootRange})` };
  }
  if (!hasLineOfSight(state, unit.x, unit.y, tx, ty)) {
    return { success: false, message: 'No line of sight' };
  }

  const target = getUnitAt(state, tx, ty);
  const coordStr = `${String.fromCharCode(65 + ty)}${tx + 1}`;

  if (!target) {
    unit.acted = true;
    const log = `[T${state.turnNumber}] ${unit.team.toUpperCase()} ${unit.name} fired at ${coordStr} — MISS`;
    state.actionLog.unshift(log);
    if (state.actionLog.length > 20) state.actionLog.pop();
    return { success: true, hit: false, message: log };
  }

  if (target.team === unit.team) {
    return { success: false, message: 'Cannot shoot own unit' };
  }

  let dmg = unit.damage;
  if (target.inCover) dmg = Math.max(0, dmg - 1);
  target.hp = Math.max(0, target.hp - dmg);

  unit.acted = true;
  const eliminated = target.hp <= 0;
  const log = `[T${state.turnNumber}] ${unit.team.toUpperCase()} ${unit.name} shot ${target.team.toUpperCase()} ${target.name} at ${coordStr} — HIT${target.inCover ? ' (cover)' : ''} -${dmg}HP${eliminated ? ' 💀 ELIMINATED' : ` (${target.hp}HP left)`}`;
  state.actionLog.unshift(log);
  if (state.actionLog.length > 20) state.actionLog.pop();

  // Check win condition
  const enemy = state.units[target.team].filter(u => u.hp > 0);
  if (enemy.length === 0) {
    state.phase = 'gameover';
    state.winner = unit.team;
  }

  return { success: true, hit: true, eliminated, message: log };
}

function endTurn(state) {
  // Reset acted flags for all units on current team
  state.units[state.currentTeam].forEach(u => { u.acted = false; });
  state.currentTeam = state.currentTeam === 'alpha' ? 'bravo' : 'alpha';
  if (state.currentTeam === 'alpha') state.turnNumber++;
  state.turnTimeLeft = 30;
  return { success: true };
}

/**
 * Create a game state for AI games with randomized unit positions.
 * Alpha units are placed randomly on the left third (x: 0-9),
 * Bravo units are placed randomly on the right third (x: 20-29).
 */
function createGameStateForAI() {
  const state = createGameState();
  randomizeTeamPositions(state, 'alpha', 0, 9);
  randomizeTeamPositions(state, 'bravo', 20, 29);
  return state;
}

function randomizeTeamPositions(state, team, minX, maxX) {
  const units = state.units[team];
  const usedPositions = new Set();

  const walls = new Set();
  for (const obs of state.obstacles) {
    if (obs.type === 'wall') walls.add(`${obs.x},${obs.y}`);
  }

  // Reserve positions already used by the other team
  const otherTeam = team === 'alpha' ? 'bravo' : 'alpha';
  for (const u of state.units[otherTeam]) {
    usedPositions.add(`${u.x},${u.y}`);
  }

  for (const unit of units) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      const y = Math.floor(Math.random() * GRID_HEIGHT);
      const key = `${x},${y}`;

      if (!walls.has(key) && !usedPositions.has(key)) {
        unit.x = x;
        unit.y = y;
        const obs = state.obstacles.find(o => o.x === x && o.y === y);
        unit.inCover = !!(obs && obs.type === 'cover');
        usedPositions.add(key);
        placed = true;
        break;
      }
    }
    if (!placed) {
      usedPositions.add(`${unit.x},${unit.y}`);
    }
  }
}

module.exports = { createGameState, createGameStateForAI, applyMove, applyShoot, endTurn, getDistance };
