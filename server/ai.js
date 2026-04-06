'use strict';

const { applyMove, applyShoot, endTurn, getDistance } = require('./gameState');

const GRID_WIDTH = 30;
const GRID_HEIGHT = 15;

function runAITurn(room, roomId, io, broadcastState) {
  if (!room || !room.gameState || room.gameState.phase !== 'playing') return;
  if (room.gameState.currentTeam !== 'bravo') return;

  function processNextUnit() {
    if (!room.gameState || room.gameState.phase !== 'playing') return;
    if (room.gameState.currentTeam !== 'bravo') return;

    const aliveUnits = room.gameState.units.bravo.filter(u => u.hp > 0 && !u.acted);
    if (aliveUnits.length === 0) {
      finishAITurn(room, roomId, io, broadcastState);
      return;
    }

    const priorityOrder = { 'SNIPER': 1, 'SCOUT': 2, 'HEAVY': 3 };
    aliveUnits.sort((a, b) => (priorityOrder[a.type] || 3) - (priorityOrder[b.type] || 3));

    const unit = aliveUnits[0];
    const action = decideStrategicAction(room.gameState, unit);

    if (action) {
      let result;
      if (action.type === 'move') {
        result = applyMove(room.gameState, unit, action.x, action.y);
      } else if (action.type === 'shoot') {
        result = applyShoot(room.gameState, unit, action.x, action.y);
      }

      if (result && result.success) {
        broadcastState(roomId);

        if (room.gameState.phase === 'gameover') {
          io.to(roomId).emit('game_over', {
            winner: room.gameState.winner,
            players: room.players.map(p => ({ name: p.name, team: p.team })),
          });
          return;
        }

        io.to(roomId).emit('action_result', {
          success: true,
          message: result.message,
          type: action.type,
          hit: result.hit,
        });
      }
    } else {
      unit.acted = true;
    }

    setTimeout(processNextUnit, 500);
  }

  setTimeout(processNextUnit, 700);
}

function finishAITurn(room, roomId, io, broadcastState) {
  if (!room.gameState || room.gameState.phase !== 'playing') return;
  if (room.gameState.currentTeam !== 'bravo') return;

  endTurn(room.gameState);
  broadcastState(roomId);
  io.to(roomId).emit('turn_change', {
    currentTeam: room.gameState.currentTeam,
    turnNumber: room.gameState.turnNumber,
  });
}

function decideStrategicAction(state, unit) {
  const enemies = state.units.alpha.filter(e => e.hp > 0);
  if (enemies.length === 0) return null;

  const nearestEnemy = findNearestEnemy(unit, enemies);
  const enemyInRange = findBestShootTarget(state, unit, enemies);

  if (enemyInRange && shouldShoot(unit, enemyInRange)) {
    return { type: 'shoot', x: enemyInRange.x, y: enemyInRange.y };
  }

  const strategicMove = findStrategicMove(state, unit, nearestEnemy, enemies);
  if (strategicMove) {
    return { type: 'move', x: strategicMove.x, y: strategicMove.y };
  }

  if (enemyInRange) {
    return { type: 'shoot', x: enemyInRange.x, y: enemyInRange.y };
  }

  const aggressiveMove = findAggressiveMove(state, unit, nearestEnemy);
  if (aggressiveMove) {
    return { type: 'move', x: aggressiveMove.x, y: aggressiveMove.y };
  }

  return null;
}

