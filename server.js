const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const playerRooms = new Map(); // socketId -> roomCode

// ─────────────────────────── SETTINGS ───────────────────────────

function defaultSettings(gameType) {
  switch (gameType) {
    case 'scribble':     return { drawTime: 80, rounds: 3, wordChoices: 3 };
    case 'killerdoctor': return { discussionTime: 120, votingTime: 60, nightTime: 45 };
    case 'tictactoe':    return { bestOf: 0 };
    default:             return {};
  }
}

function validateSettings(incoming, gameType) {
  const out = {};
  const n = k => Math.round(Number(incoming[k]));
  const isValidTime = k => Number.isFinite(n(k)) && n(k) >= 10 && n(k) <= 600;
  switch (gameType) {
    case 'scribble':
      if (isValidTime('drawTime'))              out.drawTime    = n('drawTime');
      if ([2,3,4,5].includes(n('rounds')))      out.rounds      = n('rounds');
      if ([2,3,4].includes(n('wordChoices')))   out.wordChoices = n('wordChoices');
      break;
    case 'killerdoctor':
      if (isValidTime('discussionTime'))        out.discussionTime = n('discussionTime');
      if (isValidTime('votingTime'))            out.votingTime     = n('votingTime');
      if (isValidTime('nightTime'))             out.nightTime      = n('nightTime');
      break;
    case 'tictactoe':
      if ([0,3,5,7].includes(n('bestOf')))      out.bestOf = n('bestOf');
      break;
  }
  return out;
}

// ─────────────────────────── UTILITIES ───────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
function uniqueCode() { let c; do { c = genCode(); } while (rooms.has(c)); return c; }
function getRoom(sid) { const code = playerRooms.get(sid); return code ? rooms.get(code) : null; }
function clearTimers(room) { (room.timers||[]).forEach(clearTimeout); room.timers = []; }
function addTimer(room, fn, ms) { if (!room.timers) room.timers = []; const t = setTimeout(fn, ms); room.timers.push(t); return t; }
function minPlayers(g) { return { tictactoe: 2, killerdoctor: 4, scribble: 3 }[g] ?? 2; }

function broadcastLobby(room) {
  io.to(room.code).emit('lobby:update', {
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, isHost: p.id === room.host })),
    code: room.code,
    gameType: room.gameType,
    hostId: room.host,
    minPlayers: minPlayers(room.gameType),
    settings: room.settings,
  });
}

