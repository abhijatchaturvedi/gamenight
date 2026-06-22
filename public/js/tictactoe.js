const TicTacToe = (() => {
  let mySymbol = null;
  let state = null;
  let isTournament = false;

  function init() {
    document.querySelectorAll('.ttt-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!state || !state.board || state.winner || state.matchWinner) return;
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
    document.getElementById('ttt-leave').addEventListener('click', () => {
      if (confirm('Exit the game? You will leave the room.')) location.reload();
    });

    App.socket.on('ttt:tournament_state', onTournamentState);
    App.socket.on('ttt:tournament_over', onTournamentOver);
  }

  function onSymbol({ symbol }) {
    mySymbol = symbol;
    if (!isTournament) {
      document.getElementById('ttt-spectating').classList.toggle('hidden', !!symbol);
    }
  }

  function onState(s) {
    state = s;
    isTournament = s.mode === 'tournament';
    if (!s.board) return; // tournament between matches
    renderBoard();
    if (!isTournament) {
      renderScores();
    }
    renderStatus();
    document.getElementById('ttt-spectating').classList.toggle('hidden', isTournament || !!mySymbol);
  }

  function onTournamentState(data) {
    isTournament = true;
    document.getElementById('ttt-tournament-info').classList.remove('hidden');
    document.getElementById('ttt-match-label').classList.add('hidden');

    // Show waiting message if no active match
    const hasActive = data.currentPlayerIds.length > 0;
    if (!hasActive) {
      document.getElementById('ttt-status').textContent = '⏳ Tournament starting…';
      document.getElementById('ttt-result').classList.add('hidden');
    }

    const p1 = data.allPlayers[data.currentPlayerIds[0]];
    const p2 = data.allPlayers[data.currentPlayerIds[1]];
    const roundLabel = getTournamentRoundLabel(data.currentRound, data.rounds.length);
    document.getElementById('ttt-match-info').textContent =
      hasActive ? `${roundLabel}: ${p1?.name ?? '?'} vs ${p2?.name ?? '?'}` : 'Setting up bracket…';

    renderBracket(data.rounds, data.allPlayers, data.currentRound, data.currentMatch);

    // Show spectating badge for non-active players
    const amPlaying = data.currentPlayerIds.includes(App.myId);
    document.getElementById('ttt-spectating').classList.toggle('hidden', amPlaying || !hasActive);
  }

  function onTournamentOver({ winner, rounds, allPlayers }) {
    isTournament = true;
    document.getElementById('ttt-board').style.opacity = '0.3';
    document.getElementById('ttt-result').classList.remove('hidden');
    const isMe = winner?.id === App.myId;
    document.getElementById('ttt-result-text').innerHTML =
      `🏆 Tournament Champion: <strong>${isMe ? 'You!' : (winner?.name || '?')}</strong>`;
    document.getElementById('ttt-host-only').style.display = App.isHost ? 'flex' : 'none';
    document.getElementById('btn-ttt-again').classList.remove('hidden');
    document.getElementById('btn-ttt-again').textContent = 'New Tournament';
    document.getElementById('btn-ttt-new-match').classList.add('hidden');

    renderBracket(rounds, allPlayers, -1, -1);
    document.getElementById('ttt-match-info').textContent = '🏁 Tournament complete!';
  }

  function onPlayerLeft({ name }) {
    toast(`${name} left the game.`);
  }

  function getTournamentRoundLabel(roundIdx, totalRounds) {
    if (roundIdx < 0) return 'Final';
    if (roundIdx === totalRounds - 1) return 'Final';
    if (roundIdx === totalRounds - 2 && totalRounds > 2) return 'Semifinal';
    return `Round ${roundIdx + 1}`;
  }

  function renderBracket(rounds, allPlayers, currentRound, currentMatch) {
    const bracket = document.getElementById('ttt-bracket');
    bracket.innerHTML = '';
    rounds.forEach((matches, ri) => {
      const col = document.createElement('div');
      col.className = 'bracket-round';
      const label = document.createElement('div');
      label.className = 'bracket-round-label';
      label.textContent = getTournamentRoundLabel(ri, rounds.length);
      col.appendChild(label);

      matches.forEach((match, mi) => {
        if (match.isBye && !match.winner) return; // skip unresolvable byes
        const card = document.createElement('div');
        const isActive = ri === currentRound && mi === currentMatch;
        card.className = 'bracket-match' + (isActive ? ' active' : '');

        const makeSlot = (playerId) => {
          const slot = document.createElement('div');
          const isWinner = match.winner === playerId;
          slot.className = 'bm-player' + (isWinner ? ' winner' : '') + (!playerId ? ' tbd' : '');
          slot.textContent = playerId ? (allPlayers[playerId]?.name || '?') : 'TBD';
          if (playerId === App.myId) {
            const tag = document.createElement('span');
            tag.className = 'bm-you'; tag.textContent = ' (you)';
            slot.appendChild(tag);
          }
          return slot;
        };

        const vs = document.createElement('div');
        vs.className = 'bm-vs'; vs.textContent = match.isBye ? '— bye —' : 'vs';

        col.appendChild(card);
        card.appendChild(makeSlot(match.p1));
        card.appendChild(vs);
        card.appendChild(makeSlot(match.p2));
      });

      bracket.appendChild(col);
    });
  }

  function renderBoard() {
    const cells = document.querySelectorAll('.ttt-cell');
    document.getElementById('ttt-board').style.opacity = '1';
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
    const matchLabel = document.getElementById('ttt-match-label');
    if (matchLabel) {
      matchLabel.textContent = bestOf > 0 ? `Best of ${bestOf}` : 'Free Play';
      matchLabel.classList.toggle('hidden', false);
    }
  }

  function renderScoresTournament() {
    if (!state.players) return;
    const { players } = state;
    document.getElementById('ttt-name-X').textContent = players.X.name + (players.X.id === App.myId ? ' (You)' : '');
    document.getElementById('ttt-name-O').textContent = players.O.name + (players.O.id === App.myId ? ' (You)' : '');
    document.getElementById('ttt-pts-X').textContent = '—';
    document.getElementById('ttt-pts-O').textContent = '—';
    document.getElementById('ttt-score-X').classList.toggle('active-turn', state.currentTurn === players.X.id && !state.winner);
    document.getElementById('ttt-score-O').classList.toggle('active-turn', state.currentTurn === players.O.id && !state.winner);
  }

  function renderStatus() {
    const result = document.getElementById('ttt-result');
    const status = document.getElementById('ttt-status');

    if (isTournament) {
      renderScoresTournament();
      if (state.winner) {
        if (state.winner === 'draw') {
          result.classList.remove('hidden');
          document.getElementById('ttt-result-text').textContent = "Draw! 🤝 Replaying…";
          document.getElementById('ttt-host-only').style.display = 'none';
          document.getElementById('btn-ttt-again').classList.add('hidden');
          document.getElementById('btn-ttt-new-match').classList.add('hidden');
        } else {
          const winnerPlayer = state.players[state.winnerSymbol];
          result.classList.remove('hidden');
          document.getElementById('ttt-result-text').textContent =
            winnerPlayer.id === App.myId ? 'You win this match! ✅' : `${winnerPlayer.name} wins this match! ✅`;
          document.getElementById('ttt-host-only').style.display = 'none';
          document.getElementById('btn-ttt-again').classList.add('hidden');
          document.getElementById('btn-ttt-new-match').classList.add('hidden');
        }
        status.textContent = '';
      } else {
        result.classList.add('hidden');
        if (!mySymbol) {
          status.textContent = '👁 Spectating this match';
        } else if (state.currentTurn === App.myId) {
          status.textContent = `Your turn! You are ${mySymbol === 'X' ? '✕' : '○'}`;
        } else {
          const other = state.currentTurn === state.players.X.id ? state.players.X : state.players.O;
          status.textContent = `${other.name}'s turn…`;
        }
      }
      return;
    }

    // Classic mode
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
