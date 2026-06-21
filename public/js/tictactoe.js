const TicTacToe = (() => {
  let mySymbol = null;
  let state = null;

  function init() {
    document.querySelectorAll('.ttt-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!state || state.winner || state.matchWinner) return;
        if (state.currentTurn !== App.myId) return;
        App.socket.emit('game:action', { action: 'move', index: +cell.dataset.i });
      });
    });

    document.getElementById('btn-ttt-again').addEventListener('click', () => {
      App.socket.emit('game:action', { action: 'new_game' });
    });
    document.getElementById('btn-ttt-new-match').addEventListener('click', () => {
      App.socket.emit('game:restart');
    });
    document.getElementById('btn-ttt-lobby').addEventListener('click', () => {
      App.socket.emit('game:back_to_lobby');
    });
    document.getElementById('ttt-leave').addEventListener('click', () => location.reload());
  }

  function onSymbol({ symbol }) {
    mySymbol = symbol;
    document.getElementById('ttt-spectating').classList.toggle('hidden', !!symbol);
  }

  function onState(s) {
    state = s;
    renderBoard();
    renderScores();
    renderStatus();
  }

  function onPlayerLeft({ name }) {
    toast(`${name} left the game.`);
  }

  function renderBoard() {
    const cells = document.querySelectorAll('.ttt-cell');
    cells.forEach((cell, i) => {
      const val = state.board[i];
      cell.textContent = val === 'X' ? '✕' : val === 'O' ? '○' : '';
      cell.className = 'ttt-cell' + (val ? ' taken' : '') + (val === 'X' ? ' x-cell' : val === 'O' ? ' o-cell' : '');
      if (state.winLine?.includes(i)) cell.classList.add('win-cell');
    });
  }

  function renderScores() {
    const { players, scores, bestOf } = state;
    document.getElementById('ttt-name-X').textContent = players.X.name + (players.X.id === App.myId ? ' (You)' : '');
    document.getElementById('ttt-name-O').textContent = players.O.name + (players.O.id === App.myId ? ' (You)' : '');
    document.getElementById('ttt-pts-X').textContent = scores[players.X.id] || 0;
    document.getElementById('ttt-pts-O').textContent = scores[players.O.id] || 0;
    document.getElementById('ttt-score-X').classList.toggle('active-turn', state.currentTurn === players.X.id && !state.winner);
    document.getElementById('ttt-score-O').classList.toggle('active-turn', state.currentTurn === players.O.id && !state.winner);

    // Match format label
    const matchLabel = document.getElementById('ttt-match-label');
    if (matchLabel) {
      matchLabel.textContent = bestOf > 0 ? `Best of ${bestOf}` : 'Free Play';
      matchLabel.classList.toggle('hidden', false);
    }
  }

  function renderStatus() {
    const result = document.getElementById('ttt-result');
    const status = document.getElementById('ttt-status');
    const hostOnly = document.getElementById('ttt-host-only');
    const newMatchBtn = document.getElementById('btn-ttt-new-match');
    const newGameBtn = document.getElementById('btn-ttt-again');

    if (state.matchWinner) {
      result.classList.remove('hidden');
      const mw = state.players.X.id === state.matchWinner ? state.players.X : state.players.O;
      const isMe = state.matchWinner === App.myId;
      document.getElementById('ttt-result-text').textContent = isMe
        ? `🏆 You won the match! (Best of ${state.bestOf})`
        : `🏆 ${mw.name} won the match! (Best of ${state.bestOf})`;
      hostOnly.style.display = App.isHost ? 'flex' : 'none';
      newMatchBtn.classList.remove('hidden');
      newGameBtn.classList.add('hidden');
      status.textContent = '';
    } else if (state.winner) {
      result.classList.remove('hidden');
      let msg;
      if (state.winner === 'draw') {
        msg = "It's a draw! 🤝";
      } else {
        const winnerPlayer = state.players[state.winnerSymbol];
        msg = winnerPlayer.id === App.myId ? 'You win! 🎉' : `${winnerPlayer.name} wins!`;
      }
      document.getElementById('ttt-result-text').textContent = msg;
      hostOnly.style.display = App.isHost ? 'flex' : 'none';
      newMatchBtn.classList.add('hidden');
      newGameBtn.classList.remove('hidden');
      status.textContent = '';
    } else {
      result.classList.add('hidden');
      if (!mySymbol) {
        status.textContent = '👁 Spectating';
      } else if (state.currentTurn === App.myId) {
        status.textContent = `Your turn! You are ${mySymbol === 'X' ? '✕' : '○'}`;
      } else {
        const other = state.currentTurn === state.players.X.id ? state.players.X : state.players.O;
        status.textContent = `${other.name}'s turn…`;
      }
    }
  }

  return { init, onSymbol, onState, onPlayerLeft };
})();