function getLocalIPs() {
  const ips = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

// ─────────────────────────── SOCKET CORE ───────────────────────────

io.on('connection', socket => {

  socket.on('room:create', ({ gameType, playerName }) => {
    if (!playerName?.trim() || !gameType) return;
    const code = uniqueCode();
    const room = {
      code, gameType,
      host: socket.id,
      players: new Map([[socket.id, { id: socket.id, name: playerName.trim() }]]),
      status: 'lobby',
      gameState: null,
      timers: [],
      settings: defaultSettings(gameType),
    };
    rooms.set(code, room);
    playerRooms.set(socket.id, code);
    socket.join(code);
    socket.emit('room:joined', { code, isHost: true, gameType });
    broadcastLobby(room);
  });

  socket.on('room:join', ({ code, playerName }) => {
    const upper = (code || '').toUpperCase().trim();
    const room = rooms.get(upper);
    if (!room) { socket.emit('room:error', { msg: 'Room not found.' }); return; }

    if (room.status === 'playing') {
      const existing = [...room.players.values()].find(p => p.name === playerName?.trim());
      if (!existing) { socket.emit('room:error', { msg: 'Game in progress — cannot join now.' }); return; }
      room.players.delete(existing.id);
      if (room.host === existing.id) room.host = socket.id;
      existing.id = socket.id;
      room.players.set(socket.id, existing);
      playerRooms.set(socket.id, upper);
      socket.join(upper);
      socket.emit('room:joined', { code: upper, isHost: room.host === socket.id, gameType: room.gameType });
      sendReconnectState(room, socket);
      return;
    }

    if (room.players.has(socket.id)) return;
    const name = (playerName || '').trim() || `Player${room.players.size + 1}`;
    room.players.set(socket.id, { id: socket.id, name });
    playerRooms.set(socket.id, upper);
    socket.join(upper);
    socket.emit('room:joined', { code: upper, isHost: false, gameType: room.gameType });
    broadcastLobby(room);
    io.to(upper).emit('notification', `${name} joined the room`);
  });

  socket.on('room:settings', newSettings => {
    const room = getRoom(socket.id);
    if (!room || room.host !== socket.id || room.status !== 'lobby') return;
    const validated = validateSettings(newSettings, room.gameType);
    room.settings = { ...room.settings, ...validated };
    io.to(room.code).emit('lobby:settings', room.settings);
  });

  socket.on('game:start', () => {
    const room = getRoom(socket.id);
    if (!room || room.host !== socket.id || room.status !== 'lobby') return;
    if (room.players.size < minPlayers(room.gameType)) {
      socket.emit('room:error', { msg: `Need at least ${minPlayers(room.gameType)} players to start.` });
      return;
    }
    room.status = 'playing';
    ({ tictactoe: startTTT, killerdoctor: startKD, scribble: startScribble })[room.gameType]?.(room);
  });

  socket.on('game:action', data => {
    const room = getRoom(socket.id);
    if (!room || room.status !== 'playing') return;
    handleAction(room, socket, data);
  });

  socket.on('chat:send', ({ message }) => {
    const room = getRoom(socket.id);
    if (!room || !message?.trim()) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    handleChat(room, socket, player, message.trim().slice(0, 400));
  });

  socket.on('game:restart', () => {
    const room = getRoom(socket.id);
    if (!room || room.host !== socket.id) return;
    restartGame(room);
  });

  socket.on('game:back_to_lobby', () => {
    const room = getRoom(socket.id);
    if (!room || room.host !== socket.id) return;
    clearTimers(room);
    room.status = 'lobby';
    room.gameState = null;
    io.to(room.code).emit('game:back_to_lobby');
    broadcastLobby(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    const name = player?.name || 'A player';
    room.players.delete(socket.id);
    playerRooms.delete(socket.id);
    if (room.players.size === 0) { clearTimers(room); rooms.delete(room.code); return; }
    if (room.host === socket.id) room.host = room.players.keys().next().value;
    broadcastLobby(room);
    io.to(room.code).emit('notification', `${name} left the room`);
    if (room.status === 'playing') onPlayerDisconnect(room, socket.id, name);
  });
});

// ─────────────────────────── HELPERS ───────────────────────────

function sendReconnectState(room, socket) {
  const gs = room.gameState;
  if (!gs) { broadcastLobby(room); return; }
  switch (room.gameType) {
    case 'tictactoe': {
      if (gs.mode === 'tournament') {
        socket.emit('ttt:tournament_state', tttTournamentPublic(gs));
        if (gs.board) socket.emit('ttt:state', tttPublic(gs));
        const sym = gs.players?.X?.id === socket.id ? 'X' : gs.players?.O?.id === socket.id ? 'O' : null;
        socket.emit('ttt:symbol', { symbol: sym });
      } else {
        socket.emit('ttt:state', tttPublic(gs));
        const sym = gs.players.X.id === socket.id ? 'X' : gs.players.O.id === socket.id ? 'O' : null;
        socket.emit('ttt:symbol', { symbol: sym });
      }
      break;
    }
    case 'killerdoctor': {
      const pd = gs.playerData?.[socket.id];
      if (pd) socket.emit('kd:reconnect', { role: pd.role, phase: gs.phase, alive: pd.alive });
      break;
    }
    case 'scribble':
      socket.emit('scribble:reconnect', {
        phase: gs.phase, drawerId: gs.drawerOrder[gs.drawerIndex],
        scores: gs.scores, drawingData: gs.drawingData, masked: gs.masked,
        players: scribblePlayers(room), round: gs.round, maxRounds: gs.maxRounds,
      });
      break;
  }
}

function restartGame(room) {
  clearTimers(room);
  room.status = 'playing';
  room.gameState = null;
  io.to(room.code).emit('game:restarting');
  addTimer(room, () => ({ tictactoe: startTTT, killerdoctor: startKD, scribble: startScribble })[room.gameType]?.(room), 1500);
}

function handleAction(room, socket, data) {
  const gs = room.gameState; if (!gs) return;
  switch (room.gameType) {
    case 'tictactoe':
      if (data.action === 'move')     tttMove(room, socket, data.index);
      if (data.action === 'new_game' && room.gameState?.mode !== 'tournament') tttNewGame(room);
      break;
    case 'killerdoctor': kdAction(room, socket, data); break;
    case 'scribble':     scribbleAction(room, socket, data); break;
  }
}

function handleChat(room, socket, player, message) {
  const gs = room.gameState;

  if (room.gameType === 'scribble' && gs?.phase === 'drawing') {
    const drawerId = gs.drawerOrder[gs.drawerIndex];
    if (socket.id === drawerId || gs.guessedThisRound.has(socket.id)) return;
    const guess = message.toLowerCase().trim();
    const word  = gs.word.toLowerCase().trim();
    if (guess === word) {
      gs.guessedThisRound.add(socket.id);
      const elapsed   = (Date.now() - gs.roundStartTime) / 1000;
      const remaining = Math.max(0, gs.ROUND_DURATION - elapsed);
      const points    = Math.round(100 + (remaining / gs.ROUND_DURATION) * 200);
      gs.scores[socket.id]  = (gs.scores[socket.id]  || 0) + points;
      gs.scores[drawerId]   = (gs.scores[drawerId]   || 0) + 50;
      socket.emit('scribble:correct_guess', { word: gs.word, points });
      io.to(room.code).emit('scribble:guess_event', { playerId: socket.id, playerName: player.name, correct: true, scores: gs.scores });
      const nonDrawers = [...room.players.keys()].filter(id => id !== drawerId);
      if (gs.guessedThisRound.size >= nonDrawers.length) { clearTimers(room); endScribbleRound(room, true); }
    } else {
      io.to(room.code).emit('chat:message', { playerId: socket.id, playerName: player.name, message });
    }
    return;
  }

  if (room.gameType === 'killerdoctor' && gs) {
    const pd = gs.playerData?.[socket.id];
    if (!pd?.alive || gs.phase !== 'day_discussion') return;
  }

  io.to(room.code).emit('chat:message', { playerId: socket.id, playerName: player.name, message });
}

function onPlayerDisconnect(room, sid, name) {
  const gs = room.gameState; if (!gs) return;
  switch (room.gameType) {
    case 'killerdoctor':
      if (gs.playerData?.[sid]) gs.playerData[sid].alive = false;
      { const win = kdCheckWin(gs); if (win) { clearTimers(room); endKD(room, win); } else if (gs.phase === 'night') checkNightDone(room); }
      break;
    case 'tictactoe':
      if (gs.mode === 'tournament' && gs.players) {
        const isActive = gs.players.X.id === sid || gs.players.O.id === sid;
        if (isActive) {
          const winnerId = gs.players.X.id === sid ? gs.players.O.id : gs.players.X.id;
          if (gs.allPlayers[winnerId]) {
            gs.rounds[gs.currentRound][gs.currentMatch].winner = winnerId;
            delete gs.allPlayers[sid];
            io.to(room.code).emit('notification', `${name} left — ${gs.allPlayers[winnerId]?.name} advances!`);
            io.to(room.code).emit('ttt:tournament_state', tttTournamentPublic(gs));
            clearTimers(room);
            addTimer(room, () => advanceTournament(room), 2000);
          }
        }
      } else if (gs.players?.X?.id === sid || gs.players?.O?.id === sid) {
        io.to(room.code).emit('ttt:player_left', { name });
      }
      break;
    case 'scribble': {
      const idx = gs.drawerOrder.indexOf(sid); if (idx !== -1) gs.drawerOrder.splice(idx, 1);
      if (gs.drawerIndex >= gs.drawerOrder.length) gs.drawerIndex = 0;
      delete gs.scores[sid];
      const nonDrawers = [...room.players.keys()].filter(id => id !== gs.drawerOrder[gs.drawerIndex]);
      if (!gs.drawerOrder.length || nonDrawers.length === 0) { clearTimers(room); endScribbleGame(room); }
      else if ((gs.phase === 'drawing' || gs.phase === 'choosing') && sid === gs.drawerOrder[gs.drawerIndex]) {
        clearTimers(room); endScribbleRound(room, false);
      }
      break;
    }
  }
}

// ─────────────────────── TIC TAC TOE ───────────────────────

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

function buildTournamentRounds(playerIds) {
  const size = nextPow2(playerIds.length);
  const seeds = [...playerIds];
  while (seeds.length < size) seeds.push(null);
  const rounds = [];
  let current = seeds;
  while (current.length > 1) {
    const matches = [];
    for (let i = 0; i < current.length; i += 2) {
      const p1 = current[i], p2 = current[i + 1] ?? null;
      const isBye = p2 === null;
      matches.push({ p1, p2, winner: isBye ? p1 : null, isBye });
    }
    rounds.push(matches);
    current = new Array(matches.length).fill(null);
  }
  return rounds;
}

function propagateTournamentWinners(gs) {
  for (let r = 0; r < gs.rounds.length - 1; r++) {
    const cur = gs.rounds[r], nxt = gs.rounds[r + 1];
    for (let m = 0; m < cur.length; m += 2) {
      const ti = Math.floor(m / 2);
      if (ti >= nxt.length) break;
      const w1 = cur[m]?.winner, w2 = cur[m + 1]?.winner;
      if (w1) nxt[ti].p1 = w1;
      if (w2) nxt[ti].p2 = w2;
      if (nxt[ti].p1 && !nxt[ti].p2 && !nxt[ti].winner) { nxt[ti].winner = nxt[ti].p1; nxt[ti].isBye = true; }
      if (!nxt[ti].p1 && nxt[ti].p2 && !nxt[ti].winner) { nxt[ti].winner = nxt[ti].p2; nxt[ti].isBye = true; }
    }
  }
}

function advanceTournament(room) {
  const gs = room.gameState;
  propagateTournamentWinners(gs);
  const finalMatch = gs.rounds[gs.rounds.length - 1][0];
  if (finalMatch.winner) {
    gs.tournamentWinner = finalMatch.winner;
    gs.board = null; gs.players = null; room.status = 'ended';
    io.to(room.code).emit('ttt:tournament_over', {
      winner: gs.allPlayers[gs.tournamentWinner],
      rounds: gs.rounds, allPlayers: gs.allPlayers,
    });
    return;
  }
  for (let r = 0; r < gs.rounds.length; r++) {
    for (let m = 0; m < gs.rounds[r].length; m++) {
      const match = gs.rounds[r][m];
      if (!match.winner && match.p1 && match.p2) {
        gs.currentRound = r; gs.currentMatch = m;
        startTournamentMatch(room, match.p1, match.p2);
        return;
      }
    }
  }
}

function startTournamentMatch(room, p1Id, p2Id) {
  const gs = room.gameState;
  const p1 = gs.allPlayers[p1Id], p2 = gs.allPlayers[p2Id];
  if (!p1 || !p2) { advanceTournament(room); return; }
  const [X, O] = Math.random() < 0.5 ? [p1, p2] : [p2, p1];
  gs.board = Array(9).fill(null);
  gs.players = { X: { id: X.id, name: X.name }, O: { id: O.id, name: O.name } };
  gs.currentTurn = X.id;
  gs.winner = null; gs.winLine = null; gs.winnerSymbol = null;
  io.to(room.code).emit('ttt:state', tttPublic(gs));
  io.to(room.code).emit('ttt:tournament_state', tttTournamentPublic(gs));
  io.to(X.id).emit('ttt:symbol', { symbol: 'X' });
  io.to(O.id).emit('ttt:symbol', { symbol: 'O' });
  Object.keys(gs.allPlayers).filter(id => id !== X.id && id !== O.id).forEach(id => io.to(id).emit('ttt:symbol', { symbol: null }));
}

function tttTournamentPublic(gs) {
  return {
    rounds: gs.rounds, allPlayers: gs.allPlayers,
    currentRound: gs.currentRound, currentMatch: gs.currentMatch,
    tournamentWinner: gs.tournamentWinner,
    currentPlayerIds: gs.players ? [gs.players.X.id, gs.players.O.id] : [],
  };
}

function startTTT(room) {
  const players = [...room.players.values()].sort(() => Math.random() - 0.5);
  const bestOf = room.settings?.bestOf ?? 0;

  if (players.length >= 3) {
    const allPlayers = {};
    players.forEach(p => { allPlayers[p.id] = { id: p.id, name: p.name }; });
    const rounds = buildTournamentRounds(players.map(p => p.id));
    room.gameState = {
      type: 'tictactoe', mode: 'tournament',
      allPlayers, rounds, currentRound: 0, currentMatch: 0,
      board: null, players: null, currentTurn: null,
      winner: null, winLine: null, winnerSymbol: null, tournamentWinner: null,
    };
    io.to(room.code).emit('ttt:tournament_state', tttTournamentPublic(room.gameState));
    addTimer(room, () => advanceTournament(room), 2000);
  } else {
    const X = players[0], O = players[1];
    room.gameState = {
      type: 'tictactoe', mode: 'classic',
      board: Array(9).fill(null),
      players: { X: { id: X.id, name: X.name }, O: { id: O.id, name: O.name } },
      currentTurn: X.id,
      winner: null, winLine: null, winnerSymbol: null,
      scores: { [X.id]: 0, [O.id]: 0 },
      gameCount: 1, bestOf, matchWinner: null,
    };
    io.to(room.code).emit('ttt:state', tttPublic(room.gameState));
    io.to(X.id).emit('ttt:symbol', { symbol: 'X' });
    io.to(O.id).emit('ttt:symbol', { symbol: 'O' });
    players.filter(p => p.id !== X.id && p.id !== O.id).forEach(p => io.to(p.id).emit('ttt:symbol', { symbol: null }));
  }
}

function tttMove(room, socket, index) {
  const gs = room.gameState;
  if (!gs.board || gs.winner || (gs.mode !== 'tournament' && gs.matchWinner) || gs.currentTurn !== socket.id) return;
  if (index < 0 || index > 8 || gs.board[index] !== null) return;
  const sym = gs.players.X.id === socket.id ? 'X' : gs.players.O.id === socket.id ? 'O' : null;
  if (!sym) return;
  gs.board[index] = sym;
  const win = tttWin(gs.board);
  if (win) {
    gs.winner = socket.id; gs.winnerSymbol = sym; gs.winLine = win;
    if (gs.mode === 'tournament') {
      gs.rounds[gs.currentRound][gs.currentMatch].winner = socket.id;
      io.to(room.code).emit('ttt:state', tttPublic(gs));
      io.to(room.code).emit('ttt:tournament_state', tttTournamentPublic(gs));
      addTimer(room, () => advanceTournament(room), 3000);
    } else {
      gs.scores[socket.id] = (gs.scores[socket.id] || 0) + 1;
      if (gs.bestOf > 0) {
        const needed = Math.ceil(gs.bestOf / 2);
        if (gs.scores[socket.id] >= needed) gs.matchWinner = socket.id;
      }
      io.to(room.code).emit('ttt:state', tttPublic(gs));
    }
  } else if (gs.board.every(Boolean)) {
    gs.winner = 'draw';
    io.to(room.code).emit('ttt:state', tttPublic(gs));
    if (gs.mode === 'tournament') {
      const { p1, p2 } = gs.rounds[gs.currentRound][gs.currentMatch];
      addTimer(room, () => startTournamentMatch(room, p1, p2), 2500);
    }
  } else {
    gs.currentTurn = gs.currentTurn === gs.players.X.id ? gs.players.O.id : gs.players.X.id;
    io.to(room.code).emit('ttt:state', tttPublic(gs));
  }
}

function tttNewGame(room) {
  const gs = room.gameState;
  if (!gs || gs.mode === 'tournament' || gs.matchWinner) return;
  const tmp = gs.players.X; gs.players.X = gs.players.O; gs.players.O = tmp;
  gs.board = Array(9).fill(null);
  gs.currentTurn = gs.players.X.id;
  gs.winner = null; gs.winLine = null; gs.winnerSymbol = null;
  gs.gameCount++;
  io.to(room.code).emit('ttt:state', tttPublic(gs));
  io.to(gs.players.X.id).emit('ttt:symbol', { symbol: 'X' });
  io.to(gs.players.O.id).emit('ttt:symbol', { symbol: 'O' });
}

function tttWin(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a,b,c];
  return null;
}

function tttPublic(gs) {
  return {
    mode: gs.mode || 'classic',
    board: gs.board, currentTurn: gs.currentTurn, players: gs.players,
    winner: gs.winner, winLine: gs.winLine, winnerSymbol: gs.winnerSymbol,
    scores: gs.scores || {}, gameCount: gs.gameCount || 1,
    bestOf: gs.bestOf || 0, matchWinner: gs.matchWinner || null,
  };
}

// ─────────────────────── KILLER DOCTOR ───────────────────────

function startKD(room) {
  const players = [...room.players.values()].sort(() => Math.random() - 0.5);
  const playerData = {};
  players.forEach((p, i) => {
    playerData[p.id] = { id: p.id, name: p.name,
      role: i === 0 ? 'killer' : i === 1 ? 'doctor' : 'villager',
      alive: true, hasActedNight: false, nightChoice: null, vote: null };
  });
  room.gameState = { type: 'killerdoctor', phase: 'role_reveal', playerData, round: 1, history: [] };
  players.forEach(p => io.to(p.id).emit('kd:role_assigned', {
    role: playerData[p.id].role,
    allPlayers: players.map(q => ({ id: q.id, name: q.name })),
  }));
  addTimer(room, () => kdStartNight(room), 6000);
}

function kdStartNight(room) {
  const gs = room.gameState;
  gs.phase = 'night';
  Object.values(gs.playerData).forEach(p => { p.hasActedNight = false; p.nightChoice = null; p.vote = null; });
  const alive = kdAlive(gs);
  io.to(room.code).emit('kd:night_start', {
    round: gs.round,
    livingPlayers: alive.map(p => ({ id: p.id, name: p.name })),
    deadPlayers: kdDead(gs).map(p => ({ id: p.id, name: p.name })),
  });
  const killer = kdRole(gs, 'killer'), doctor = kdRole(gs, 'doctor');
  if (killer?.alive) io.to(killer.id).emit('kd:killer_action', { targets: alive.filter(p => p.id !== killer.id).map(p => ({ id: p.id, name: p.name })) });
  else if (killer) killer.hasActedNight = true;
  if (doctor?.alive) io.to(doctor.id).emit('kd:doctor_action', { targets: alive.map(p => ({ id: p.id, name: p.name })) });
  else if (doctor) doctor.hasActedNight = true;
  const nightTime = room.settings?.nightTime ?? 45;
  addTimer(room, () => { if (room.gameState?.phase !== 'night') return; kdAutoNight(room); kdResolveNight(room); }, nightTime * 1000);
}

function kdAutoNight(room) {
  const gs = room.gameState;
  const alive = kdAlive(gs);
  const killer = kdRole(gs, 'killer'), doctor = kdRole(gs, 'doctor');
  if (killer?.alive && !killer.hasActedNight) {
    const targets = alive.filter(p => p.id !== killer.id);
    if (targets.length) { killer.nightChoice = targets[Math.floor(Math.random()*targets.length)].id; killer.hasActedNight = true; }
  }
  if (doctor?.alive && !doctor.hasActedNight) { doctor.nightChoice = doctor.id; doctor.hasActedNight = true; }
}

function kdResolveNight(room) {
  const gs = room.gameState; gs.phase = 'night_resolution';
  const killer = kdRole(gs,'killer'), doctor = kdRole(gs,'doctor');
  const kChoice = killer?.nightChoice, dChoice = doctor?.alive ? doctor?.nightChoice : null;
  let died = null, saved = false;
  if (kChoice) {
    if (kChoice === dChoice) saved = true;
    else { died = kChoice; gs.playerData[died].alive = false; }
  }
  const msg = saved ? 'The Doctor saved someone! Nobody died last night.'
    : died ? `${gs.playerData[died].name} was found dead this morning.`
    : 'A peaceful night passed.';
  if (died) gs.history.push({ name: gs.playerData[died].name, reason: 'night_kill', round: gs.round });
  io.to(room.code).emit('kd:night_result', {
    message: msg,
    died: died ? { id: died, name: gs.playerData[died].name } : null,
    saved,
    livingPlayers: kdAlive(gs).map(p => ({ id: p.id, name: p.name })),
    deadPlayers: kdDead(gs).map(p => ({ id: p.id, name: p.name })),
  });
  const win = kdCheckWin(gs);
  if (win) { addTimer(room, () => endKD(room, win), 3500); return; }
  addTimer(room, () => kdStartDay(room), 4000);
}

function checkNightDone(room) {
  const gs = room.gameState; if (gs?.phase !== 'night') return;
  const killer = kdRole(gs,'killer'), doctor = kdRole(gs,'doctor');
  const kDone = !killer?.alive || killer.hasActedNight;
  const dDone = !doctor?.alive || doctor.hasActedNight;
  if (kDone && dDone) { clearTimers(room); kdResolveNight(room); }
}

function kdStartDay(room) {
  const gs = room.gameState; gs.phase = 'day_discussion';
  const dur = room.settings?.discussionTime ?? 120;
  io.to(room.code).emit('kd:day_start', {
    round: gs.round, duration: dur,
    livingPlayers: kdAlive(gs).map(p => ({ id: p.id, name: p.name })),
    deadPlayers: kdDead(gs).map(p => ({ id: p.id, name: p.name })),
  });
  addTimer(room, () => { if (room.gameState?.phase === 'day_discussion') kdStartVoting(room); }, dur * 1000);
}

function kdStartVoting(room) {
  const gs = room.gameState; gs.phase = 'voting';
  Object.values(gs.playerData).forEach(p => { p.vote = null; });
  const dur = room.settings?.votingTime ?? 60;
  io.to(room.code).emit('kd:voting_start', {
    duration: dur,
    livingPlayers: kdAlive(gs).map(p => ({ id: p.id, name: p.name })),
    deadPlayers: kdDead(gs).map(p => ({ id: p.id, name: p.name })),
  });
  addTimer(room, () => { if (room.gameState?.phase === 'voting') kdResolveVoting(room); }, dur * 1000);
}

function kdResolveVoting(room) {
  const gs = room.gameState; gs.phase = 'vote_resolution';
  const tally = {};
  Object.values(gs.playerData).forEach(p => { if (p.alive && p.vote) tally[p.vote] = (tally[p.vote]||0) + 1; });
  let maxV = 0, elim = null, tied = false;
  Object.entries(tally).forEach(([pid, cnt]) => {
    if (cnt > maxV) { maxV = cnt; elim = pid; tied = false; }
    else if (cnt === maxV) tied = true;
  });
  let elimPlayer = null;
  if (!tied && elim && maxV > 0) {
    elimPlayer = gs.playerData[elim]; elimPlayer.alive = false;
    gs.history.push({ name: elimPlayer.name, reason: 'vote', role: elimPlayer.role, round: gs.round });
  }
  const voteDetails = Object.entries(tally).map(([pid,cnt]) => ({ id: pid, name: gs.playerData[pid]?.name, votes: cnt }));
  io.to(room.code).emit('kd:vote_result', {
    tied, voteDetails,
    eliminated: elimPlayer ? { id: elimPlayer.id, name: elimPlayer.name, role: elimPlayer.role } : null,
    message: tied ? 'The vote ended in a tie. Nobody was eliminated.'
      : elimPlayer ? `${elimPlayer.name} was eliminated by the village!`
      : 'Nobody was eliminated.',
    livingPlayers: kdAlive(gs).map(p => ({ id: p.id, name: p.name })),
    deadPlayers: kdDead(gs).map(p => ({ id: p.id, name: p.name })),
  });
  const win = kdCheckWin(gs);
  if (win) { addTimer(room, () => endKD(room, win), 5000); return; }
  gs.round++;
  addTimer(room, () => kdStartNight(room), 5000);
}

function kdCheckWin(gs) {
  const killer = kdRole(gs,'killer');
  if (!killer?.alive) return { winner: 'villagers', reason: 'The Killer has been eliminated!' };
  if (kdAlive(gs).length <= 2) return { winner: 'killer', reason: 'The Killer cannot be outvoted!' };
  return null;
}

function endKD(room, win) {
  const gs = room.gameState; gs.phase = 'game_over'; room.status = 'ended';
  io.to(room.code).emit('kd:game_over', {
    winner: win.winner, reason: win.reason,
    allPlayers: Object.values(gs.playerData).map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive })),
    history: gs.history,
  });
}

