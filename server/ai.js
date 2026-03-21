'use strict';

const { applyMove, applyShoot, endTurn, getDistance } = require('./gameState');

const GRID_SIZE = 15;

/**
 * Run the AI turn for the BRAVO team.
 * Executes actions sequentially with delays for visual feedback.
 * @param {object} room - The room object containing gameState
 * @param {string} roomId - The room identifier
 * @param {object} io - Socket.IO server instance
 * @param {function} broadcastState - Function to broadcast state updates
 */
function runAITurn(room, roomId, io, broadcastState) {
  if (!room || !room.gameState || room.gameState.phase !== 'playing') return;
  if (room.gameState.currentTeam !== 'bravo') return;

  const units = room.gameState.units.bravo.filter(u => u.hp > 0 && !u.acted);
  if (units.length === 0) {
    finishAITurn(room, roomId, io, broadcastState);
    return;
  }

  let actionIndex = 0;

  function processNextUnit() {
    if (!room.gameState || room.gameState.phase !== 'playing') return;
    if (room.gameState.currentTeam !== 'bravo') return;

    const aliveUnits = room.gameState.units.bravo.filter(u => u.hp > 0 && !u.acted);
    if (aliveUnits.length === 0 || actionIndex >= units.length) {
      finishAITurn(room, roomId, io, broadcastState);
      return;
    }

    const unit = aliveUnits[0];
    const action = decideAction(room.gameState, unit);

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
      // No valid action, mark as acted
      unit.acted = true;
    }

    actionIndex++;
    setTimeout(processNextUnit, 800);
  }

  // Start AI actions after a brief delay
  setTimeout(processNextUnit, 1000);
}

/**
 * End the AI turn and switch back to the player.
 */
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

/**
 * Decide the best action for an AI unit.
 * Priority: 1) Shoot an enemy in range, 2) Move toward nearest enemy or cover.
 */
function decideAction(state, unit) {
  // Try to shoot first
  const shootTarget = findBestShootTarget(state, unit);
  if (shootTarget) {
    return { type: 'shoot', x: shootTarget.x, y: shootTarget.y };
  }

  // Try to move toward the nearest enemy or into cover
  const moveTarget = findBestMoveTarget(state, unit);
  if (moveTarget) {
    return { type: 'move', x: moveTarget.x, y: moveTarget.y };
  }

  return null;
}

/**
 * Find the best enemy to shoot at.
 * Prioritize: lowest HP, then closest distance.
 */
function findBestShootTarget(state, unit) {
  const enemies = state.units.alpha.filter(e => e.hp > 0);
  const targets = [];

  for (const enemy of enemies) {
    const dist = getDistance(unit.x, unit.y, enemy.x, enemy.y);
    if (dist > unit.shootRange) continue;
    if (!hasLineOfSight(state, unit.x, unit.y, enemy.x, enemy.y)) continue;

    const effectiveDmg = enemy.inCover ? Math.max(0, unit.damage - 1) : unit.damage;
    const wouldEliminate = enemy.hp <= effectiveDmg;

    targets.push({
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      dist,
      wouldEliminate,
      effectiveDmg,
    });
  }

  if (targets.length === 0) return null;

  // Prioritize: eliminations first, then lowest HP, then closest
  targets.sort((a, b) => {
    if (a.wouldEliminate !== b.wouldEliminate) return a.wouldEliminate ? -1 : 1;
    if (a.hp !== b.hp) return a.hp - b.hp;
    return a.dist - b.dist;
  });

  return targets[0];
}

/**
 * Find the best cell to move to.
 * Prioritize moving toward enemies, preferring cover positions.
 */
function findBestMoveTarget(state, unit) {
  const enemies = state.units.alpha.filter(e => e.hp > 0);
  if (enemies.length === 0) return null;

  // Find the nearest enemy
  let nearestEnemy = null;
  let nearestDist = Infinity;
  for (const enemy of enemies) {
    const dist = getDistance(unit.x, unit.y, enemy.x, enemy.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestEnemy = enemy;
    }
  }

  if (!nearestEnemy) return null;

  // Get all valid move cells
  const validMoves = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      const dist = getDistance(unit.x, unit.y, x, y);
      if (dist === 0 || dist > unit.moveRange) continue;

      const obs = getObstacleAt(state, x, y);
      if (obs && obs.type === 'wall') continue;

      const occupant = getUnitAt(state, x, y);
      if (occupant) continue;

      const distToEnemy = getDistance(x, y, nearestEnemy.x, nearestEnemy.y);
      const isCover = obs && obs.type === 'cover';

      // Check if moving here would put enemy in shoot range
      const canShootAfterMove = distToEnemy <= unit.shootRange &&
        hasLineOfSight(state, x, y, nearestEnemy.x, nearestEnemy.y);

      validMoves.push({
        x,
        y,
        distToEnemy,
        isCover,
        canShootAfterMove,
      });
    }
  }

  if (validMoves.length === 0) return null;

  // Prioritize: can shoot after move > cover > closer to enemy
  validMoves.sort((a, b) => {
    if (a.canShootAfterMove !== b.canShootAfterMove) return a.canShootAfterMove ? -1 : 1;
    if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
    return a.distToEnemy - b.distToEnemy;
  });

  return validMoves[0];
}

// ─── Helper functions (duplicated from gameState for AI module) ───

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

function hasLineOfSight(state, x1, y1, x2, y2) {
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

module.exports = { runAITurn };
