// ═══════════════════ AVATARS ═══════════════════
const AVATARS = [
  { emoji: '🧙', name: 'Wizard' },   { emoji: '⚔️', name: 'Warrior' },
  { emoji: '🏹', name: 'Archer' },   { emoji: '🛡️', name: 'Knight' },
  { emoji: '🔮', name: 'Seer' },     { emoji: '🗡️', name: 'Rogue' },
  { emoji: '🦊', name: 'Fox' },      { emoji: '🐺', name: 'Wolf' },
  { emoji: '🦅', name: 'Eagle' },    { emoji: '🧝', name: 'Elf' },
  { emoji: '🤺', name: 'Duelist' },  { emoji: '🧛', name: 'Vampire' },
  { emoji: '🧟', name: 'Ghost' },    { emoji: '🧜', name: 'Mermaid' },
  { emoji: '🎭', name: 'Jester' },   { emoji: '👑', name: 'King' },
  { emoji: '🐉', name: 'Dragon' },   { emoji: '🦁', name: 'Lion' },
  { emoji: '🐻', name: 'Bear' },     { emoji: '🦄', name: 'Unicorn' },
  { emoji: '🐙', name: 'Octopus' },  { emoji: '🦝', name: 'Raccoon' },
  { emoji: '🐧', name: 'Penguin' },  { emoji: '🦋', name: 'Butterfly' },
  { emoji: '🐸', name: 'Frog' },     { emoji: '🦩', name: 'Flamingo' },
  { emoji: '🐯', name: 'Tiger' },    { emoji: '🦀', name: 'Crab' },
  { emoji: '🦜', name: 'Parrot' },   { emoji: '🐳', name: 'Whale' },
  { emoji: '🦈', name: 'Shark' },    { emoji: '🤖', name: 'Robot' },
  { emoji: '🧞', name: 'Genie' },    { emoji: '🦸', name: 'Hero' },
  { emoji: '🐊', name: 'Croc' },     { emoji: '🦉', name: 'Owl' },
  { emoji: '🐬', name: 'Dolphin' },  { emoji: '🦦', name: 'Otter' },
  { emoji: '🐘', name: 'Elephant' }, { emoji: '🐒', name: 'Monkey' },
  { emoji: '🦒', name: 'Giraffe' },
];

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
  myAvatar: 0,
};