function kdAction(room, socket, data) {
  const gs = room.gameState, pd = gs.playerData?.[socket.id];
  if (!pd?.alive) return;
  switch (data.action) {
    case 'night_kill':
      if (gs.phase!=='night'||pd.role!=='killer'||pd.hasActedNight) return;
      { const t=gs.playerData[data.targetId]; if (!t?.alive||data.targetId===socket.id) return;
        pd.nightChoice=data.targetId; pd.hasActedNight=true;
        socket.emit('kd:action_confirmed',{action:'night_kill'}); checkNightDone(room); } break;
    case 'night_save':
      if (gs.phase!=='night'||pd.role!=='doctor'||pd.hasActedNight) return;
      { const t=gs.playerData[data.targetId]; if (!t?.alive) return;
        pd.nightChoice=data.targetId; pd.hasActedNight=true;
        socket.emit('kd:action_confirmed',{action:'night_save'}); checkNightDone(room); } break;
    case 'vote':
      if (gs.phase!=='voting'||data.targetId===socket.id) return;
      { const t=gs.playerData[data.targetId]; if (!t?.alive) return;
        pd.vote=data.targetId;
        const cast=Object.values(gs.playerData).filter(p=>p.alive&&p.vote!==null).length;
        const total=kdAlive(gs).length;
        io.to(room.code).emit('kd:vote_update',{cast,total});
        socket.emit('kd:vote_confirmed',{targetId:data.targetId,targetName:t.name});
        if (cast>=total){clearTimers(room);kdResolveVoting(room);} } break;
  }
}

