const QUIZ = (() => {
  let state = null;
  let myAnswer = null;
  let timerInterval = null;

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
    const prevQ = state?.questionIndex;
    const prevPhase = state?.phase;
    state = newState;

    document.getElementById('quiz-gameover').classList.add('hidden');

    if (newState.phase === 'loading') {
      stopTimer();
      renderLoading();
      return;
    }

    if (newState.phase === 'question' && (prevPhase !== 'question' || prevQ !== newState.questionIndex)) {
      myAnswer = null;
      startTimer();
    }

    if (newState.phase === 'gameover') {
      stopTimer();
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

  // ─── Render ─────────────────────────────────────────────────

  function renderLoading() {
    document.getElementById('quiz-question').textContent = 'Fetching questions…';
    document.getElementById('quiz-answer-status').textContent = 'This may take a few seconds';
    document.getElementById('quiz-answer-status').className = 'quiz-answer-status';
    document.getElementById('quiz-score-delta').classList.add('hidden');
    document.getElementById('quiz-scoreboard').classList.add('hidden');
    document.getElementById('quiz-timer-bar').style.width = '0%';
    document.getElementById('quiz-timer-num').textContent = '';
    document.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.textContent = '';
      btn.disabled = true;
      btn.className = btn.className.replace(/opt-\S+/g, '').trim();
    });
  }

  function render() {
    if (!state) return;
    renderHeader();
    renderQuestion();
    renderOptions();
    renderStatus();
    renderDelta();
    renderScoreboard();
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
      btn.textContent = text;
      btn.disabled = false;

      const baseClass = ['quiz-opt-red', 'quiz-opt-blue', 'quiz-opt-yellow', 'quiz-opt-green'][i];
      btn.className = `quiz-opt ${baseClass}`;

      if (state?.phase === 'reveal') {
        btn.disabled = true;
        const isCorrect = text === state.correctAnswer;
        const isMine = text === myAnswer;
        if (isCorrect) btn.classList.add('opt-correct');
        else if (isMine) btn.classList.add('opt-wrong');
        else btn.classList.add('opt-dimmed');
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
      el.textContent = `Waiting for others… (${state.answersIn}/${state.totalPlayers} answered)`;
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
    if (myResult.correct) {
      el.textContent = `+${myResult.points} pts`;
      el.className = 'quiz-score-delta delta-correct';
    } else if (!myAnswer) {
      el.textContent = "Time's up!";
      el.className = 'quiz-score-delta delta-timeout';
    } else {
      el.textContent = 'Wrong!';
      el.className = 'quiz-score-delta delta-wrong';
    }
  }

  function renderScoreboard() {
    const el = document.getElementById('quiz-scoreboard');
    const listEl = document.getElementById('quiz-scores-list');
    if (!state || state.phase !== 'reveal') { el.classList.add('hidden'); return; }

    el.classList.remove('hidden');
    listEl.innerHTML = '';

    const sorted = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id, total], rank) => {
      const result = state.results?.[id];
      const player = state.players?.[id];
      const row = document.createElement('div');
      row.className = 'quiz-score-row' + (id === App.myId ? ' quiz-score-me' : '');
      row.innerHTML =
        `<span class="quiz-rank">${rank + 1}</span>` +
        `<span class="quiz-player-name">${player?.name ?? '?'}</span>` +
        (result?.correct
          ? `<span class="quiz-pts-gained">+${result.points}</span>`
          : `<span class="quiz-pts-miss">—</span>`) +
        `<span class="quiz-total-score">${total}</span>`;
      listEl.appendChild(row);
    });
  }

  function renderGameOver() {
    if (!state) return;
    const sorted = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    const [winnerId] = sorted[0] ?? [];
    const winnerName = state.players?.[winnerId]?.name ?? '?';

    document.getElementById('quiz-gameover-title').textContent =
      winnerId === App.myId ? 'You win!' : `${winnerName} wins!`;

    const scoresEl = document.getElementById('quiz-gameover-scores');
    scoresEl.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    sorted.forEach(([id, score], i) => {
      const row = document.createElement('div');
      row.className = 'quiz-score-row' + (id === App.myId ? ' quiz-score-me' : '');
      row.innerHTML =
        `<span class="quiz-rank">${medals[i] ?? (i + 1) + '.'}</span>` +
        `<span class="quiz-player-name">${state.players?.[id]?.name ?? '?'}</span>` +
        `<span class="quiz-total-score">${score} pts</span>`;
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
      const elapsed = Date.now() - state.startedAt;
      const remaining = Math.max(0, state.timeLimitMs - elapsed);
      const pct = (remaining / state.timeLimitMs) * 100;
      document.getElementById('quiz-timer-bar').style.width = pct + '%';
      const secs = Math.ceil(remaining / 1000);
      document.getElementById('quiz-timer-num').textContent = secs;
      const numEl = document.getElementById('quiz-timer-num');
      numEl.classList.toggle('timer-danger', secs <= 5);
      if (remaining <= 0) stopTimer();
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  return { init, onState, onAnswered };
})();
