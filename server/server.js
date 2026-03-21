'use strict';

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createGameState, createGameStateForAI, applyMove, applyShoot, endTurn } = require('./gameState');
const { runAITurn } = require('./ai');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist');
const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(staticLimiter);
app.use(express.static(distPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// --- Room management ---
// rooms: { [roomId]: { players: [{id, name, team, socketId}], gameState, timer, tacticalAdvantages: {alpha: {}, bravo: {}} } }
const rooms = {};

function getRoomForSocket(socketId) {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.players.some(p => p.socketId === socketId)) {
      return { roomId, room };
    }
  }
  return null;
}

function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  // Enviar estado con ventajas tácticas del enemigo (solo camuflaje)
  room.players.forEach(player => {
    const enemyTeam = player.team === 'alpha' ? 'bravo' : 'alpha';
    const enemyCamouflage = room.tacticalAdvantages?.[enemyTeam]?.camouflage || false;
    
    io.to(player.socketId).emit('state_update', {
      gameState: room.gameState,
      players: room.players.map(p => ({ name: p.name, team: p.team })),
      enemyCamouflage: enemyCamouflage
    });
  });
}

function startTurnTimer(roomId) {
  const room = rooms[roomId];
  if (!room || room.timer) return;

  room.timer = setInterval(() => {
    if (!room.gameState || room.gameState.phase !== 'playing') {
      clearInterval(room.timer);
      room.timer = null;
      return;
    }
    room.gameState.turnTimeLeft = Math.max(0, room.gameState.turnTimeLeft - 1);
    io.to(roomId).emit('timer_tick', { timeLeft: room.gameState.turnTimeLeft });

    if (room.gameState.turnTimeLeft <= 0) {
      // Auto end turn
      endTurn(room.gameState);
      broadcastState(roomId);
      io.to(roomId).emit('turn_change', {
        currentTeam: room.gameState.currentTeam,
        turnNumber: room.gameState.turnNumber,
      });
      // Trigger AI turn if this is an AI room and it's BRAVO's turn
      if (room.isAI && room.gameState.currentTeam === 'bravo') {
        runAITurn(room, roomId, io, broadcastState);
      }
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  // Join or create a room
  socket.on('join_game', ({ playerName, roomId }) => {
    const name = String(playerName || 'Player').trim().slice(0, 20) || 'Player';
    const rid = String(roomId || 'default').trim().slice(0, 30) || 'default';

    if (!rooms[rid]) {
      rooms[rid] = { 
        players: [], 
        gameState: null, 
        timer: null,
        tacticalAdvantages: {
          alpha: { camouflage: false },
          bravo: { camouflage: false }
        }
      };
    }
    const room = rooms[rid];

    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    // Already in room?
    if (room.players.some(p => p.socketId === socket.id)) {
      socket.emit('error', { message: 'Already in room' });
      return;
    }

    const team = room.players.length === 0 ? 'alpha' : 'bravo';
    room.players.push({ socketId: socket.id, name, team });
    socket.join(rid);

    socket.emit('joined', { team, playerName: name, roomId: rid, playersCount: room.players.length });
    io.to(rid).emit('player_count', { count: room.players.length, players: room.players.map(p => ({ name: p.name, team: p.team })) });

    console.log(`[+] ${name} joined room ${rid} as ${team}`);

    // Start game when 2 players are in
    if (room.players.length === 2) {
      room.gameState = createGameState();
      io.to(rid).emit('game_start', {
        gameState: room.gameState,
        players: room.players.map(p => ({ name: p.name, team: p.team })),
      });
      console.log(`[*] Game started in room ${rid}`);
      startTurnTimer(rid);
    }
  });

  // Join a game against AI
  socket.on('join_ai_game', ({ playerName }) => {
    const name = String(playerName || 'Player').trim().slice(0, 20) || 'Player';
    const rid = `ai_${socket.id}`;

    rooms[rid] = { players: [], gameState: null, timer: null, isAI: true, playerActions: [] };
    const room = rooms[rid];

    room.players.push({ socketId: socket.id, name, team: 'alpha' });
    room.players.push({ socketId: '__ai__', name: 'IA', team: 'bravo' });
    socket.join(rid);

    socket.emit('joined', { team: 'alpha', playerName: name, roomId: rid, playersCount: 2 });

    console.log(`[+] ${name} started AI game in room ${rid}`);

    room.gameState = createGameStateForAI();
    io.to(rid).emit('game_start', {
      gameState: room.gameState,
      players: room.players.map(p => ({ name: p.name, team: p.team })),
    });
    console.log(`[*] AI game started in room ${rid}`);
    startTurnTimer(rid);
  });

  // Perform an action
  socket.on('action', ({ type, unitId, x, y }) => {
    const found = getRoomForSocket(socket.id);
    if (!found) return;
    const { roomId, room } = found;

    if (!room.gameState || room.gameState.phase !== 'playing') {
      socket.emit('error', { message: 'Game not in progress' });
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.team !== room.gameState.currentTeam) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const unit = room.gameState.units[player.team].find(u => u.id === unitId);
    if (!unit) {
      socket.emit('error', { message: 'Unit not found' });
      return;
    }
    if (unit.hp <= 0) {
      socket.emit('error', { message: 'Unit is eliminated' });
      return;
    }
    if (unit.acted) {
      socket.emit('error', { message: 'Unit already acted this turn' });
      return;
    }

    let result;
    const tx = parseInt(x, 10);
    const ty = parseInt(y, 10);

    if (type === 'move') {
      result = applyMove(room.gameState, unit, tx, ty);
    } else if (type === 'shoot') {
      result = applyShoot(room.gameState, unit, tx, ty);
    } else {
      socket.emit('error', { message: 'Unknown action' });
      return;
    }

    if (!result.success) {
      socket.emit('action_error', { message: result.message });
      return;
    }

    // Record player actions in AI rooms for mirroring
    if (room.isAI && player.team === 'alpha') {
      room.playerActions.push({ type, unitId, x: tx, y: ty });
    }

    broadcastState(roomId);

    if (room.gameState.phase === 'gameover') {
      clearInterval(room.timer);
      room.timer = null;
      io.to(roomId).emit('game_over', {
        winner: room.gameState.winner,
        players: room.players.map(p => ({ name: p.name, team: p.team })),
      });
    } else {
      // Obtener información de la unidad que realizó la acción
      const actingUnit = room.gameState.units[player.team].find(u => u.id === unitId);
      const unitName = actingUnit ? actingUnit.name : '';
      
      io.to(roomId).emit('action_result', { 
        success: true, 
        message: result.message, 
        type, 
        hit: result.hit,
        team: player.team,
        unitName: unitName
      });
    }
  });

  // End turn manually
  socket.on('end_turn', () => {
    const found = getRoomForSocket(socket.id);
    if (!found) return;
    const { roomId, room } = found;

    if (!room.gameState || room.gameState.phase !== 'playing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.team !== room.gameState.currentTeam) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    endTurn(room.gameState);
    broadcastState(roomId);
    io.to(roomId).emit('turn_change', {
      currentTeam: room.gameState.currentTeam,
      turnNumber: room.gameState.turnNumber,
    });
    // Trigger AI turn if this is an AI room and it's BRAVO's turn
    if (room.isAI && room.gameState.currentTeam === 'bravo') {
      runAITurn(room, roomId, io, broadcastState);
    }
  });

  // Chat
  socket.on('chat', ({ message }) => {
    const found = getRoomForSocket(socket.id);
    if (!found) return;
    const { roomId, room } = found;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const msg = String(message || '').trim().slice(0, 200);
    if (!msg) return;
    io.to(roomId).emit('chat_message', { from: player.name, team: player.team, message: msg, time: Date.now() });
  });

  // Tactical advantages update (Nivel 2)
  socket.on('update_tactical_advantages', ({ camouflage }) => {
    const found = getRoomForSocket(socket.id);
    if (!found) return;
    const { roomId, room } = found;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    // Actualizar estado de camuflaje del equipo
    if (room.tacticalAdvantages) {
      room.tacticalAdvantages[player.team].camouflage = Boolean(camouflage);
    }
  });

  // Restart game
  socket.on('restart_game', () => {
    const found = getRoomForSocket(socket.id);
    if (!found) return;
    const { roomId, room } = found;
    // AI rooms only need 1 human player; PvP rooms need 2
    const minPlayers = room.isAI ? 1 : 2;
    if (room.players.filter(p => p.socketId !== '__ai__').length < minPlayers) return;

    clearInterval(room.timer);
    room.timer = null;
    room.gameState = room.isAI ? createGameStateForAI() : createGameState();
    if (room.isAI) room.playerActions = [];
    io.to(roomId).emit('game_start', {
      gameState: room.gameState,
      players: room.players.map(p => ({ name: p.name, team: p.team })),
    });
    startTurnTimer(roomId);
  });

  socket.on('disconnect', () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
    const found = getRoomForSocket(socket.id);
    if (!found) return;
    const { roomId, room } = found;
    const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIdx !== -1) {
      const player = room.players[playerIdx];
      room.players.splice(playerIdx, 1);
      io.to(roomId).emit('player_left', { name: player.name, team: player.team });
      io.to(roomId).emit('player_count', { count: room.players.length, players: room.players.map(p => ({ name: p.name, team: p.team })) });
      if (room.gameState && room.gameState.phase === 'playing') {
        clearInterval(room.timer);
        room.timer = null;
        room.gameState.phase = 'gameover';
        room.gameState.winner = player.team === 'alpha' ? 'bravo' : 'alpha';
        io.to(roomId).emit('game_over', {
          winner: room.gameState.winner,
          message: `${player.name} disconnected`,
          players: room.players.map(p => ({ name: p.name, team: p.team })),
        });
      }
      // Clean up empty rooms
      if (room.players.length === 0) {
        clearInterval(room.timer);
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🎮 Airsoft Tactical server running on http://localhost:${PORT}`);
});