const kdAlive = gs => Object.values(gs.playerData).filter(p => p.alive);
const kdDead  = gs => Object.values(gs.playerData).filter(p => !p.alive);
const kdRole  = (gs, role) => Object.values(gs.playerData).find(p => p.role === role);

// ─────────────────────────── SCRIBBLE ───────────────────────────

const WORDS = [
  'apple','banana','castle','dragon','elephant','fireworks','guitar','helicopter',
  'iceberg','jungle','kangaroo','lighthouse','mermaid','notebook','octopus','parachute',
  'quicksand','rainbow','spaceship','telescope','umbrella','volcano','waterfall','xylophone',
  'zebra','airplane','balloon','compass','dinosaur','envelope','fountain','gorilla',
  'hammock','island','jellyfish','kite','lantern','mushroom','necklace','orange',
  'penguin','rocket','saxophone','tornado','unicorn','vampire','whale','cactus',
  'butterfly','trampoline','campfire','sunflower','robot','treasure','pirate','ninja',
  'wizard','ghost','hamburger','pizza','anchor','bridge','crown','diamond','eagle',
  'forest','galaxy','igloo','knight','lemon','microscope','noodle','owl','river',
  'sandcastle','tiger','violin','windmill','yarn','zoo','avocado','broccoli',
  'chimney','doorbell','escalator','flamingo','giraffe','hourglass','icicle',
  'juggler','keyhole','magnet','narwhal','paintbrush','rhinoceros',
  'submarine','thermometer','typewriter','ukulele','windshield','yacht','zeppelin',
  'race car','ice cream','hot dog','palm tree','fire hydrant','roller coaster',
  'thunderstorm','snowflake','birthday cake','treasure chest','roller skates',
];