function findNearestEnemy(unit, enemies) {
  let nearest = null;
  let minDist = Infinity;
  for (const enemy of enemies) {
    const dist = getDistance(unit.x, unit.y, enemy.x, enemy.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

function findBestShootTarget(state, unit, enemies) {
  const validTargets = [];
  for (const enemy of enemies) {
    const dist = getDistance(unit.x, unit.y, enemy.x, enemy.y);
    if (dist > unit.shootRange) continue;
    if (!hasLineOfSight(state, unit.x, unit.y, enemy.x, enemy.y)) continue;
    let score = 100 + (unit.shootRange - dist) * 5 + (enemy.maxHp - enemy.hp) * 20;
    if (enemy.hp <= unit.damage) score += 50;
    if (!enemy.inCover) score += 30;
    if (enemy.type === 'SNIPER') score += 25;
    validTargets.push({ ...enemy, score });
  }
  if (validTargets.length === 0) return null;
  validTargets.sort((a, b) => b.score - a.score);
  return validTargets[0];
}

function shouldShoot(unit, target) {
  const effectiveDamage = target.inCover ? Math.max(0, unit.damage - 1) : unit.damage;
  if (target.hp <= effectiveDamage) return true;
  if (unit.type === 'SNIPER') return true;
  const dist = getDistance(unit.x, unit.y, target.x, target.y);
  if (unit.type === 'HEAVY' && dist <= 3) return true;
  if (unit.type === 'SCOUT' && !target.inCover) return true;
  return Math.random() < 0.75;
}

function findStrategicMove(state, unit, nearestEnemy, allEnemies) {
  if (!nearestEnemy) return null;
  const validMoves = getValidMoves(state, unit);
  if (validMoves.length === 0) return null;
  const scoredMoves = validMoves.map(move => {
    let score = 0;
    const distToEnemy = getDistance(move.x, move.y, nearestEnemy.x, nearestEnemy.y);
    const currentDist = getDistance(unit.x, unit.y, nearestEnemy.x, nearestEnemy.y);
    if (unit.type === 'SNIPER') {
      if (distToEnemy >= 5 && distToEnemy <= unit.shootRange) score += 50;
      if (hasLineOfSight(state, move.x, move.y, nearestEnemy.x, nearestEnemy.y)) score += 40;
      if (distToEnemy < 4) score -= 30;
    } else if (unit.type === 'SCOUT') {
      const obs = getObstacleAt(state, move.x, move.y);
      if (obs && obs.type === 'cover') score += 35;
      if (distToEnemy <= unit.shootRange && distToEnemy >= 2) score += 25;
    } else if (unit.type === 'HEAVY') {
      if (distToEnemy < currentDist) score += 40;
      if (distToEnemy <= unit.shootRange) score += 30;
    }
    const obs = getObstacleAt(state, move.x, move.y);
    if (obs && obs.type === 'cover') score += 15;
    const canShoot = allEnemies.some(e => getDistance(move.x, move.y, e.x, e.y) <= unit.shootRange && hasLineOfSight(state, move.x, move.y, e.x, e.y));
    if (canShoot) score += 25;
    return { ...move, score };
  });
  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves[0];
}

function findAggressiveMove(state, unit, target) {
  if (!target) return null;
  const validMoves = getValidMoves(state, unit);
  let bestMove = null;
  let bestDist = getDistance(unit.x, unit.y, target.x, target.y);
  for (const move of validMoves) {
    const dist = getDistance(move.x, move.y, target.x, target.y);
    if (dist < bestDist) { bestDist = dist; bestMove = move; }
  }
  return bestMove;
}

function getValidMoves(state, unit) {
  const validMoves = [];
  for (let x = 0; x < GRID_WIDTH; x++) {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const dist = getDistance(unit.x, unit.y, x, y);
      if (dist === 0 || dist > unit.moveRange) continue;
      const obs = getObstacleAt(state, x, y);
      if (obs && obs.type === 'wall') continue;
      if (getUnitAt(state, x, y)) continue;
      validMoves.push({ x, y });
    }
  }
  return validMoves;
}

function getObstacleAt(state, x, y) {
  return state.obstacles.find(o => o.x === x && o.y === y) || null;
}

function getUnitAt(state, x, y) {
  for (const team of ['alpha', 'bravo']) {
    const u = state.units[team].find(u => u.x === x && u.y === y && u.hp > 0);
    if (u) return u;
  }
  return null;
}

function hasLineOfSight(state, x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx - dy, cx = x1, cy = y1;
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

module.exports = { runAITurn };
