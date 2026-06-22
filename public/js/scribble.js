const Scribble = (() => {
  let canvas, ctx;
  let isDrawing = false;
  let tool = 'pencil';
  let color = '#000000';
  let brushSize = 5;
  let isDrawer = false;
  let hasGuessed = false;
  let timerInterval = null;
  let myDrawerId = null;
  let lastX = 0, lastY = 0;
  let drawBuffer = [];
  let flushTimer = null;

  function init() {
    canvas = document.getElementById('scb-canvas');
    ctx = canvas.getContext('2d');
    setupCanvasEvents();
    setupTools();

    document.getElementById('scb-chat-send').addEventListener('click', sendChat);
    document.getElementById('scb-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    document.getElementById('scb-btn-again').addEventListener('click', () => App.socket.emit('game:restart'));
    document.getElementById('scb-btn-lobby').addEventListener('click', () => App.socket.emit('game:back_to_lobby'));
    document.getElementById('scb-btn-exit').addEventListener('click', () => {
      if (confirm('Exit the game? You will leave the room.')) location.reload();
    });

    App.socket.on('scribble:turn_start', onTurnStart);
    App.socket.on('scribble:choose_word', onChooseWord);
    App.socket.on('scribble:draw_start', onDrawStart);
    App.socket.on('scribble:draw', onRemoteDraw);
    App.socket.on('scribble:clear', () => clearCanvas(false));
    App.socket.on('scribble:hint', ({ masked }) => setWordDisplay(masked));
    App.socket.on('scribble:guess_event', onGuessEvent);
    App.socket.on('scribble:correct_guess', onCorrectGuess);
    App.socket.on('scribble:round_end', onRoundEnd);
    App.socket.on('scribble:game_over', onGameOver);
    App.socket.on('chat:message', onChatMessage);
  }

  // ─── Canvas setup ───
  function getPos(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (canvas.width / r.width),
      y: (clientY - r.top) * (canvas.height / r.height),
    };
  }

  function setupCanvasEvents() {
    canvas.addEventListener('mousedown', e => { if (!isDrawer) return; const p = getPos(e.clientX, e.clientY); startDraw(p.x, p.y); });
    canvas.addEventListener('mousemove', e => { if (!isDrawer || !isDrawing) return; const p = getPos(e.clientX, e.clientY); continueDraw(p.x, p.y); });
    canvas.addEventListener('mouseup', () => endDraw());
    canvas.addEventListener('mouseleave', () => endDraw());

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!isDrawer) return;
      const t = e.touches[0]; const p = getPos(t.clientX, t.clientY);
      startDraw(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!isDrawer || !isDrawing) return;
      const t = e.touches[0]; const p = getPos(t.clientX, t.clientY);
      continueDraw(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchend', () => endDraw());
  }

  function canvasCoords(nx, ny) {
    return { x: nx * canvas.width, y: ny * canvas.height };
  }

  function normalizeCoords(x, y) {
    return { nx: x / canvas.width, ny: y / canvas.height };
  }

  function startDraw(x, y) {
    if (tool === 'fill') {
      floodFill(Math.round(x), Math.round(y), color);
      const n = normalizeCoords(x, y);
      App.socket.emit('game:action', { action: 'fill', x: n.nx, y: n.ny, color });
      return;
    }
    isDrawing = true;
    lastX = x; lastY = y;
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawBuffer.push({ type: 'begin', nx: x / canvas.width, ny: y / canvas.height, color: tool === 'eraser' ? '#ffffff' : color, size: brushSize, tool });
    scheduleFlush();
  }

  function continueDraw(x, y) {
    if (!isDrawing) return;
    const c = tool === 'eraser' ? '#ffffff' : color;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'source-over' : 'source-over';
    ctx.strokeStyle = c;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y);
    lastX = x; lastY = y;
    drawBuffer.push({ type: 'point', nx: x / canvas.width, ny: y / canvas.height });
    scheduleFlush();
  }

  function endDraw() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.beginPath();
    drawBuffer.push({ type: 'end' });
    flushDrawBuffer();
  }

  function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(flushDrawBuffer, 50);
  }

  function flushDrawBuffer() {
    flushTimer = null;
    if (!drawBuffer.length) return;
    drawBuffer.forEach(stroke => App.socket.emit('game:action', { action: 'draw', stroke }));
    drawBuffer = [];
  }

  // ─── Remote drawing ───
  let remoteCtx = { color: '#000', size: 5, active: false };

  function onRemoteDraw({ stroke }) {
    switch (stroke.type) {
      case 'begin': {
        remoteCtx = { color: stroke.color, size: stroke.size, tool: stroke.tool, active: true };
        const { x, y } = canvasCoords(stroke.nx, stroke.ny);
        ctx.beginPath(); ctx.moveTo(x, y);
        break;
      }
      case 'point': {
        if (!remoteCtx.active) return;
        const { x, y } = canvasCoords(stroke.nx, stroke.ny);
        ctx.strokeStyle = remoteCtx.color;
        ctx.lineWidth = remoteCtx.size;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y);
        break;
      }
      case 'end':
        remoteCtx.active = false;
        ctx.beginPath();
        break;
      case 'fill': {
        const { x, y } = canvasCoords(stroke.nx, stroke.ny);
        floodFill(Math.round(x), Math.round(y), stroke.color);
        break;
      }
    }
  }

  function replayDrawingData(data) {
    (data || []).forEach(stroke => onRemoteDraw({ stroke }));
  }

  // ─── Flood fill ───
  function floodFill(startX, startY, fillColor) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const idx = (startY * w + startX) * 4;
    const target = [data[idx], data[idx+1], data[idx+2], data[idx+3]];
    const fill = hexToRgba(fillColor);
    if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2]) return;

    const stack = [[startX, startY]];
    const visited = new Set();

    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) continue;
      const key = cy * w + cx;
      if (visited.has(key)) continue;
      visited.add(key);
      const i = key * 4;
      if (!colorMatch(data, i, target)) continue;
      data[i] = fill[0]; data[i+1] = fill[1]; data[i+2] = fill[2]; data[i+3] = 255;
      stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function colorMatch(data, idx, target) {
    return Math.abs(data[idx]-target[0]) < 30 && Math.abs(data[idx+1]-target[1]) < 30 && Math.abs(data[idx+2]-target[2]) < 30;
  }

  function hexToRgba(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return [r, g, b, 255];
  }

  function clearCanvas(emit = true) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (emit) App.socket.emit('game:action', { action: 'clear' });
  }

  // ─── Tools ───
  function setupTools() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.dataset.tool;
        canvas.style.cursor = tool === 'eraser' ? 'cell' : tool === 'fill' ? 'crosshair' : 'crosshair';
      });
    });

    document.getElementById('scb-color').addEventListener('input', e => {
      color = e.target.value;
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    });

    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        color = dot.dataset.color;
        document.getElementById('scb-color').value = color;
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        if (tool === 'eraser') {
          tool = 'pencil';
          document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
          document.querySelector('[data-tool="pencil"]').classList.add('active');
        }
      });
    });

    document.getElementById('scb-size').addEventListener('input', e => {
      brushSize = +e.target.value;
      document.getElementById('scb-size-label').textContent = `${brushSize}px`;
    });

    document.getElementById('scb-clear').addEventListener('click', () => clearCanvas(true));
  }

  function setDrawerMode(drawing) {
    isDrawer = drawing;
    canvas.classList.toggle('not-drawing', !drawing);
    document.getElementById('scb-tools').classList.toggle('hidden', !drawing);
  }

  // ─── Word display ───
  function setWordDisplay(masked) {
    document.getElementById('scb-word-display').textContent = masked || '';
  }

  // ─── Timer ───
  function startTimer(seconds) {
    clearInterval(timerInterval);
    let rem = seconds;
    const el = document.getElementById('scb-timer');
    function tick() {
      const m = Math.floor(rem/60), s = rem%60;
      el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      el.classList.toggle('danger', rem <= 15);
      rem--;
      if (rem < 0) clearInterval(timerInterval);
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // ─── Player list ───
  function renderPlayers(players, drawerId, guessedSet) {
    const list = document.getElementById('scb-player-list');
    list.innerHTML = '';
    players.forEach(p => {
      const item = document.createElement('div');
      const isDrawing = p.id === drawerId;
      const didGuess = guessedSet ? guessedSet.has(p.id) : false;
      item.className = `scb-player-item${isDrawing ? ' drawing' : didGuess ? ' guessed' : ''}`;
      item.dataset.playerId = p.id;
      const av = document.createElement('div');
      av.className = 'scb-mini-av';
      av.style.background = avatarColor(p.name);
      av.textContent = p.name.slice(0,2).toUpperCase();
      const name = document.createElement('div');
      name.className = 'scb-pname';
      name.textContent = (isDrawing ? '✏️ ' : '') + p.name + (p.id === App.myId ? ' (you)' : '');
      const score = document.createElement('div');
      score.className = 'scb-score';
      score.textContent = p.score || 0;
      item.appendChild(av); item.appendChild(name); item.appendChild(score);
      list.appendChild(item);
    });
  }

  function updatePlayerScore(playerId, newScore) {
    const item = document.querySelector(`[data-player-id="${playerId}"]`);
    if (item) item.querySelector('.scb-score').textContent = newScore;
  }

  // ─── Chat ───
  function addChatMsg(playerName, message, type = '') {
    const msgs = document.getElementById('scb-chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg' + (type ? ` ${type}` : '');
    if (!playerName || type === 'system') {
      div.textContent = message;
    } else {
      div.innerHTML = `<span class="msg-name" style="color:${avatarColor(playerName)}">${escHtml(playerName)}:</span><span class="msg-text">${escHtml(message)}</span>`;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function sendChat() {
    const input = document.getElementById('scb-chat-input');
    const msg = input.value.trim();
    if (!msg || isDrawer || hasGuessed) return;
    App.socket.emit('chat:send', { message: msg });
    input.value = '';
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Socket handlers ───
  function onStart({ players, maxRounds }) {
    clearCanvas(false);
    hasGuessed = false;
    document.getElementById('scb-chat-messages').innerHTML = '';
    document.getElementById('scb-overlay-gameover').classList.add('hidden');
    document.getElementById('scb-overlay-round-end').classList.add('hidden');
    document.getElementById('scb-overlay-guessed').classList.add('hidden');
    renderPlayers(players, null);
  }

  function onReconnect({ phase, drawerId, scores, drawingData, masked, players, round, maxRounds }) {
    myDrawerId = drawerId;
    setDrawerMode(drawerId === App.myId);
    document.getElementById('scb-round-label').textContent = `Round ${round} / ${maxRounds}`;
    if (masked) setWordDisplay(masked);
    renderPlayers(players, drawerId);
    clearCanvas(false);
    replayDrawingData(drawingData);
  }

  function onTurnStart({ drawerId, drawerName, round, maxRounds, scores, players }) {
    myDrawerId = drawerId;
    hasGuessed = false;
    clearCanvas(false);
    document.getElementById('scb-chat-messages').innerHTML = '';
    document.getElementById('scb-overlay-round-end').classList.add('hidden');
    document.getElementById('scb-overlay-guessed').classList.add('hidden');
    document.getElementById('scb-round-label').textContent = `Round ${round} / ${maxRounds}`;
    renderPlayers(players, drawerId);
    setWordDisplay('');
    setDrawerMode(drawerId === App.myId);
    document.getElementById('scb-drawer-label').textContent =
      drawerId === App.myId ? '✏️ Your turn to draw!' : `✏️ ${drawerName} is drawing`;
    document.getElementById('scb-chat-input').disabled = drawerId === App.myId;
    clearInterval(timerInterval);
    document.getElementById('scb-timer').textContent = '–:––';
    // Hide chooser overlay for guessers
    if (drawerId !== App.myId) document.getElementById('scb-word-chooser').classList.add('hidden');
  }

  function onChooseWord({ words }) {
    const chooser = document.getElementById('scb-word-chooser');
    chooser.classList.remove('hidden');
    const opts = document.getElementById('scb-word-options');
    opts.innerHTML = '';
    let countdown = 15;
    const countEl = document.getElementById('scb-choose-countdown');
    const t = setInterval(() => { countdown--; countEl.textContent = `Auto-selecting in ${countdown}s…`; if (countdown <= 0) clearInterval(t); }, 1000);
    words.forEach(w => {
      const btn = document.createElement('button');
      btn.className = 'scb-word-opt';
      btn.textContent = w;
      btn.addEventListener('click', () => {
        clearInterval(t);
        App.socket.emit('game:action', { action: 'choose_word', word: w });
        chooser.classList.add('hidden');
      });
      opts.appendChild(btn);
    });
  }

  function onDrawStart({ word, masked, duration }) {
    document.getElementById('scb-word-chooser').classList.add('hidden');
    if (word) {
      document.getElementById('scb-word-display').textContent = `Draw: ${word}`;
    } else {
      setWordDisplay(masked);
    }
    startTimer(duration);
  }

  function onGuessEvent({ playerId, playerName, correct, scores }) {
    if (correct) {
      addChatMsg(null, `✅ ${playerName} guessed the word!`, 'system');
      const item = document.querySelector(`[data-player-id="${playerId}"]`);
      if (item) item.classList.add('guessed');
      // Update all scores from the scores map
      Object.entries(scores || {}).forEach(([id, pts]) => updatePlayerScore(id, pts));
    }
  }

  function onCorrectGuess({ word, points }) {
    hasGuessed = true;
    document.getElementById('scb-chat-input').disabled = true;
    document.getElementById('scb-overlay-guessed').textContent = `🎉 Correct! +${points} points`;
    document.getElementById('scb-overlay-guessed').classList.remove('hidden');
    setTimeout(() => document.getElementById('scb-overlay-guessed').classList.add('hidden'), 3000);
    // Show word to guesser
    setWordDisplay(word);
  }

  function onRoundEnd({ word, scores, players, allGuessed }) {
    clearInterval(timerInterval);
    setDrawerMode(false);
    renderPlayers(players, null);
    const overlay = document.getElementById('scb-overlay-round-end');
    overlay.querySelector('strong').textContent = word || '—';
    const scoreList = document.getElementById('scb-overlay-scores');
    scoreList.innerHTML = '';
    const sorted = [...players].sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));
    sorted.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = `overlay-score-item rank-${i+1}`;
      row.innerHTML = `<span class="osi-rank">#${i+1}</span><span class="osi-name">${p.name}</span><span class="osi-pts">${scores[p.id]||0}</span>`;
      scoreList.appendChild(row);
    });
    overlay.classList.remove('hidden');
  }

  function onGameOver({ scores, players, winner }) {
    clearInterval(timerInterval);
    document.getElementById('scb-overlay-round-end').classList.add('hidden');
    const overlay = document.getElementById('scb-overlay-gameover');
    const scoreList = document.getElementById('scb-final-scores');
    scoreList.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = `overlay-score-item rank-${i+1}`;
      row.innerHTML = `<span class="osi-rank">${i === 0 ? '🏆' : `#${i+1}`}</span><span class="osi-name">${p.name}${p.id === App.myId ? ' (you)' : ''}</span><span class="osi-pts">${scores[p.id]||0}</span>`;
      scoreList.appendChild(row);
    });
    document.getElementById('scb-btn-again').style.display = App.isHost ? 'inline-block' : 'none';
    overlay.classList.remove('hidden');
  }

  function onChatMessage({ playerName, message }) {
    if (App.gameType !== 'scribble') return;
    addChatMsg(playerName, message);
  }

  return { init, onStart, onReconnect };
})();