function randWords(n=3) { return [...WORDS].sort(()=>Math.random()-.5).slice(0,n); }

function maskWord(word, revealed=[]) {
  return word.split('').map((c,i) => c===' ' ? '  ' : revealed.includes(i) ? c : '_').join(' ');
}

function startScribble(room) {
  const players = [...room.players.values()];
  const order = players.map(p => p.id);
  const { drawTime=80, rounds=3, wordChoices=3 } = room.settings || {};
  room.gameState = {
    type:'scribble', phase:'choosing',
    drawerOrder: order, drawerIndex: 0,
    round: 1, maxRounds: rounds,
    word: null, masked: null, revealedIndices: [],
    scores: Object.fromEntries(order.map(id=>[id,0])),
    guessedThisRound: new Set(),
    drawingData: [],
    roundStartTime: null,
    ROUND_DURATION: drawTime,
    wordChoices,
  };
  io.to(room.code).emit('scribble:game_start', { players: scribblePlayers(room), maxRounds: rounds });
  addTimer(room, () => scribbleStartTurn(room), 2000);
}

function scribbleStartTurn(room) {
  const gs = room.gameState;
  while (gs.drawerOrder.length && !room.players.has(gs.drawerOrder[gs.drawerIndex])) {
    gs.drawerOrder.splice(gs.drawerIndex, 1);
    if (gs.drawerIndex >= gs.drawerOrder.length) gs.drawerIndex = 0;
  }
  if (!gs.drawerOrder.length) { endScribbleGame(room); return; }
  const drawerId = gs.drawerOrder[gs.drawerIndex];
  gs.phase='choosing'; gs.word=null; gs.masked=null;
  gs.revealedIndices=[]; gs.guessedThisRound=new Set(); gs.drawingData=[];
  const drawerName = room.players.get(drawerId)?.name;
  io.to(room.code).emit('scribble:turn_start', {
    drawerId, drawerName, round: gs.round, maxRounds: gs.maxRounds,
    scores: gs.scores, players: scribblePlayers(room),
  });
  const wordOpts = randWords(gs.wordChoices || 3);
  io.to(drawerId).emit('scribble:choose_word', { words: wordOpts });
  addTimer(room, () => {
    if (room.gameState?.phase === 'choosing' && !room.gameState.word)
      scribbleWordChosen(room, drawerId, wordOpts[0]);
  }, 15000);
}

