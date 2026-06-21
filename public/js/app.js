// ═══════════════════ GLOBAL STATE ═══════════════════
const App = {
  socket: io(),
  myId: null,
  myName: '',
  roomCode: '',
  gameType: '',
  isHost: false,
  selectedGame: 'killerdoctor',
  currentSettings: {},
};

// ═══════════════════ SETTINGS SCHEMA (client-side) ═══════════════════
const SETTINGS_SCHEMA = {
  scribble: [
    { id: 'drawTime', label: 'Draw Time', default: 80,
      options: [{v:40,l:'40 sec'},{v:60,l:'60 sec'},{v:80,l:'80 sec ★'},{v:100,l:'100 sec'},{v:120,l:'2 min'}] },
    { id: 'rounds', label: 'Rounds', default: 3,
      options: [{v:2,l:'2 rounds'},{v:3,l:'3 rounds ★'},{v:4,l:'4 rounds'},{v:5,l:'5 rounds'}] },
    { id: 'wordChoices', label: 'Word Choices per Turn', default: 3,
      options: [{v:2,l:'2 words'},{v:3,l:'3 words ★'},{v:4,l:'4 words'}] },
  ],
  killerdoctor: [
    { id: 'discussionTime', label: 'Discussion Time', default: 120,
      options: [{v:60,l:'1 min'},{v:90,l:'90 sec'},{v:120,l:'2 min ★'},{v:150,l:'2.5 min'},{v:180,l:'3 min'}] },
    { id: 'votingTime', label: 'Voting Time', default: 60,
      options: [{v:30,l:'30 sec'},{v:45,l:'45 sec'},{v:60,l:'60 sec ★'},{v:90,l:'90 sec'}] },
    { id: 'nightTime', label: 'Night Action Time', default: 45,
      options: [{v:30,l:'30 sec'},{v:45,l:'45 sec ★'},{v:60,l:'60 sec'}] },
  ],
  tictactoe: [
    { id: 'bestOf', label: 'Match Format', default: 0,
      options: [{v:0,l:'Free Play ★'},{v:3,l:'Best of 3'},{v:5,l:'Best of 5'},{v:7,l:'Best of 7'}] },
  ],
};

