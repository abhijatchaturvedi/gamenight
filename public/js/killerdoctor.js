const KillerDoctor = (() => {
  let myRole = null;
  let roleVisible = true;
  let timerInterval = null;

  const ROLE_INFO = {
    killer:   { icon: '🔪', color: '#ef4444', desc: 'Kill one player each night. Stay hidden.' },
    doctor:   { icon: '💉', color: '#10b981', desc: 'Save one player each night. Protect the village.' },
    villager: { icon: '🧑', color: '#94a3b8', desc: 'Find and vote out the Killer before it\'s too late.' },
  };

  function init() {
    document.getElementById('kd-toggle-role').addEventListener('click', toggleRole);

    document.getElementById('kd-chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendChat();
    });
    document.getElementById('kd-chat-send').addEventListener('click', sendChat);
    document.getElementById('kd-btn-again').addEventListener('click', () => App.socket.emit('game:restart'));
    document.getElementById('kd-btn-lobby').addEventListener('click', () => App.socket.emit('game:back_to_lobby'));

    App.socket.on('kd:night_start', onNightStart);
    App.socket.on('kd:killer_action', onKillerAction);
    App.socket.on('kd:doctor_action', onDoctorAction);
    App.socket.on('kd:action_confirmed', onActionConfirmed);
    App.socket.on('kd:night_result', onNightResult);
    App.socket.on('kd:day_start', onDayStart);
    App.socket.on('kd:voting_start', onVotingStart);
    App.socket.on('kd:vote_update', onVoteUpdate);
    App.socket.on('kd:vote_confirmed', onVoteConfirmed);
    App.socket.on('kd:vote_result', onVoteResult);
    App.socket.on('kd:game_over', onGameOver);
    App.socket.on('chat:message', onChatMessage);
  }

  function setPhase(phase) {
    document.querySelectorAll('.kd-phase').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`kd-phase-${phase}`);
    if (el) el.classList.add('active');
    clearInterval(timerInterval);
  }

  function startTimer(elId, seconds) {
    clearInterval(timerInterval);
    const el = document.getElementById(elId);
    let remaining = seconds;
    function tick() {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      el.classList.toggle('danger', remaining <= 15);
      remaining--;
      if (remaining < 0) clearInterval(timerInterval);
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function toggleRole() {
    roleVisible = !roleVisible;
    const card = document.getElementById('kd-role-card');
    const roleNameEl = document.getElementById('kd-role-name');
    const btn = document.getElementById('kd-toggle-role');
    if (roleVisible) {
      const info = ROLE_INFO[myRole] || {};
      roleNameEl.textContent = `${info.icon || ''} ${myRole?.toUpperCase() || '—'}`;
      card.classList.remove('hidden-role');
      btn.textContent = 'Hide Role';
    } else {
      roleNameEl.textContent = '🂠 Hidden';
      card.classList.add('hidden-role');
      btn.textContent = 'Show Role';
    }
  }

  function setRole(role, alive = true) {
    myRole = role;
    const info = ROLE_INFO[role] || {};
    const card = document.getElementById('kd-role-card');
    card.dataset.role = role;
    document.getElementById('kd-role-name').textContent = `${info.icon || ''} ${role?.toUpperCase() || '—'}`;
    document.getElementById('kd-role-desc').textContent = info.desc || '';
    document.getElementById('kd-you-status').textContent = alive ? '🟢 Alive' : '💀 Dead';
    roleVisible = true;
    card.classList.remove('hidden-role');
    document.getElementById('kd-toggle-role').textContent = 'Hide Role';
  }

  function renderPlayerList(living, dead) {
    const list = document.getElementById('kd-player-list');
    list.innerHTML = '';
    const all = [...(living || []).map(p => ({...p, alive: true})), ...(dead || []).map(p => ({...p, alive: false}))];
    all.forEach(p => {
      const item = document.createElement('div');
      item.className = 'kd-player-item' + (p.alive ? '' : ' dead');
      const av = document.createElement('div');
      av.className = 'mini-avatar';
      av.style.background = avatarColor(p.name);
      av.textContent = p.name.slice(0,2).toUpperCase();
      const nameWrap = document.createElement('div');
      nameWrap.className = 'player-name-wrap';
      nameWrap.textContent = p.name;
      if (p.id === App.myId) {
        const tag = document.createElement('span');
        tag.className = 'you-tag'; tag.textContent = ' (you)';
        nameWrap.appendChild(tag);
      }
      item.appendChild(av);
      item.appendChild(nameWrap);
      if (!p.alive) { const skull = document.createElement('span'); skull.textContent = '💀'; item.appendChild(skull); }
      list.appendChild(item);
    });
  }

  function addHistory(entry) {
    const hist = document.getElementById('kd-history');
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = entry;
    hist.insertBefore(item, hist.firstChild);
  }

  function onRoleAssigned({ role, allPlayers }) {
    setRole(role);
    renderPlayerList(allPlayers, []);
    setPhase('reveal');
    document.getElementById('kd-chat-messages').innerHTML = '';
    document.getElementById('kd-history').innerHTML = '';
  }

  function onReconnect({ role, phase, alive }) {
    setRole(role, alive);
    // Show appropriate phase — simplified reconnect shows current state
    setPhase(phase === 'night' ? 'night' :
             phase === 'night_resolution' ? 'night-result' :
             phase === 'day_discussion' ? 'discussion' :
             phase === 'voting' ? 'voting' :
             phase === 'vote_resolution' ? 'vote-result' :
             phase === 'game_over' ? 'gameover' : 'reveal');
  }

  function onNightStart({ round, livingPlayers, deadPlayers }) {
    renderPlayerList(livingPlayers, deadPlayers);
    addHistory(`Night ${round} began.`);
    document.getElementById('kd-night-title').textContent = `Night ${round}`;
    document.getElementById('kd-night-subtitle').textContent = 'The village sleeps…';
    document.getElementById('kd-night-action').classList.add('hidden');
    document.getElementById('kd-night-timer').classList.remove('hidden');
    setPhase('night');
    startTimer('kd-night-timer', 45);
  }

  function onKillerAction({ targets }) {
    const panel = document.getElementById('kd-night-action');
    document.getElementById('kd-action-title').textContent = '🔪 Choose your victim';
    document.getElementById('kd-action-desc').textContent = 'Select a player to eliminate tonight.';
    document.getElementById('kd-action-done').classList.add('hidden');
    const grid = document.getElementById('kd-action-targets');
    grid.innerHTML = '';
    targets.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'target-btn';
      const av = document.createElement('div');
      av.className = 'mini-avatar';
      av.style.cssText = `width:32px;height:32px;background:${avatarColor(t.name)};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:#fff`;
      av.textContent = t.name.slice(0,2).toUpperCase();
      btn.appendChild(av);
      btn.appendChild(document.createTextNode(t.name));
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        App.socket.emit('game:action', { action: 'night_kill', targetId: t.id });
      });
      grid.appendChild(btn);
    });
    panel.classList.remove('hidden');
  }

  function onDoctorAction({ targets }) {
    const panel = document.getElementById('kd-night-action');
    document.getElementById('kd-action-title').textContent = '💉 Choose who to save';
    document.getElementById('kd-action-desc').textContent = 'Select a player to protect tonight. You may save yourself.';
    document.getElementById('kd-action-done').classList.add('hidden');
    const grid = document.getElementById('kd-action-targets');
    grid.innerHTML = '';
    targets.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'target-btn';
      const av = document.createElement('div');
      av.className = 'mini-avatar';
      av.style.cssText = `width:32px;height:32px;background:${avatarColor(t.name)};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:#fff`;
      av.textContent = t.name.slice(0,2).toUpperCase();
      btn.appendChild(av);
      btn.appendChild(document.createTextNode(t.name + (t.id === App.myId ? ' (You)' : '')));
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        App.socket.emit('game:action', { action: 'night_save', targetId: t.id });
      });
      grid.appendChild(btn);
    });
    panel.classList.remove('hidden');
  }

  function onActionConfirmed({ action }) {
    document.getElementById('kd-action-done').textContent = action === 'night_kill' ? '✓ Target selected' : '✓ Save submitted';
    document.getElementById('kd-action-done').classList.remove('hidden');
    document.querySelectorAll('#kd-action-targets .target-btn').forEach(b => b.disabled = true);
  }

  function onNightResult({ message, died, livingPlayers, deadPlayers }) {
    renderPlayerList(livingPlayers, deadPlayers);
    if (died) {
      addHistory(`${died.name} died in the night.`);
      document.getElementById('kd-you-status').textContent = died.id === App.myId ? '💀 Dead' : document.getElementById('kd-you-status').textContent;
    } else {
      addHistory('Nobody died in the night.');
    }
    document.getElementById('kd-night-msg').textContent = message;
    setPhase('night-result');
  }

  function onDayStart({ round, duration, livingPlayers, deadPlayers }) {
    renderPlayerList(livingPlayers, deadPlayers);
    document.getElementById('kd-day-title').textContent = `Day ${round} — Discussion`;
    document.getElementById('kd-chat-messages').innerHTML = '';
    const isAlive = livingPlayers.some(p => p.id === App.myId);
    document.getElementById('kd-chat-input').disabled = !isAlive;
    document.getElementById('kd-chat-send').disabled = !isAlive;
    setPhase('discussion');
    startTimer('kd-day-timer', duration);
  }

  function onVotingStart({ duration, livingPlayers, deadPlayers }) {
    renderPlayerList(livingPlayers, deadPlayers);
    const isAlive = livingPlayers.some(p => p.id === App.myId);
    document.getElementById('kd-dead-notice').classList.toggle('hidden', isAlive);
    document.getElementById('kd-voted-notice').classList.add('hidden');
    const grid = document.getElementById('kd-vote-targets');
    grid.innerHTML = '';
    livingPlayers.filter(p => p.id !== App.myId).forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'vote-btn';
      btn.disabled = !isAlive;
      const av = document.createElement('div');
      av.className = 'mini-avatar';
      av.style.cssText = `width:40px;height:40px;background:${avatarColor(t.name)};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700;color:#fff`;
      av.textContent = t.name.slice(0,2).toUpperCase();
      btn.appendChild(av);
      btn.appendChild(document.createTextNode(t.name));
      btn.addEventListener('click', () => {
        if (!isAlive) return;
        grid.querySelectorAll('.vote-btn').forEach(b => { b.classList.remove('voted'); b.disabled = true; });
        btn.classList.add('voted');
        App.socket.emit('game:action', { action: 'vote', targetId: t.id });
      });
      grid.appendChild(btn);
    });
    const prog = document.getElementById('kd-vote-progress');
    prog.textContent = 'Waiting for votes…';
    setPhase('voting');
    startTimer('kd-vote-timer', duration);
  }

  function onVoteUpdate({ cast, total }) {
    document.getElementById('kd-vote-progress').textContent = `${cast} / ${total} votes cast`;
  }

  function onVoteConfirmed({ targetName }) {
    document.getElementById('kd-voted-notice').textContent = `✓ You voted for ${targetName}`;
    document.getElementById('kd-voted-notice').classList.remove('hidden');
  }

  function onVoteResult({ tied, eliminated, message, voteDetails, livingPlayers, deadPlayers }) {
    renderPlayerList(livingPlayers, deadPlayers);
    document.getElementById('kd-elim-msg').textContent = message;

    if (eliminated) {
      addHistory(`${eliminated.name} was voted out (${eliminated.role}).`);
      if (eliminated.id === App.myId) {
        document.getElementById('kd-you-status').textContent = '💀 Eliminated';
      }
      const reveal = document.getElementById('kd-elim-reveal');
      reveal.className = `role-reveal-card ${eliminated.role}`;
      reveal.innerHTML = `<div class="reveal-role">${ROLE_INFO[eliminated.role]?.icon || ''} ${eliminated.role.toUpperCase()}</div><div>${eliminated.name} was the ${eliminated.role}!</div>`;
      reveal.classList.remove('hidden');
      document.getElementById('kd-elim-icon').textContent = eliminated.role === 'killer' ? '⚰️' : '😢';
      document.getElementById('kd-elim-title').textContent = eliminated.role === 'killer' ? 'Killer Found!' : 'Innocent Eliminated';
    } else {
      document.getElementById('kd-elim-reveal').classList.add('hidden');
      document.getElementById('kd-elim-icon').textContent = tied ? '🤝' : '⚖️';
      document.getElementById('kd-elim-title').textContent = 'No Elimination';
      addHistory('No one was eliminated (tie).');
    }

    const detail = document.getElementById('kd-vote-detail');
    detail.innerHTML = '';
    (voteDetails || []).sort((a,b) => b.votes - a.votes).forEach(v => {
      const d = document.createElement('div');
      d.className = 'vote-detail-item';
      d.innerHTML = `${v.name}: <span class="vote-count">${v.votes} vote${v.votes !== 1 ? 's' : ''}</span>`;
      detail.appendChild(d);
    });

    const nextLabel = document.getElementById('kd-next-label');
    nextLabel.textContent = 'Next round beginning…';
    nextLabel.classList.remove('hidden');

    setPhase('vote-result');
  }

  function onGameOver({ winner, reason, allPlayers, history }) {
    const isVillagers = winner === 'villagers';
    document.getElementById('kd-win-icon').textContent = isVillagers ? '🏘️' : '🔪';
    document.getElementById('kd-win-title').textContent = isVillagers ? 'Villagers Win!' : 'Killer Wins!';
    document.getElementById('kd-win-reason').textContent = reason;
    document.getElementById('kd-btn-again').style.display = App.isHost ? 'inline-block' : 'none';

    const grid = document.getElementById('kd-final-players');
    grid.innerHTML = '';
    allPlayers.forEach(p => {
      const info = ROLE_INFO[p.role] || {};
      const card = document.createElement('div');
      card.className = 'final-player-card' + (p.alive ? '' : ' dead');
      card.innerHTML = `<div class="fp-name">${p.name}${p.id === App.myId ? ' (you)' : ''}</div><div class="fp-role ${p.role}">${info.icon || ''} ${p.role}</div><div style="font-size:.75rem;color:var(--muted)">${p.alive ? 'Survived' : 'Eliminated'}</div>`;
      grid.appendChild(card);
    });

    const hist = document.getElementById('kd-final-history');
    hist.innerHTML = '';
    (history || []).forEach(h => {
      const d = document.createElement('div');
      d.textContent = h.reason === 'vote' ? `Round ${h.round}: ${h.name} was voted out (${h.role})` : `Night ${h.round}: ${h.name} was killed`;
      hist.appendChild(d);
    });

    setPhase('gameover');
  }

  function onChatMessage({ playerName, message }) {
    if (App.gameType !== 'killerdoctor') return;
    const messages = document.getElementById('kd-chat-messages');
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<span class="msg-name" style="color:${avatarColor(playerName)}">${playerName}:</span><span class="msg-text">${escHtml(message)}</span>`;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function sendChat() {
    const input = document.getElementById('kd-chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    App.socket.emit('chat:send', { message: msg });
    input.value = '';
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init, onRoleAssigned, onReconnect };
})();