function scribbleWordChosen(room, drawerId, word) {
  const gs = room.gameState; if (gs.phase !== 'choosing') return;
  gs.word=word; gs.phase='drawing'; gs.masked=maskWord(word); gs.roundStartTime=Date.now();
  io.to(drawerId).emit('scribble:draw_start', { word, masked: gs.masked, duration: gs.ROUND_DURATION });
  [...room.players.keys()].filter(id=>id!==drawerId).forEach(id =>
    io.to(id).emit('scribble:draw_start', { word: null, masked: gs.masked, duration: gs.ROUND_DURATION })
  );
  addTimer(room, () => sendHint(room), 30000);
  addTimer(room, () => sendHint(room), 55000);
  addTimer(room, () => { if (room.gameState?.phase==='drawing') endScribbleRound(room, false); }, gs.ROUND_DURATION*1000);
}

function sendHint(room) {
  const gs = room.gameState; if (!gs||gs.phase!=='drawing') return;
  const word = gs.word;
  const unrevealed = [...Array(word.length).keys()].filter(i=>word[i]!==' '&&!gs.revealedIndices.includes(i));
  if (!unrevealed.length) return;
  const idx = unrevealed[Math.floor(Math.random()*unrevealed.length)];
  gs.revealedIndices.push(idx); gs.masked = maskWord(word, gs.revealedIndices);
  const drawerId = gs.drawerOrder[gs.drawerIndex];
  [...room.players.keys()].filter(id=>id!==drawerId&&!gs.guessedThisRound.has(id))
    .forEach(id=>io.to(id).emit('scribble:hint',{masked:gs.masked}));
}