// ═══════════════════ VIEW MANAGEMENT ═══════════════════
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${id}`);
  if (el) el.classList.add('active');
}

function showLoading(on) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !on);
}

function toast(msg, duration = 3000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ═══════════════════ AVATAR ═══════════════════
const AVATAR_COLORS = ['#7c3aed','#0ea5e9','#10b981','#f97316','#ef4444','#ec4899','#8b5cf6','#14b8a6'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFFFF;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function avatarEl(name, size = 40) {
  const div = document.createElement('div');
  div.className = 'player-avatar';
  div.style.cssText = `width:${size}px;height:${size}px;background:${avatarColor(name)};font-size:${Math.round(size*0.4)}px`;
  div.textContent = (name || '?').slice(0,2).toUpperCase();
  return div;
}

// ═══════════════════ RULES MODAL ═══════════════════
function initRulesModal() {
  const modal = document.getElementById('rules-modal');
  document.getElementById('close-rules').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  document.querySelectorAll('.rules-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rules-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.rules-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`rules-${tab.dataset.game}`)?.classList.add('active');
    });
  });

  document.getElementById('btn-rules-home').addEventListener('click', () => {
    openRules(App.selectedGame);
  });
  document.getElementById('btn-rules-lobby').addEventListener('click', () => {
    openRules(App.gameType || App.selectedGame);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') modal.classList.add('hidden');
  });
}

function openRules(gameType) {
  const modal = document.getElementById('rules-modal');
  modal.classList.remove('hidden');
  // Activate correct tab
  const tab = document.querySelector(`.rules-tab[data-game="${gameType}"]`);
  if (tab) {
    document.querySelectorAll('.rules-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rules-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`rules-${gameType}`)?.classList.add('active');
  }
}

// ═══════════════════ LOBBY SETTINGS ═══════════════════
function initSettings() {
  const toggleBtn = document.getElementById('btn-settings-toggle');
  const body = document.getElementById('lobby-settings-body');
  const chevron = document.getElementById('settings-chevron');

  toggleBtn.addEventListener('click', () => {
    const open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    chevron.classList.toggle('open', !open);
  });

  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
}

function renderSettings(gameType, settings, isHost) {
  const schema = SETTINGS_SCHEMA[gameType] || [];
  const fields = document.getElementById('lobby-settings-fields');
  fields.innerHTML = '';

  schema.forEach(field => {
    const currentVal = settings?.[field.id] ?? field.default;
    const wrap = document.createElement('div');
    wrap.className = 'settings-field';

    const label = document.createElement('label');
    label.textContent = field.label;
    wrap.appendChild(label);

    if (isHost) {
      const sel = document.createElement('select');
      sel.id = `setting-${field.id}`;
      field.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.v;
        o.textContent = opt.l;
        if (+opt.v === +currentVal) o.selected = true;
        sel.appendChild(o);
      });
      wrap.appendChild(sel);
    } else {
      const val = document.createElement('div');
      val.className = 'settings-val';
      const opt = field.options.find(o => +o.v === +currentVal);
      val.textContent = opt ? opt.l.replace(' ★','') : currentVal;
      wrap.appendChild(val);
    }

    fields.appendChild(wrap);
  });

  document.getElementById('settings-host-actions').classList.toggle('hidden', !isHost || schema.length === 0);
  document.getElementById('settings-saved-msg').classList.add('hidden');
}

function saveSettings() {
  const schema = SETTINGS_SCHEMA[App.gameType] || [];
  const newSettings = {};
  schema.forEach(field => {
    const el = document.getElementById(`setting-${field.id}`);
    if (el) newSettings[field.id] = el.value;
  });
  App.socket.emit('room:settings', newSettings);
  const msg = document.getElementById('settings-saved-msg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);
}

// ═══════════════════ HOME SCREEN ═══════════════════
function initHome() {
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.game-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      App.selectedGame = card.dataset.game;
    });
  });
  document.querySelector('[data-game="killerdoctor"]').classList.add('selected');
  App.selectedGame = 'killerdoctor';

  document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('inp-name').value.trim();
    if (!name) { showError('home-error', 'Please enter your name.'); return; }
    App.myName = name;
    showLoading(true);
    App.socket.emit('room:create', { gameType: App.selectedGame, playerName: name });
  });

  document.getElementById('btn-join').addEventListener('click', doJoin);
  document.getElementById('inp-code').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
  document.getElementById('inp-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const code = document.getElementById('inp-code').value.trim();
      if (code) doJoin(); else document.getElementById('btn-create').click();
    }
  });
}

function doJoin() {
  const name = document.getElementById('inp-name').value.trim();
  const code = document.getElementById('inp-code').value.trim().toUpperCase();
  if (!name) { showError('home-error', 'Please enter your name.'); return; }
  if (!code) { showError('home-error', 'Please enter a room code.'); return; }
  App.myName = name;
  showLoading(true);
  App.socket.emit('room:join', { code, playerName: name });
}

// ═══════════════════ LOBBY ═══════════════════
function initLobby() {
  document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(App.roomCode).then(() => toast('Room code copied!')).catch(() => {
      // Fallback for non-HTTPS
      const el = document.createElement('textarea');
      el.value = App.roomCode;
      document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      el.remove(); toast('Room code copied!');
    });
  });
  document.getElementById('btn-leave').addEventListener('click', () => location.reload());
  document.getElementById('btn-start').addEventListener('click', () => App.socket.emit('game:start'));
}

function renderLobby({ players, code, gameType, hostId, minPlayers, settings }) {
  App.roomCode = code;
  App.isHost = hostId === App.myId;
  App.currentSettings = settings || {};

  const gameNames = { tictactoe: 'Tic Tac Toe', killerdoctor: 'Killer Doctor', scribble: 'Scribble' };
  document.getElementById('lobby-title').textContent = gameNames[gameType] || 'Lobby';
  document.getElementById('lobby-code').textContent = code;

  const grid = document.getElementById('lobby-players');
  grid.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'lobby-player-card' + (p.isHost ? ' is-host' : '');
    card.appendChild(avatarEl(p.name, 48));
    const nameEl = document.createElement('div');
    nameEl.className = 'lobby-player-name';
    nameEl.textContent = p.name + (p.id === App.myId ? ' (You)' : '');
    card.appendChild(nameEl);
    if (p.isHost) { const cr = document.createElement('div'); cr.className = 'host-crown'; cr.textContent = '👑 Host'; card.appendChild(cr); }
    grid.appendChild(card);
  });

  const enough = players.length >= minPlayers;
  document.getElementById('lobby-status').textContent = enough
    ? `${players.length} players ready — host can start!`
    : `Waiting for players… (${players.length}/${minPlayers} minimum)`;

  const startBtn = document.getElementById('btn-start');
  startBtn.disabled = !enough || !App.isHost;
  startBtn.textContent = App.isHost ? 'Start Game' : 'Waiting for host…';

  renderSettings(gameType, settings, App.isHost);
}

// ═══════════════════ SOCKET EVENTS ═══════════════════
App.socket.on('connect', () => { App.myId = App.socket.id; });

App.socket.on('room:joined', ({ code, isHost, gameType }) => {
  showLoading(false);
  App.roomCode = code;
  App.isHost = isHost;
  App.gameType = gameType;
  showView('lobby');
});

App.socket.on('room:error', ({ msg }) => {
  showLoading(false);
  showError('home-error', msg);
});

App.socket.on('lobby:update', data => {
  App.gameType = data.gameType;
  renderLobby(data);
});

App.socket.on('lobby:settings', settings => {
  App.currentSettings = settings;
  renderSettings(App.gameType, settings, App.isHost);
  if (!App.isHost) toast('Host updated game settings');
});

App.socket.on('notification', msg => toast(msg));
App.socket.on('game:restarting', () => toast('New game starting…'));
App.socket.on('game:back_to_lobby', () => showView('lobby'));

// Game start triggers
App.socket.on('kd:role_assigned', data  => { showView('killerdoctor'); KillerDoctor.onRoleAssigned(data); });
App.socket.on('ttt:state',        data  => { showView('tictactoe');    TicTacToe.onState(data); });
App.socket.on('ttt:symbol',       data  =>   TicTacToe.onSymbol(data));
App.socket.on('ttt:player_left',  data  =>   TicTacToe.onPlayerLeft(data));
App.socket.on('scribble:game_start', data => { showView('scribble');  Scribble.onStart(data); });
App.socket.on('scribble:reconnect',  data => { showView('scribble');  Scribble.onReconnect(data); });
App.socket.on('kd:reconnect',    data  => { showView('killerdoctor'); KillerDoctor.onReconnect(data); });

// ═══════════════════ INIT ═══════════════════
document.addEventListener('DOMContentLoaded', () => {
  initHome();
  initLobby();
  initRulesModal();
  initSettings();
  TicTacToe.init();
  KillerDoctor.init();
  Scribble.init();
});
