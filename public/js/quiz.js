const QUIZ = (() => {
  let state = null;
  let myAnswer = null;
  let timerInterval = null;
  const LETTERS = ['A', 'B', 'C', 'D'];

  // ─── Init ───────────────────────────────────────────────────

  function init() {
    document.getElementById('quiz-btn-exit').addEventListener('click', () => {
      showConfirm('Leave game?', () => App.socket.emit('game:back_to_lobby'), { confirmText: 'Leave' });
    });
    document.querySelectorAll('.quiz-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (!state || state.phase !== 'question' || myAnswer !== null) return;
        const answer = state.options[i];
        if (!answer) return;
        App.socket.emit('game:action', { action: 'answer', answer });
        myAnswer = answer;
        renderOptions();
        renderStatus();
      });
    });
    document.getElementById('quiz-btn-again').addEventListener('click', () => App.socket.emit('game:restart'));
    document.getElementById('quiz-btn-lobby').addEventListener('click', () => App.socket.emit('game:back_to_lobby'));
  }

  // ─── Socket handlers ────────────────────────────────────────

  function onState(newState) {
    const prevQ     = state?.questionIndex;
    const prevPhase = state?.phase;
    state = newState;

    document.getElementById('quiz-gameover').classList.add('hidden');

    if (newState.phase === 'loading') {
      stopTimer();
      renderLoading();
      return;
    }

    const isNewQuestion = newState.phase === 'question' &&
      (prevPhase !== 'question' || prevQ !== newState.questionIndex);

    if (isNewQuestion) {
      myAnswer = null;
      animateQuestion();
      startTimer();
    } else if (newState.phase === 'reveal' && prevPhase === 'question') {
      stopTimer();
    }

    if (newState.phase === 'gameover') {
      stopTimer();
      renderSidebar();
      renderGameOver();
      return;
    }

    render();
  }

  function onAnswered({ answer }) {
    myAnswer = answer;
    renderOptions();
    renderStatus();
  }

  // ─── Animations ─────────────────────────────────────────────

  function animateQuestion() {
    const qEl = document.getElementById('quiz-question');
    qEl.classList.remove('quiz-q-in');
    void qEl.offsetWidth;
    qEl.classList.add('quiz-q-in');

    document.querySelectorAll('.quiz-opt').forEach((btn, i) => {
      btn.classList.remove('quiz-opt-in');
      void btn.offsetWidth;
      btn.style.animationDelay = `${i * 80}ms`;
      btn.classList.add('quiz-opt-in');
    });
  }

  // ─── Render ─────────────────────────────────────────────────

  function renderLoading() {
    const me = state?.players?.[App.myId];
    document.getElementById('quiz-my-avatar').textContent = AVATARS[me?.avatar ?? App.myAvatar]?.emoji ?? '';
    document.getElementById('quiz-my-name').textContent = me?.name ?? App.myName ?? '';
    document.getElementById('quiz-sidebar-list').innerHTML = '';

    document.getElementById('quiz-question').textContent = 'Fetching questions…';
    document.getElementById('quiz-answer-status').textContent = 'This may take a few seconds';
    document.getElementById('quiz-answer-status').className = 'quiz-answer-status';
    document.getElementById('quiz-score-delta').classList.add('hidden');
    document.getElementById('quiz-timer-bar').style.width = '0%';
    document.getElementById('quiz-timer-num').textContent = '';
    document.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.innerHTML = '';
      btn.disabled = true;
      btn.className = 'quiz-opt';
    });
  }

  function render() {
    if (!state) return;
    renderHeader();
    renderQuestion();
    renderOptions();
    renderStatus();
    renderDelta();
    renderSidebar();
  }

  function renderHeader() {
    document.getElementById('quiz-q-num').textContent = `Q ${state.questionIndex + 1} / ${state.totalQuestions}`;
    const badge = document.getElementById('quiz-diff-badge');
    badge.textContent = state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
    badge.className = 'quiz-diff-badge diff-' + state.difficulty;
  }

  function renderQuestion() {
    document.getElementById('quiz-question').textContent = state.question;
  }

  function renderOptions() {
    document.querySelectorAll('.quiz-opt').forEach((btn, i) => {
      const text = state?.options?.[i] ?? '';
      btn.disabled = false;
      btn.className = 'quiz-opt';

      btn.innerHTML =
        `<span class="quiz-opt-letter">${LETTERS[i]}</span>` +
        `<span class="quiz-opt-text">${text}</span>`;

      if (state?.phase === 'reveal') {
        btn.disabled = true;
        const isCorrect = text === state.correctAnswer;
        const isMine    = text === myAnswer;
        const myResult  = state.results?.[App.myId];
        if (isCorrect) {
          btn.classList.add('opt-correct');
          if (isMine && myResult?.firstCorrect) {
            const badge = document.createElement('span');
            badge.className = 'quiz-first-badge';
            badge.textContent = '⚡ First!';
            btn.appendChild(badge);
          }
        } else if (isMine) {
          btn.classList.add('opt-wrong');
        } else {
          btn.classList.add('opt-dimmed');
        }
      } else if (myAnswer !== null) {
        btn.disabled = true;
        if (text === myAnswer) btn.classList.add('opt-selected');
        else btn.classList.add('opt-dimmed');
      }
    });
  }

  function renderStatus() {
    const el = document.getElementById('quiz-answer-status');
    if (!state) return;
    if (state.phase === 'reveal') {
      el.textContent = `${state.answersIn} of ${state.totalPlayers} answered`;
      el.className = 'quiz-answer-status';
    } else if (myAnswer !== null) {
      el.textContent = `Waiting… (${state.answersIn}/${state.totalPlayers} answered)`;
      el.className = 'quiz-answer-status waiting';
    } else {
      el.textContent = `${state.answersIn} of ${state.totalPlayers} answered`;
      el.className = 'quiz-answer-status';
    }
  }

  function renderDelta() {
    const el = document.getElementById('quiz-score-delta');
    if (!state || state.phase !== 'reveal' || !state.results) {
      el.classList.add('hidden');
      return;
    }
    const myResult = state.results[App.myId];
    if (!myResult) { el.classList.add('hidden'); return; }

    el.classList.remove('hidden');
    el.classList.remove('delta-pop');
    void el.offsetWidth;

    if (myResult.correct) {
      let text = `+${myResult.points} pts`;
      if (myResult.firstCorrect) text += ' ⚡';
      el.textContent = text;
      el.className = 'quiz-score-delta delta-correct delta-pop';
    } else if (!myAnswer) {
      el.textContent = "Time's up!";
      el.className = 'quiz-score-delta delta-timeout delta-pop';
    } else {
      el.textContent = 'Wrong!';
      el.className = 'quiz-score-delta delta-wrong delta-pop';
    }
  }

  function renderSidebar() {
    // Player chip
    const me = state?.players?.[App.myId];
    document.getElementById('quiz-my-avatar').textContent = AVATARS[me?.avatar ?? App.myAvatar]?.emoji ?? '';
    document.getElementById('quiz-my-name').textContent = me?.name ?? App.myName ?? '';

    // Live rankings
    const listEl = document.getElementById('quiz-sidebar-list');
    if (!listEl || !state?.scores) return;
    listEl.innerHTML = '';

    const sorted = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id, score], rank) => {
      const player = state.players?.[id];
      const result = state.results?.[id];
      const row    = document.createElement('div');
      row.className = 'quiz-sidebar-row' + (id === App.myId ? ' sidebar-me' : '');

      let deltaHtml = '';
      if (state.phase === 'reveal' && result?.correct) {
        deltaHtml = `<span class="quiz-sidebar-delta">${result.firstCorrect ? '⚡' : '+'}${result.points}</span>`;
      }

      row.innerHTML =
        `<span class="quiz-sidebar-rank">${rank + 1}</span>` +
        `<span class="quiz-sidebar-avatar">${AVATARS[player?.avatar ?? 0]?.emoji ?? '?'}</span>` +
        `<span class="quiz-sidebar-name">${player?.name ?? '?'}</span>` +
        deltaHtml +
        `<span class="quiz-sidebar-score">${score}</span>`;
      listEl.appendChild(row);
    });
  }

  function renderGameOver() {
    if (!state) return;
    const sorted     = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    const [winnerId] = sorted[0] ?? [];
    const winnerName = state.players?.[winnerId]?.name ?? '?';

    document.getElementById('quiz-gameover-title').textContent =
      winnerId === App.myId ? 'You win!' : `${winnerName} wins!`;

    const scoresEl = document.getElementById('quiz-gameover-scores');
    scoresEl.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    sorted.forEach(([id, score], i) => {
      const correct = state.correctCounts?.[id] ?? 0;
      const total   = state.totalQuestions ?? sorted.length;
      const row = document.createElement('div');
      row.className = 'quiz-score-row' + (id === App.myId ? ' quiz-score-me' : '');
      row.style.animationDelay = `${i * 80}ms`;
      row.classList.add('score-row-in');
      row.innerHTML =
        `<span class="quiz-rank">${medals[i] ?? (i + 1) + '.'}</span>` +
        `<span class="quiz-player-name">${state.players?.[id]?.name ?? '?'}</span>` +
        `<span class="quiz-correct-count">${correct}/${total}</span>` +
        `<span class="quiz-total-score">${score} <span class="quiz-pts-label">pts</span></span>`;
      scoresEl.appendChild(row);
    });

    document.getElementById('quiz-btn-again').classList.toggle('hidden', !App.isHost);
    document.getElementById('quiz-btn-lobby').classList.toggle('hidden', !App.isHost);
    document.getElementById('quiz-gameover').classList.remove('hidden');
  }

  // ─── Timer ──────────────────────────────────────────────────

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      if (!state || state.phase !== 'question') { stopTimer(); return; }
      const elapsed   = Date.now() - state.startedAt;
      const remaining = Math.max(0, state.timeLimitMs - elapsed);
      const pct       = (remaining / state.timeLimitMs) * 100;
      document.getElementById('quiz-timer-bar').style.width = pct + '%';
      const secs = Math.ceil(remaining / 1000);
      document.getElementById('quiz-timer-num').textContent = secs;
      document.getElementById('quiz-timer-num').classList.toggle('timer-danger', secs <= 5);
      document.getElementById('quiz-timer-bar').classList.toggle('timer-bar-danger', secs <= 5);
      if (remaining <= 0) stopTimer();
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  return { init, onState, onAnswered };
})();