function endScribbleRound(room, allGuessed) {
  const gs = room.gameState; if (gs.phase!=='drawing'&&gs.phase!=='choosing') return;
  gs.phase='round_end';
  io.to(room.code).emit('scribble:round_end', { word:gs.word, scores:gs.scores, players:scribblePlayers(room), allGuessed });
  addTimer(room, () => advanceScribble(room), 5000);
}

function advanceScribble(room) {
  const gs = room.gameState;
  gs.drawerIndex++;
  if (gs.drawerIndex >= gs.drawerOrder.length) {
    gs.drawerIndex=0; gs.round++;
    if (gs.round > gs.maxRounds) { endScribbleGame(room); return; }
  }
  scribbleStartTurn(room);
}

function endScribbleGame(room) {
  const gs = room.gameState; gs.phase='game_over'; room.status='ended';
  const ranked = scribblePlayers(room).sort((a,b)=>(gs.scores[b.id]||0)-(gs.scores[a.id]||0));
  io.to(room.code).emit('scribble:game_over', { scores:gs.scores, players:ranked, winner:ranked[0] });
}

function scribbleAction(room, socket, data) {
  const gs = room.gameState; if (!gs) return;
  const drawerId = gs.drawerOrder[gs.drawerIndex];
  switch (data.action) {
    case 'choose_word':
      if (socket.id===drawerId&&gs.phase==='choosing') { clearTimers(room); scribbleWordChosen(room,drawerId,data.word); } break;
    case 'draw':
      if (socket.id!==drawerId||gs.phase!=='drawing') return;
      gs.drawingData.push(data.stroke); socket.to(room.code).emit('scribble:draw',{stroke:data.stroke}); break;
    case 'clear':
      if (socket.id!==drawerId||gs.phase!=='drawing') return;
      gs.drawingData=[]; io.to(room.code).emit('scribble:clear'); break;
    case 'fill':
      if (socket.id!==drawerId||gs.phase!=='drawing') return;
      gs.drawingData.push({type:'fill',x:data.x,y:data.y,color:data.color});
      socket.to(room.code).emit('scribble:draw',{stroke:{type:'fill',x:data.x,y:data.y,color:data.color}}); break;
  }
}

const scribblePlayers = room => {
  const gs = room.gameState;
  return [...room.players.values()].map(p => ({ id:p.id, name:p.name, score:gs?.scores?.[p.id]||0 }));
};

// ─────────────────────────── START ───────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\n🎮  GameNight is live!\n');
  console.log(`  Local:    http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Network:  http://${ip}:${PORT}  ← share with friends!`));
  console.log('\n  Open in any browser on the same WiFi / LAN.\n');
});
