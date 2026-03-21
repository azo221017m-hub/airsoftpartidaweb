'use strict';

const { applyMove, applyShoot, endTurn, getDistance } = require('./gameState');

const GRID_SIZE = 15;

/**
 * Run the AI turn for the BRAVO team.
 * Mirrors the player's action types (move/shoot) by assigning them to
 * random AI units with random valid targets.
 * Remaining units perform random valid actions.
 * @param {object} room - The room object containing gameState
 * @param {string} roomId - The room identifier
 * @param {object} io - Socket.IO server instance
 * @param {function} broadcastState - Function to broadcast state updates
 */
function runAITurn(room, roomId, io, broadcastState) {
  if (!room || !room.gameState || room.gameState.phase !== 'playing') return;
  if (room.gameState.currentTeam !== 'bravo') return;

  // Read and clear the player's recorded actions for mirroring
  const playerActions = room.playerActions || [];
  room.playerActions = [];

  let stepIndex = 0;

  function processNextStep() {
    if (!room.gameState || room.gameState.phase !== 'playing') return;
    if (room.gameState.currentTeam !== 'bravo') return;

    const aliveUnits = room.gameState.units.bravo.filter(u => u.hp > 0 && !u.acted);
    if (aliveUnits.length === 0) {
      finishAITurn(room, roomId, io, broadcastState);
      return;
    }

    // Pick a random alive unacted AI unit
    const unit = aliveUnits[Math.floor(Math.random() * aliveUnits.length)];

    // Mirror the player's action type if available, otherwise random
    const preferredType = stepIndex < playerActions.length ? playerActions[stepIndex].type : null;
    const action = decideRandomAction(room.gameState, unit, preferredType);

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

    stepIndex++;
    setTimeout(processNextStep, 800);
  }

  // Start AI actions after a brief delay
  setTimeout(processNextStep, 1000);
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
 * Decide a random valid action for an AI unit, optionally preferring
 * a specific action type (to mirror the player).
 * @param {object} state - Game state
 * @param {object} unit - AI unit
 * @param {string|null} preferredType - 'move', 'shoot', or null
 * @returns {{type: string, x: number, y: number}|null}
 */
function decideRandomAction(state, unit, preferredType) {
  if (preferredType === 'shoot') {
    const target = findRandomShootTarget(state, unit);
    if (target) return { type: 'shoot', x: target.x, y: target.y };
    // Fall back to move
    const move = findRandomMoveTarget(state, unit);
    if (move) return { type: 'move', x: move.x, y: move.y };
    return null;
  }

  if (preferredType === 'move') {
    const move = findRandomMoveTarget(state, unit);
    if (move) return { type: 'move', x: move.x, y: move.y };
    // Fall back to shoot
    const target = findRandomShootTarget(state, unit);
    if (target) return { type: 'shoot', x: target.x, y: target.y };
    return null;
  }

  // No preference: try shoot first (more impactful), then move
  const target = findRandomShootTarget(state, unit);
  if (target) return { type: 'shoot', x: target.x, y: target.y };

  const move = findRandomMoveTarget(state, unit);
  if (move) return { type: 'move', x: move.x, y: move.y };

  return null;
}

/**
 * Find a random enemy within shoot range and line-of-sight.
 */
function findRandomShootTarget(state, unit) {
  const enemies = state.units.alpha.filter(e => e.hp > 0);
  const validTargets = [];

  for (const enemy of enemies) {
    const dist = getDistance(unit.x, unit.y, enemy.x, enemy.y);
    if (dist > unit.shootRange) continue;
    if (!hasLineOfSight(state, unit.x, unit.y, enemy.x, enemy.y)) continue;
    validTargets.push({ x: enemy.x, y: enemy.y });
  }

  if (validTargets.length === 0) return null;
  return validTargets[Math.floor(Math.random() * validTargets.length)];
}

/**
 * Find a random valid cell to move to.
 */
function findRandomMoveTarget(state, unit) {
  const validMoves = [];

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      const dist = getDistance(unit.x, unit.y, x, y);
      if (dist === 0 || dist > unit.moveRange) continue;

      const obs = getObstacleAt(state, x, y);
      if (obs && obs.type === 'wall') continue;

      const occupant = getUnitAt(state, x, y);
      if (occupant) continue;

      validMoves.push({ x, y });
    }
  }

  if (validMoves.length === 0) return null;
  return validMoves[Math.floor(Math.random() * validMoves.length)];
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
