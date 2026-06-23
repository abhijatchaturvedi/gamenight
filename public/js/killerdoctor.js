const KillerDoctor = (() => {
  let myRole = null;
  let roleVisible = true;
  let timerInterval = null;
  let tensionShown = false;
  let ambientInterval = null;

  const ROLE_INFO = {
    killer:   { icon: '🔪', color: '#ef4444', desc: 'Kill one player each night. Stay hidden.' },
    doctor:   { icon: '💉', color: '#10b981', desc: 'Save one player each night. Protect the village.' },
    villager: { icon: '🧑', color: '#94a3b8', desc: 'Find and vote out the Killer before it\'s too late.' },
  };

  function getAvatar(p) {
    return AVATARS[p?.avatar ?? 0] || AVATARS[0];
  }

  function init() {
    document.getElementById('kd-toggle-role').addEventListener('click', toggleRole);

    document.getElementById('kd-villager-awake').addEventListener('click', function() {
      this.textContent = '✓ Confirmed';
      this.disabled = true;
      document.getElementById('kd-action-desc').textContent = 'Waiting for others…';
      App.socket.emit('game:action', { action: 'night_awake' });
    });

    document.getElementById('kd-chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendChat();
    });
    document.getElementById('kd-chat-send').addEventListener('click', sendChat);
    document.getElementById('kd-btn-again').addEventListener('click', () => App.socket.emit('game:restart'));
    document.getElementById('kd-btn-lobby').addEventListener('click', () => App.socket.emit('game:back_to_lobby'));
    document.getElementById('kd-btn-exit').addEventListener('click', () => {
      showConfirm('Exit the game? You will leave the room.', () => location.reload(), { confirmText: 'Exit', danger: true });
    });

    App.socket.on('kd:night_start', onNightStart);
    App.socket.on('kd:night_progress', ({ confirmed, total }) => {
      const el = document.getElementById('kd-night-progress');
      el.textContent = `${confirmed} / ${total} confirmed`;
      el.classList.remove('hidden');
    });
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
    const charEl = document.getElementById('kd-role-character');
    const descEl = document.getElementById('kd-role-desc');
    const btn = document.getElementById('kd-toggle-role');
    if (roleVisible) {
      const info = ROLE_INFO[myRole] || {};
      roleNameEl.textContent = `${info.icon || ''} ${myRole?.toUpperCase() || '—'}`;
      charEl.classList.remove('hidden');
      descEl.classList.remove('hidden');
      card.classList.remove('hidden-role');
      btn.textContent = 'Hide';
    } else {
      roleNameEl.textContent = '🂠 Hidden';
      charEl.classList.add('hidden');
      descEl.classList.add('hidden');
      card.classList.add('hidden-role');
      btn.textContent = 'Show';
    }
  }

  function setRole(role, alive = true) {
    myRole = role;
    const info = ROLE_INFO[role] || {};
    const av = AVATARS[App.myAvatar ?? 0] || AVATARS[0];
    const card = document.getElementById('kd-role-card');
    card.dataset.role = role;
    document.getElementById('kd-role-name').textContent = `${info.icon || ''} ${role?.toUpperCase() || '—'}`;
    document.getElementById('kd-role-desc').textContent = info.desc || '';
    document.getElementById('kd-role-character').textContent = `${av.emoji} ${av.name}`;
    document.getElementById('kd-you-status').textContent = alive ? '🟢 Alive' : '💀 Dead';
    roleVisible = false;
    card.classList.add('hidden-role');
    document.getElementById('kd-role-name').textContent = '🂠 Hidden';
    document.getElementById('kd-role-character').classList.add('hidden');
    document.getElementById('kd-role-desc').classList.add('hidden');
    document.getElementById('kd-toggle-role').textContent = 'Show';
  }

  function renderPlayerList(living, dead) {
    const list = document.getElementById('kd-player-list');
    list.innerHTML = '';
    const aliveCount = (living || []).length;
    list.classList.toggle('kd-tension', aliveCount === 3);
    if (aliveCount === 3 && !tensionShown && myRole !== null) {
      tensionShown = true;
      toast('⚠️ Final 3 players — Killer can now win!', 4000, 'warning');
    }
    const all = [...(living || []).map(p => ({...p, alive: true})), ...(dead || []).map(p => ({...p, alive: false}))];
    all.forEach(p => {
      const item = document.createElement('div');
      item.className = 'kd-player-item' + (p.alive ? '' : ' dead');
      const av = getAvatar(p);
      const charIcon = document.createElement('div');
      charIcon.className = 'player-char-icon';
      charIcon.textContent = av.emoji;
      charIcon.title = av.name;
      const nameWrap = document.createElement('div');
      nameWrap.className = 'player-name-wrap';
      nameWrap.textContent = p.name;
      if (p.id === App.myId) {
        const tag = document.createElement('span');
        tag.className = 'you-tag'; tag.textContent = ' (you)';
        nameWrap.appendChild(tag);
      }
      item.appendChild(charIcon);
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

  const ANIM_CONFIG = {
    kill:          { emojis: ['🩸','💀','🔪','💔','🩸'],          count: 20, dir: 'fall', bg: 'rgba(180,20,20,0.6)',    icon: '💀', text: 'The Killer Strikes!',   dur: 2400 },
    save:          { emojis: ['✨','💚','⭐','💫','🌟'],          count: 18, dir: 'rise', bg: 'rgba(10,140,80,0.55)',  icon: '💚', text: 'Doctor to the Rescue!', dur: 2400 },
    peace:         { emojis: ['⭐','🌟','💤','🌙'],               count: 10, dir: 'rise', bg: 'rgba(40,40,120,0.5)',   icon: '🌙', text: 'A Peaceful Night…',      dur: 2400 },
    night:         { emojis: ['🌙','⭐','✨','💫','🌟'],          count: 16, dir: 'fall', bg: 'rgba(8,8,48,0.72)',     icon: '🌙', text: 'Night Falls…',           dur: 2000 },
    day:           { emojis: ['☀️','🌸','🐦','✨','🌻'],         count: 14, dir: 'rise', bg: 'rgba(255,175,25,0.38)', icon: '🌅', text: 'A New Day Dawns',        dur: 2000 },
    killer_caught: { emojis: ['🎉','🎊','🏆','⚔️','✨','🌟'],    count: 28, dir: 'rise', bg: 'rgba(20,100,220,0.55)', icon: '🎉', text: 'Killer Caught!',         dur: 2800 },
    innocent_out:  { emojis: ['😢','💔','🪦','😭','🕊️'],         count: 15, dir: 'fall', bg: 'rgba(70,50,90,0.6)',    icon: '😢', text: 'An Innocent Falls…',     dur: 2200 },
    villagers_win: { emojis: ['🎉','🎊','🌟','🏆','🎈','✨'],    count: 35, dir: 'rise', bg: 'rgba(16,120,70,0.55)',  icon: '🏆', text: 'Villagers Win!',         dur: 3500 },
    killer_wins:   { emojis: ['💀','🔪','😈','🌑','👁️','🩸'],    count: 30, dir: 'fall', bg: 'rgba(90,0,0,0.72)',     icon: '😈', text: 'Killer Wins!',           dur: 3500 },
  };

  function showNightAnimation(type) {
    const cfg = ANIM_CONFIG[type] || ANIM_CONFIG.peace;
    const overlay = document.createElement('div');
    overlay.className = `kd-anim-overlay kd-anim-${type}`;
    overlay.style.background = cfg.bg;

    // Particle rain / rise
    const particles = document.createElement('div');
    particles.className = 'kd-particles';
    for (let i = 0; i < cfg.count; i++) {
      const p = document.createElement('span');
      p.className = `kd-particle kd-particle-${cfg.dir}`;
      p.textContent = cfg.emojis[Math.floor(Math.random() * cfg.emojis.length)];
      p.style.cssText = [
        `left:${Math.random() * 100}%`,
        `animation-delay:${(Math.random() * 1.8).toFixed(2)}s`,
        `animation-duration:${(1.4 + Math.random() * 1.6).toFixed(2)}s`,
        `font-size:${(0.9 + Math.random() * 1.6).toFixed(1)}rem`,
        `opacity:${(0.7 + Math.random() * 0.3).toFixed(2)}`,
      ].join(';');
      particles.appendChild(p);
    }

    const main = document.createElement('div');
    main.className = 'kd-anim-main';

    const icon = document.createElement('div');
    icon.className = 'kd-anim-icon';
    icon.textContent = cfg.icon;

    const text = document.createElement('div');
    text.className = 'kd-anim-text';
    text.textContent = cfg.text;

    main.appendChild(icon);
    main.appendChild(text);
    overlay.appendChild(particles);
    overlay.appendChild(main);
    document.getElementById('view-killerdoctor').appendChild(overlay);

    // Fade out then remove
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.4s ease';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 400);
    }, cfg.dur || 2400);
  }

  function startAmbient() {
    stopAmbient();
    ambientInterval = setInterval(() => {
      const s = document.createElement('span');
      s.className = 'kd-ambient-star';
      s.textContent = ['⭐','✨','💫','🌟'][Math.floor(Math.random() * 4)];
      s.style.cssText = `left:${(Math.random()*95).toFixed(1)}%;animation-duration:${(5+Math.random()*4).toFixed(1)}s`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 10000);
    }, 700);
  }

  function stopAmbient() {
    clearInterval(ambientInterval);
    ambientInterval = null;
    document.querySelectorAll('.kd-ambient-star').forEach(s => s.remove());
  }

  function showActionBurst(elId, emojis) {
    const el = document.getElementById(elId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      span.className = 'kd-action-burst-particle';
      span.textContent = emojis[i % emojis.length];
      const angle = (i / 6) * Math.PI * 2;
      const dist = 50 + Math.random() * 25;
      span.style.cssText = [
        `left:${cx}px`, `top:${cy}px`,
        `--dx:${(Math.cos(angle)*dist).toFixed(0)}px`,
        `--dy:${(Math.sin(angle)*dist).toFixed(0)}px`,
      ].join(';');
      document.body.appendChild(span);
      setTimeout(() => span.remove(), 850);
    }
  }

  function showVoteDropAnim(btn) {
    const rect = btn.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'kd-vote-drop';
    el.textContent = '🗳️';
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top  = `${rect.top}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function onRoleAssigned({ role, allPlayers }) {
    tensionShown = false;
    stopAmbient();
    setRole(role);
    renderPlayerList(allPlayers, []);
    setPhase('reveal');
    document.getElementById('kd-chat-messages').innerHTML = '';
    document.getElementById('kd-history').innerHTML = '';
    // Card flip reveal animation
    const card = document.getElementById('kd-role-card');
    card.classList.remove('kd-card-flip');
    void card.offsetWidth;
    card.classList.add('kd-card-flip');
  }

  function onReconnect({ role, phase, alive, avatar }) {
    if (avatar !== undefined) App.myAvatar = avatar;
    setRole(role, alive);
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
    const isAlive = livingPlayers.some(p => p.id === App.myId);
    const nightAction = document.getElementById('kd-night-action');
    nightAction.classList.remove('hidden');
    document.getElementById('kd-action-title').textContent = '🌙 Night Phase';
    document.getElementById('kd-action-desc').textContent = isAlive ? 'Stay quiet and don\'t react…' : 'You are dead. Watch quietly.';
    document.getElementById('kd-action-targets').innerHTML = '';
    document.getElementById('kd-action-done').classList.add('hidden');
    const awakeBtn = document.getElementById('kd-villager-awake');
    if (isAlive) {
      awakeBtn.textContent = '👁️ I\'m awake';
      awakeBtn.disabled = false;
      awakeBtn.classList.remove('hidden');
    } else {
      awakeBtn.classList.add('hidden');
    }
    document.getElementById('kd-night-timer').classList.add('hidden');
    document.getElementById('kd-night-progress').classList.add('hidden');
    setPhase('night');
    startTimer('kd-night-timer', 45);
    showNightAnimation('night');
    startAmbient();
  }

  function makeTargetBtn(t, onClick) {
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    const charEl = document.createElement('div');
    charEl.className = 'target-char';
    charEl.textContent = getAvatar(t).emoji;
    const nameEl = document.createElement('span');
    nameEl.textContent = t.name;
    btn.appendChild(charEl);
    btn.appendChild(nameEl);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function onKillerAction({ targets }) {
    const panel = document.getElementById('kd-night-action');
    document.getElementById('kd-villager-awake').classList.add('hidden');
    document.getElementById('kd-action-title').textContent = '🔪 Choose your victim';
    document.getElementById('kd-action-desc').textContent = 'Select a player to eliminate tonight.';
    document.getElementById('kd-action-done').classList.add('hidden');
    const grid = document.getElementById('kd-action-targets');
    grid.innerHTML = '';
    targets.forEach(t => {
      const btn = makeTargetBtn(t, () => {
        grid.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        grid.querySelectorAll('.target-btn').forEach(b => b.disabled = true);
        App.socket.emit('game:action', { action: 'night_kill', targetId: t.id });
      });
      grid.appendChild(btn);
    });
    panel.classList.remove('hidden');
  }

  function onDoctorAction({ targets }) {
    const panel = document.getElementById('kd-night-action');
    document.getElementById('kd-villager-awake').classList.add('hidden');
    document.getElementById('kd-action-title').textContent = '💉 Choose who to save';
    document.getElementById('kd-action-desc').textContent = 'Select a player to protect tonight. You may save yourself.';
    document.getElementById('kd-action-done').classList.add('hidden');
    const grid = document.getElementById('kd-action-targets');
    grid.innerHTML = '';
    targets.forEach(t => {
      const isMe = t.id === App.myId;
      const btn = makeTargetBtn({ ...t, name: t.name + (isMe ? ' (You)' : '') }, () => {
        grid.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        grid.querySelectorAll('.target-btn').forEach(b => b.disabled = true);
        App.socket.emit('game:action', { action: 'night_save', targetId: t.id });
      });
      grid.appendChild(btn);
    });
    panel.classList.remove('hidden');
  }

  function onActionConfirmed({ action }) {
    const isKill = action === 'night_kill';
    document.getElementById('kd-action-done').textContent = isKill ? '✓ Target selected' : '✓ Save submitted';
    document.getElementById('kd-action-done').classList.remove('hidden');
    document.getElementById('kd-action-desc').textContent = 'Waiting for others…';
    document.querySelectorAll('#kd-action-targets .target-btn').forEach(b => b.disabled = true);
    showActionBurst('kd-action-done', isKill ? ['🔪','💀','🩸'] : ['💉','💚','✨']);
  }

  function onNightResult({ message, died, saved, livingPlayers, deadPlayers }) {
    stopAmbient();
    renderPlayerList(livingPlayers, deadPlayers);
    if (died) {
      addHistory(`${died.name} died in the night.`);
      document.getElementById('kd-you-status').textContent = died.id === App.myId ? '💀 Dead' : document.getElementById('kd-you-status').textContent;
      showNightAnimation('kill');
    } else if (saved) {
      addHistory('Doctor saved someone — nobody died.');
      showNightAnimation('save');
    } else {
      addHistory('A peaceful night passed.');
      showNightAnimation('peace');
    }
    document.getElementById('kd-night-msg').textContent = message;

    const victimEl = document.getElementById('kd-night-victim');
    if (died) {
      victimEl.innerHTML = `<span class="victim-char">${getAvatar(died).emoji}</span><span class="victim-name">${died.name} has fallen</span>`;
      victimEl.className = 'night-victim-display victim-dead';
    } else if (saved) {
      victimEl.innerHTML = `<span class="victim-char">💚</span><span class="victim-name">Protected by the Doctor</span>`;
      victimEl.className = 'night-victim-display victim-saved';
    } else {
      victimEl.innerHTML = '';
      victimEl.className = 'night-victim-display';
    }

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
    showNightAnimation('day');
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
      const charEl = document.createElement('div');
      charEl.className = 'vote-char';
      charEl.textContent = getAvatar(t).emoji;
      const nameEl = document.createElement('div');
      nameEl.textContent = t.name;
      btn.appendChild(charEl);
      btn.appendChild(nameEl);
      btn.addEventListener('click', () => {
        if (!isAlive) return;
        showVoteDropAnim(btn);
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
      showNightAnimation(eliminated.role === 'killer' ? 'killer_caught' : 'innocent_out');
      addHistory(`${eliminated.name} was voted out (${eliminated.role}).`);
      if (eliminated.id === App.myId) {
        document.getElementById('kd-you-status').textContent = '💀 Eliminated';
      }
      const reveal = document.getElementById('kd-elim-reveal');
      reveal.className = `role-reveal-card ${eliminated.role}`;
      reveal.innerHTML = `<div class="reveal-char">${getAvatar(eliminated).emoji}</div><div class="reveal-role">${ROLE_INFO[eliminated.role]?.icon || ''} ${eliminated.role.toUpperCase()}</div><div>${eliminated.name} was the ${eliminated.role}!</div>`;
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
    (voteDetails || []).sort((a,b) => b.votes - a.votes).forEach((v, idx) => {
      const d = document.createElement('div');
      d.className = 'vote-detail-item vote-reveal-stagger';
      d.style.animationDelay = `${idx * 0.35}s`;
      d.innerHTML = `${getAvatar(v).emoji} ${v.name}: <span class="vote-count">${v.votes} vote${v.votes !== 1 ? 's' : ''}</span>`;
      detail.appendChild(d);
    });

    const nextLabel = document.getElementById('kd-next-label');
    nextLabel.textContent = 'Next round beginning…';
    nextLabel.classList.remove('hidden');

    setPhase('vote-result');
  }

  function onGameOver({ winner, reason, allPlayers, history }) {
    stopAmbient();
    const isVillagers = winner === 'villagers';
    document.getElementById('kd-win-icon').textContent = isVillagers ? '🏘️' : '🔪';
    document.getElementById('kd-win-title').textContent = isVillagers ? 'Villagers Win!' : 'Killer Wins!';
    document.getElementById('kd-win-reason').textContent = reason;
    document.getElementById('kd-btn-again').style.display = App.isHost ? 'inline-block' : 'none';
    setPhase('gameover');
    showNightAnimation(isVillagers ? 'villagers_win' : 'killer_wins');
    setTimeout(() => {
      document.querySelectorAll('.final-player-card').forEach(card => {
        if (card.querySelector('.fp-role.killer')) card.classList.add('kd-killer-spotlight');
      });
    }, 3900);

    const grid = document.getElementById('kd-final-players');
    grid.innerHTML = '';
    allPlayers.forEach(p => {
      const info = ROLE_INFO[p.role] || {};
      const card = document.createElement('div');
      card.className = 'final-player-card' + (p.alive ? '' : ' dead');
      card.innerHTML = `<div class="fp-char">${getAvatar(p).emoji}</div><div class="fp-name">${p.name}${p.id === App.myId ? ' (you)' : ''}</div><div class="fp-role ${p.role}">${info.icon || ''} ${p.role}</div><div style="font-size:.75rem;color:var(--muted)">${p.alive ? 'Survived' : 'Eliminated'}</div>`;
      grid.appendChild(card);
    });

    const hist = document.getElementById('kd-final-history');
    hist.innerHTML = '';
    (history || []).forEach(h => {
      const d = document.createElement('div');
      d.textContent = h.reason === 'vote' ? `Round ${h.round}: ${h.name} was voted out (${h.role})` : `Night ${h.round}: ${h.name} was killed`;
      hist.appendChild(d);
    });
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