// ═══════════════════ SETTINGS SCHEMA (client-side) ═══════════════════
const SETTINGS_SCHEMA = {
  scribble: [
    { id: 'drawTime', label: 'Draw Time', default: 45, isTime: true,
      options: [{v:40,l:'40 sec'},{v:60,l:'60 sec'},{v:80,l:'80 sec ★'},{v:100,l:'100 sec'},{v:120,l:'2 min'}] },
    { id: 'rounds', label: 'Rounds', default: 3,
      options: [{v:2,l:'2 rounds'},{v:3,l:'3 rounds ★'},{v:4,l:'4 rounds'},{v:5,l:'5 rounds'}] },
    { id: 'wordChoices', label: 'Word Choices per Turn', default: 3,
      options: [{v:2,l:'2 words'},{v:3,l:'3 words ★'},{v:4,l:'4 words'}] },
  ],
  killerdoctor: [
    { id: 'discussionTime', label: 'Discussion Time', default: 45, isTime: true,
      options: [{v:60,l:'1 min'},{v:90,l:'90 sec'},{v:120,l:'2 min ★'},{v:150,l:'2.5 min'},{v:180,l:'3 min'}] },
    { id: 'votingTime', label: 'Voting Time', default: 45, isTime: true,
      options: [{v:30,l:'30 sec'},{v:45,l:'45 sec'},{v:60,l:'60 sec ★'},{v:90,l:'90 sec'}] },
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

function toast(msg, duration = 3000, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` toast-${type}` : '');
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function showCountdown() {
  document.getElementById('game-countdown')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'game-countdown';
  overlay.className = 'countdown-overlay';
  document.body.appendChild(overlay);
  const steps = ['3','2','1','GO!'];
  let i = 0;
  function step() {
    overlay.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'countdown-num' + (steps[i] === 'GO!' ? ' go' : '');
    el.textContent = steps[i];
    overlay.appendChild(el);
    i++;
    if (i < steps.length) setTimeout(step, 800);
    else setTimeout(() => {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    }, 600);
  }
  step();
}

function showConfirm(message, onConfirm, opts = {}) {
  const { confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = opts;
  document.getElementById('confirm-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-modal';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML =
    `<div class="confirm-box">` +
    `<p class="confirm-msg">${message}</p>` +
    `<div class="confirm-actions">` +
    `<button class="btn-ghost confirm-cancel">${cancelText}</button>` +
    `<button class="${danger ? 'btn-danger' : 'btn-primary'} confirm-ok">${confirmText}</button>` +
    `</div></div>`;
  document.body.appendChild(overlay);

  const cleanup = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const doConfirm = () => { cleanup(); onConfirm(); };

  overlay.querySelector('.confirm-cancel').addEventListener('click', cleanup);
  overlay.querySelector('.confirm-ok').addEventListener('click', doConfirm);
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });

  function onKey(e) {
    if (e.key === 'Escape') cleanup();
    if (e.key === 'Enter') doConfirm();
  }
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.confirm-ok').focus();
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

    if (isHost && field.isTime) {
      const input = document.createElement('input');
      input.type = 'number';
      input.id = `setting-${field.id}`;
      input.min = 10;
      input.max = 600;
      input.value = currentVal;
      input.placeholder = 'seconds (10–600)';
      input.className = 'custom-time-input';
      wrap.appendChild(input);
    } else if (isHost) {
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
      if (field.isTime) {
        val.textContent = `${currentVal}s`;
      } else {
        const opt = field.options.find(o => +o.v === +currentVal);
        val.textContent = opt ? opt.l.replace(' ★','') : currentVal;
      }
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
    if (!el) return;
    if (field.isTime) {
      const val = parseInt(el.value, 10);
      if (!isNaN(val) && val >= 10 && val <= 600) {
        newSettings[field.id] = val;
      } else {
        showError('home-error', `${field.label}: enter a value between 10 and 600 seconds.`);
      }
    } else {
      newSettings[field.id] = el.value;
    }
  });
  App.socket.emit('room:settings', newSettings);
  const msg = document.getElementById('settings-saved-msg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);
}

// ═══════════════════ AVATAR PICKER ═══════════════════
const NAME_AVATARS = {
  'abhijat': 11,   // 🧛 Vampire
  'vikas': 6,      // 🦊 Fox
  'pranav': 40,    // 🦒 Giraffe
  'devaansh': 39,  // 🐒 Monkey
  'harshit': 37,   // 🦦 Otter
  'deepak': 7,     // 🐺 Wolf
  'abhishek': 24,  // 🐸 Frog
  'piyush': 26,    // 🐯 Tiger
  'arnav': 8,      // 🦅 Eagle
  'suryansh': 16,  // 🐉 Dragon
  'garima': 19,    // 🦄 Unicorn
  'priyanshi': 21, // 🦝 Raccoon
};

function selectAvatar(idx) {
  App.myAvatar = idx;
  localStorage.setItem('gn_avatar', idx);
  document.querySelectorAll('.avatar-opt').forEach((btn, i) => {
    btn.classList.toggle('selected', i === idx);
    btn.classList.remove('avatar-opt-enter');
  });
  document.querySelectorAll('.avatar-opt')[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function initAvatarPicker() {
  const saved = parseInt(localStorage.getItem('gn_avatar') || '0', 10);
  App.myAvatar = (saved >= 0 && saved < AVATARS.length) ? saved : 0;

  const grid = document.getElementById('avatar-picker');
  AVATARS.forEach((av, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-opt' + (i === App.myAvatar ? ' selected' : ' avatar-opt-enter');
    btn.style.animationDelay = `${i * 0.018}s`;
    btn.textContent = av.emoji;
    btn.title = av.name;
    btn.addEventListener('animationend', () => btn.classList.remove('avatar-opt-enter'));
    btn.addEventListener('click', () => selectAvatar(i));
    grid.appendChild(btn);
  });
}

// ═══════════════════ HOME SCREEN ═══════════════════
function initHome() {
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) document.getElementById('inp-code').value = urlCode.toUpperCase();

  document.getElementById('inp-name').addEventListener('input', () => {
    const key = document.getElementById('inp-name').value.trim().toLowerCase();
    if (NAME_AVATARS[key] !== undefined) selectAvatar(NAME_AVATARS[key]);
  });

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
    App.socket.emit('room:create', { gameType: App.selectedGame, playerName: name, avatar: App.myAvatar });
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
  App.socket.emit('room:join', { code, playerName: name, avatar: App.myAvatar });
}

// ═══════════════════ CLIPBOARD ═══════════════════
function copyText(text, msg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => fallbackCopy(text, msg));
  } else {
    fallbackCopy(text, msg);
  }
}

function fallbackCopy(text, msg) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(el);
  el.focus(); el.select();
  try { document.execCommand('copy'); toast(msg); }
  catch { toast('Copy failed — code: ' + text, 4000, 'error'); }
  el.remove();
}

// ═══════════════════ LOBBY ═══════════════════
function initLobby() {
  document.getElementById('btn-copy').addEventListener('click', () => {
    copyText(App.roomCode, 'Room code copied!');
  });

  document.getElementById('btn-share').addEventListener('click', () => {
    const url = `${window.location.origin}${window.location.pathname}?code=${App.roomCode}`;
    copyText(url, 'Invite link copied!');
  });

  document.getElementById('btn-leave').addEventListener('click', () => location.reload());
  document.getElementById('btn-start').addEventListener('click', () => App.socket.emit('game:start'));
}

