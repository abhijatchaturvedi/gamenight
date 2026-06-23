// Simulates the full tournament bracket logic for player counts 3–8.
// Run with: node test-tournament.js

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

function buildTournamentRounds(playerIds) {
  const size = nextPow2(playerIds.length);
  const seeds = [...playerIds];
  while (seeds.length < size) seeds.push(null);
  const rounds = [];
  let current = seeds;
  let prevPhantoms = null;
  while (current.length > 1) {
    const matches = [];
    const phantoms = [];
    for (let i = 0; i < current.length; i += 2) {
      const p1 = current[i], p2 = current[i + 1] ?? null;
      const isBye = p2 === null;
      const phantom = prevPhantoms === null
        ? (p1 === null && p2 === null)
        : ((prevPhantoms[i] ?? true) && (prevPhantoms[i + 1] ?? true));
      matches.push({ p1, p2, winner: isBye ? p1 : null, isBye, phantom });
      phantoms.push(phantom);
    }
    rounds.push(matches);
    prevPhantoms = phantoms;
    current = new Array(matches.length).fill(null);
  }
  return rounds;
}

function propagateTournamentWinners(rounds) {
  for (let r = 0; r < rounds.length - 1; r++) {
    const cur = rounds[r], nxt = rounds[r + 1];
    for (let m = 0; m < cur.length; m += 2) {
      const ti = Math.floor(m / 2);
      if (ti >= nxt.length) break;
      const match1 = cur[m], match2 = cur[m + 1];
      if (match1?.winner) nxt[ti].p1 = match1.winner;
      if (match2?.winner) nxt[ti].p2 = match2.winner;
      const m2empty = !match2 || match2.phantom;
      const m1empty = !match1 || match1.phantom;
      if (nxt[ti].p1 && !nxt[ti].p2 && !nxt[ti].winner && m2empty) { nxt[ti].winner = nxt[ti].p1; nxt[ti].isBye = true; }
      if (nxt[ti].p2 && !nxt[ti].p1 && !nxt[ti].winner && m1empty) { nxt[ti].winner = nxt[ti].p2; nxt[ti].isBye = true; }
    }
  }
}

function simulateTournament(n) {
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const rounds = buildTournamentRounds(players);
  const matchLog = [];
  const playCount = Object.fromEntries(players.map(p => [p, 0]));
  let safetyLimit = 50;

  while (safetyLimit-- > 0) {
    propagateTournamentWinners(rounds);

    const final = rounds[rounds.length - 1][0];
    if (final.winner) {
      return { ok: true, winner: final.winner, matches: matchLog, playCount };
    }

    let found = false;
    for (let r = 0; r < rounds.length; r++) {
      for (let m = 0; m < rounds[r].length; m++) {
        const match = rounds[r][m];
        if (!match.winner && match.p1 && match.p2) {
          // P1 always wins (deterministic — we just want to verify bracket flow)
          match.winner = match.p1;
          matchLog.push(`R${r + 1}M${m + 1}: ${match.p1} vs ${match.p2} → ${match.winner} wins`);
          playCount[match.p1]++;
          playCount[match.p2]++;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) return { ok: false, error: 'No playable match found and no winner', matchLog, rounds };
  }

  return { ok: false, error: 'Safety limit hit', matchLog };
}

let allPassed = true;

for (let n = 3; n <= 8; n++) {
  const result = simulateTournament(n);
  if (!result.ok) {
    console.log(`\n❌ ${n} players — FAIL: ${result.error}`);
    allPassed = false;
    continue;
  }

  const playedAll = Object.entries(result.playCount).every(([, c]) => c >= 1);
  const status = playedAll ? '✅' : '❌ (some players never played!)';
  console.log(`\n${status} ${n} players — winner: ${result.winner} after ${result.matches.length} match(es)`);
  result.matches.forEach(m => console.log(`   ${m}`));

  const noGames = Object.entries(result.playCount).filter(([, c]) => c === 0).map(([p]) => p);
  if (noGames.length) {
    console.log(`   ⚠️  Never played: ${noGames.join(', ')}`);
    allPassed = false;
  }
}

console.log(`\n${allPassed ? '✅ All player counts passed.' : '❌ Some counts failed.'}\n`);
