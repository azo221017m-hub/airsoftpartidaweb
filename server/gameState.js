'use strict';

const GRID_SIZE = 15;

const UNIT_TYPES = {
  HEAVY: { name: 'Heavy', maxHp: 3, moveRange: 2, shootRange: 4, damage: 1, symbol: '⚔' },
  SCOUT: { name: 'Scout', maxHp: 2, moveRange: 4, shootRange: 3, damage: 1, symbol: '🏃' },
  SNIPER: { name: 'Sniper', maxHp: 2, moveRange: 1, shootRange: 9, damage: 2, symbol: '🎯' },
};

const OBSTACLES = [
  // Central vertical wall
  { x: 7, y: 3, type: 'wall' }, { x: 7, y: 4, type: 'wall' }, { x: 7, y: 5, type: 'wall' },
  { x: 7, y: 9, type: 'wall' }, { x: 7, y: 10, type: 'wall' }, { x: 7, y: 11, type: 'wall' },
  // Left cover positions
  { x: 3, y: 6, type: 'cover' }, { x: 3, y: 8, type: 'cover' },
  { x: 4, y: 3, type: 'cover' }, { x: 4, y: 11, type: 'cover' },
  // Right cover positions
  { x: 11, y: 6, type: 'cover' }, { x: 11, y: 8, type: 'cover' },
  { x: 10, y: 3, type: 'cover' }, { x: 10, y: 11, type: 'cover' },
  // Mid horizontal wall
  { x: 5, y: 7, type: 'wall' }, { x: 6, y: 7, type: 'wall' },
  { x: 8, y: 7, type: 'wall' }, { x: 9, y: 7, type: 'wall' },
];

function createUnits() {
  return {
    alpha: [
      { id: 'a1', team: 'alpha', type: 'HEAVY', x: 1, y: 7, hp: 3, maxHp: 3, moveRange: 2, shootRange: 4, damage: 1, name: 'Heavy', inCover: false, acted: false },
      { id: 'a2', team: 'alpha', type: 'SCOUT', x: 2, y: 3, hp: 2, maxHp: 2, moveRange: 4, shootRange: 3, damage: 1, name: 'Scout', inCover: false, acted: false },
      { id: 'a3', team: 'alpha', type: 'SNIPER', x: 2, y: 11, hp: 2, maxHp: 2, moveRange: 1, shootRange: 9, damage: 2, name: 'Sniper', inCover: false, acted: false },
    ],
    bravo: [
      { id: 'b1', team: 'bravo', type: 'HEAVY', x: 13, y: 7, hp: 3, maxHp: 3, moveRange: 2, shootRange: 4, damage: 1, name: 'Heavy', inCover: false, acted: false },
      { id: 'b2', team: 'bravo', type: 'SCOUT', x: 12, y: 3, hp: 2, maxHp: 2, moveRange: 4, shootRange: 3, damage: 1, name: 'Scout', inCover: false, acted: false },
      { id: 'b3', team: 'bravo', type: 'SNIPER', x: 12, y: 11, hp: 2, maxHp: 2, moveRange: 1, shootRange: 9, damage: 2, name: 'Sniper', inCover: false, acted: false },
    ],
  };
}

function createGameState() {
  return {
    gridSize: GRID_SIZE,
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
  if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) return false;
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
  if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) {
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

module.exports = { createGameState, applyMove, applyShoot, endTurn, getDistance };