function renderLobby({ players, code, gameType, hostId, minPlayers, settings, sessionStats }) {
  App.roomCode = code;
  App.isHost = hostId === App.myId;
  App.currentSettings = settings || {};

  const gameNames = { tictactoe: 'Tic Tac Toe', killerdoctor: 'Killer Doctor', scribble: 'Scribble' };
  document.getElementById('lobby-title').textContent = gameNames[gameType] || 'Lobby';
  document.getElementById('lobby-code').textContent = code;

  const grid = document.getElementById('lobby-players');
  grid.innerHTML = '';
  players.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'lobby-player-card' + (p.isHost ? ' is-host' : '') + ' lobby-card-enter';
    card.style.animationDelay = `${idx * 0.07}s`;
    const av = document.createElement('div');
    av.className = 'lobby-player-emoji';
    av.textContent = AVATARS[p.avatar ?? 0].emoji;
    card.appendChild(av);
    const nameEl = document.createElement('div');
    nameEl.className = 'lobby-player-name';
    nameEl.textContent = p.name + (p.id === App.myId ? ' (You)' : '');
    card.appendChild(nameEl);
    if (p.isHost) { const cr = document.createElement('div'); cr.className = 'host-crown'; cr.textContent = '👑 Host'; card.appendChild(cr); }
    if (App.isHost && p.id !== App.myId) {
      const controls = document.createElement('div');
      controls.className = 'host-controls';
      const transferBtn = document.createElement('button');
      transferBtn.className = 'btn-host-ctrl';
      transferBtn.title = 'Make host';
      transferBtn.textContent = '👑';
      transferBtn.addEventListener('click', () => {
        showConfirm(`Make ${p.name} the host?`, () => App.socket.emit('room:transfer_host', { playerId: p.id }), { confirmText: 'Make Host' });
      });
      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn-host-ctrl btn-kick-ctrl';
      kickBtn.title = 'Kick player';
      kickBtn.textContent = '🚫';
      kickBtn.addEventListener('click', () => {
        showConfirm(`Kick ${p.name}?`, () => App.socket.emit('room:kick', { playerId: p.id }), { confirmText: 'Kick', danger: true });
      });
      controls.appendChild(transferBtn);
      controls.appendChild(kickBtn);
      card.appendChild(controls);
    }
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
  renderSessionStats(sessionStats);
}

function renderSessionStats(stats) {
  const el = document.getElementById('lobby-session-stats');
  if (!stats || !Object.keys(stats).length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const body = el.querySelector('.stats-body');
  body.innerHTML = '';
  const sorted = Object.values(stats).sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed);
  const medals = ['🥇', '🥈', '🥉'];
  sorted.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'stats-row';
    row.innerHTML = `<span class="stats-rank">${medals[i] || (i + 1) + '.'}</span>` +
      `<span class="stats-name">${s.name}</span>` +
      `<span class="stats-record">${s.wins}W / ${s.gamesPlayed}G</span>`;
    body.appendChild(row);
  });
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
App.socket.on('game:starting', () => showCountdown());
App.socket.on('game:back_to_lobby', () => showView('lobby'));

App.socket.on('room:kicked', () => {
  showView('home');
  showLoading(false);
  toast('You were removed from the room.', 4000, 'error');
});

// Game start triggers
App.socket.on('kd:role_assigned', data  => { showView('killerdoctor'); KillerDoctor.onRoleAssigned(data); });
App.socket.on('ttt:state',        data  => { showView('tictactoe');    TicTacToe.onState(data); });
App.socket.on('ttt:symbol',       data  =>   TicTacToe.onSymbol(data));
App.socket.on('ttt:player_left',  data  =>   TicTacToe.onPlayerLeft(data));
App.socket.on('ttt:tournament_state', data => { showView('tictactoe'); });  // handled inside TicTacToe module
App.socket.on('scribble:game_start', data => { showView('scribble');  Scribble.onStart(data); });
App.socket.on('scribble:reconnect',  data => { showView('scribble');  Scribble.onReconnect(data); });
App.socket.on('kd:reconnect',    data  => {
  if (data.avatar !== undefined) App.myAvatar = data.avatar;
  showView('killerdoctor');
  KillerDoctor.onReconnect(data);
});

// ═══════════════════ INIT ═══════════════════
document.addEventListener('DOMContentLoaded', () => {
  initAvatarPicker();
  initHome();
  initLobby();
  initRulesModal();
  initSettings();
  TicTacToe.init();
  KillerDoctor.init();
  Scribble.init();
});
