const { getMatchRegistryStatus, hashMatchPayload, hashText, recordMatchOnChain } = require('./onchain/matchRegistry');
const { normalizeAddress } = require('./onchain/genesisPack');
const { getSupabaseStatus, supabaseRest } = require('./supabase/client');
const { ensurePlayer } = require('./packs-api');
const { buildPlayerDashboard } = require('./player-api');
const { requireSession, verifyMatchTicket } = require('./security/session');

const MATCHMAKING_MODE = 'matchmaking';
const MAX_BODY_BYTES = 64 * 1024;

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return false;
  return allowedOrigins.some((allowedOrigin) => {
    if (!allowedOrigin) return false;
    if (allowedOrigin instanceof RegExp) return allowedOrigin.test(origin);
    return allowedOrigin === origin;
  });
}

function setApiCors(ctx, allowedOrigins) {
  const origin = ctx.get('origin');
  if (isOriginAllowed(origin, allowedOrigins)) {
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Vary', 'Origin');
  }
  ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function readJSONBody(ctx) {
  return new Promise((resolve, reject) => {
    let raw = '';
    ctx.req.setEncoding('utf8');
    ctx.req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        ctx.req.destroy();
      }
    });
    ctx.req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    ctx.req.on('error', reject);
  });
}

function playerEntries(metadata) {
  return Object.entries(metadata?.players || {}).sort(([a], [b]) => Number(a) - Number(b));
}

function getPlayer(metadata, playerID) {
  return metadata?.players?.[String(playerID)];
}

function isRankedMatch(metadata) {
  if (metadata?.setupData?.mode === MATCHMAKING_MODE) return true;
  return playerEntries(metadata).some(([, player]) => player?.data?.mode === MATCHMAKING_MODE);
}

function getScore(G, playerID) {
  return {
    cards: Number(G?.score?.[playerID]?.cards || 0),
    power: Number(G?.score?.[playerID]?.power || 0),
  };
}

function walletFromPlayer(player, { matchID, playerID, mode }) {
  const walletAddress = normalizeAddress(player?.data?.walletAddress || '');
  if (!walletAddress || !player?.data?.identityTicket) {
    throw Object.assign(new Error('Verified player identity is missing'), { status: 403 });
  }
  verifyMatchTicket(player.data.identityTicket, {
    walletAddress,
    matchID,
    playerID,
    mode,
  });
  return walletAddress;
}

function buildResultPayload({ matchID, state, metadata, log, submitterPlayerID, submitterWalletAddress }) {
  const G = state?.G;
  const player0 = getPlayer(metadata, '0') || {};
  const player1 = getPlayer(metadata, '1') || {};
  const player0Wallet = walletFromPlayer(player0, {
    matchID,
    playerID: '0',
    mode: MATCHMAKING_MODE,
  });
  const player1Wallet = walletFromPlayer(player1, {
    matchID,
    playerID: '1',
    mode: MATCHMAKING_MODE,
  });
  if (player0Wallet === player1Wallet) {
    throw Object.assign(new Error('Ranked self-play is not allowed'), { status: 403 });
  }
  const submitterWallet = submitterPlayerID === '0' ? player0Wallet : player1Wallet;
  if (submitterWallet !== submitterWalletAddress) {
    throw Object.assign(new Error('Wallet session does not own this player seat'), { status: 403 });
  }
  const player0Score = getScore(G, '0');
  const player1Score = getScore(G, '1');
  const playedAt = Math.floor(Date.now() / 1000);
  const winner = G?.winner || 'draw';
  const movesHash = hashMatchPayload(
    (log || []).map((entry) => ({
      action: entry.action,
      turn: entry.turn,
      phase: entry.phase,
      playerID: entry.playerID,
    }))
  );
  const player0Hash = hashText(`${matchID}:0:${player0.name || 'Player 1'}`);
  const player1Hash = hashText(`${matchID}:1:${player1.name || 'Player 2'}`);
  const winnerHash =
    winner === 'draw'
      ? hashText(`${matchID}:draw`)
      : winner === '0'
        ? player0Hash
        : player1Hash;

  const proofPayload = {
    game: metadata.gameName,
    matchID,
    mode: MATCHMAKING_MODE,
    players: {
      0: { hash: player0Hash, name: player0.name || 'Player 1', walletAddress: player0Wallet },
      1: { hash: player1Hash, name: player1.name || 'Player 2', walletAddress: player1Wallet },
    },
    score: {
      player0: player0Score,
      player1: player1Score,
    },
    winner,
    winnerWallet:
      winner === 'draw'
        ? null
        : winner === '0'
          ? player0Wallet || null
          : player1Wallet || null,
    winnerHash,
    movesHash,
    playedAt,
  };

  return {
    ...proofPayload,
    matchIDHash: hashText(`nexus-arena:${matchID}`),
    matchHash: hashMatchPayload(proofPayload),
  };
}

function serializeSupabaseEntry(entry) {
  return {
    id: entry.wallet_address,
    walletAddress: entry.wallet_address,
    name: entry.display_name || 'Player',
    games: Number(entry.games || 0),
    wins: Number(entry.wins || 0),
    losses: Number(entry.losses || 0),
    draws: Number(entry.draws || 0),
    points: Number(entry.points || 0),
    powerFor: Number(entry.power_for || 0),
    powerAgainst: Number(entry.power_against || 0),
    lastPlayedAt: entry.updated_at ? Math.floor(new Date(entry.updated_at).getTime() / 1000) : 0,
  };
}

async function fetchPersistentLeaderboard() {
  if (!getSupabaseStatus().enabled) return null;
  try {
    const rows = await supabaseRest(
      'leaderboard_entries?select=*&order=points.desc,wins.desc,power_for.desc,updated_at.desc&limit=25'
    );
    return rows.map(serializeSupabaseEntry);
  } catch (error) {
    return null;
  }
}

async function fetchPersistentMatch(matchID) {
  if (!getSupabaseStatus().enabled) return null;
  const rows = await supabaseRest(
    `matches?match_id=eq.${encodeURIComponent(matchID)}&select=*&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

async function upsertPersistentLeaderboardEntry({ playerID, player, score, opponentScore, winner, playedAt }) {
  if (!player.walletAddress) return;

  await ensurePlayer(player.walletAddress, player.name);
  const existingRows = await supabaseRest(
    `leaderboard_entries?wallet_address=eq.${player.walletAddress}&select=*&limit=1`
  ).catch(() => []);
  const existing = existingRows[0] || {};
  const isDraw = winner === 'draw';
  const won = winner === playerID;
  const next = {
    wallet_address: player.walletAddress,
    display_name: player.name,
    games: Number(existing.games || 0) + 1,
    wins: Number(existing.wins || 0) + (won ? 1 : 0),
    losses: Number(existing.losses || 0) + (!won && !isDraw ? 1 : 0),
    draws: Number(existing.draws || 0) + (isDraw ? 1 : 0),
    power_for: Number(existing.power_for || 0) + Number(score.power || 0),
    power_against: Number(existing.power_against || 0) + Number(opponentScore.power || 0),
    updated_at: new Date(playedAt * 1000).toISOString(),
  };
  next.points = next.wins * 3 + next.draws;

  await supabaseRest('leaderboard_entries?on_conflict=wallet_address', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [next],
  });
}

async function persistMatchRecord(result, log) {
  if (!getSupabaseStatus().enabled) return;

  const player0 = result.players['0'];
  const player1 = result.players['1'];
  await Promise.all([
    player0.walletAddress ? ensurePlayer(player0.walletAddress, player0.name) : Promise.resolve(),
    player1.walletAddress ? ensurePlayer(player1.walletAddress, player1.name) : Promise.resolve(),
  ]);

  const fullMatchRow = {
    match_id: result.matchID,
    player0_wallet: player0.walletAddress || null,
    player1_wallet: player1.walletAddress || null,
    player0_name: player0.name,
    player1_name: player1.name,
    winner_wallet: result.winnerWallet,
    winner_player_id: result.winner,
    score: result.score,
    mode: result.mode,
    onchain_tx_hash: result.onchain?.txHash || null,
    completed_at: new Date(result.playedAt * 1000).toISOString(),
    created_at: new Date(result.playedAt * 1000).toISOString(),
  };
  const legacyMatchRow = {
    match_id: result.matchID,
    player0_wallet: player0.walletAddress || null,
    player1_wallet: player1.walletAddress || null,
    winner_wallet: result.winnerWallet,
    score: result.score,
    mode: result.mode,
    created_at: new Date(result.playedAt * 1000).toISOString(),
  };

  await supabaseRest('matches?on_conflict=match_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [fullMatchRow],
  }).catch(() =>
    supabaseRest('matches?on_conflict=match_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [legacyMatchRow],
    })
  );

  const events = (log || []).slice(0, 220).map((entry, index) => {
    const eventPlayerID = String(entry.playerID ?? '');
    const eventPlayer = result.players[eventPlayerID] || {};
    return {
      match_id: result.matchID,
      event_index: index,
      turn: Number(entry.turn || 0),
      phase: String(entry.phase || ''),
      player_id: eventPlayerID || null,
      player_wallet: eventPlayer.walletAddress || null,
      action: String(entry.action || 'move'),
      payload: entry,
    };
  });

  if (events.length > 0) {
    await supabaseRest('match_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: events,
    }).catch(() => null);
  }

  await Promise.all([
    upsertPersistentLeaderboardEntry({
      playerID: '0',
      player: player0,
      score: result.score.player0,
      opponentScore: result.score.player1,
      winner: result.winner,
      playedAt: result.playedAt,
    }),
    upsertPersistentLeaderboardEntry({
      playerID: '1',
      player: player1,
      score: result.score.player1,
      opponentScore: result.score.player0,
      winner: result.winner,
      playedAt: result.playedAt,
    }),
  ]);
}

function updateLeaderboard(leaderboard, result) {
  const isDraw = result.winner === 'draw';

  Object.entries(result.players).forEach(([playerID, player]) => {
    const key = player.hash;
    const score = playerID === '0' ? result.score.player0 : result.score.player1;
    const opponentScore = playerID === '0' ? result.score.player1 : result.score.player0;
    const won = result.winner === playerID;
    const entry =
      leaderboard.get(key) ||
      {
        id: key,
        name: player.name,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        powerFor: 0,
        powerAgainst: 0,
        lastPlayedAt: 0,
        lastTxHash: null,
      };

    entry.name = player.name;
    entry.games += 1;
    entry.wins += won ? 1 : 0;
    entry.losses += !won && !isDraw ? 1 : 0;
    entry.draws += isDraw ? 1 : 0;
    entry.points = entry.wins * 3 + entry.draws;
    entry.powerFor += score.power;
    entry.powerAgainst += opponentScore.power;
    entry.lastPlayedAt = result.playedAt;
    if (result.onchain?.txHash) entry.lastTxHash = result.onchain.txHash;

    leaderboard.set(key, entry);
  });
}

function serializeLeaderboard(leaderboard) {
  return [...leaderboard.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.powerFor - a.powerFor ||
        b.lastPlayedAt - a.lastPlayedAt
    )
    .slice(0, 25);
}

function createRankedResultsApi({ gameName, allowedOrigins }) {
  const recordedResults = new Map();
  const processingResults = new Set();
  const leaderboard = new Map();

  return async function rankedResultsApi(ctx, next) {
    if (ctx.path === '/api/leaderboard' || ctx.path === '/api/ranked-match-results' || ctx.path === '/api/onchain/status') {
      setApiCors(ctx, allowedOrigins);
      if (ctx.method === 'OPTIONS') {
        ctx.status = 204;
        return;
      }
    }

    if (ctx.path === '/api/leaderboard' && ctx.method === 'GET') {
      const persistentLeaderboard = await fetchPersistentLeaderboard();
      ctx.body = {
        leaderboard: persistentLeaderboard || serializeLeaderboard(leaderboard),
        onchain: getMatchRegistryStatus(),
      };
      return;
    }

    if (ctx.path === '/api/onchain/status' && ctx.method === 'GET') {
      ctx.body = getMatchRegistryStatus();
      return;
    }

    if (ctx.path === '/api/ranked-match-results' && ctx.method === 'POST') {
      let lockedMatchID = '';
      try {
        const session = requireSession(ctx);
        const body = await readJSONBody(ctx);
        const matchID = String(body.matchID || '').trim();
        const playerID = String(body.playerID ?? '');
        const credentials = body.credentials;
        const submittedWalletAddress = normalizeAddress(body.walletAddress || '');
        const submitterWalletAddress = session.walletAddress;

        if (submittedWalletAddress && submittedWalletAddress !== submitterWalletAddress) {
          ctx.status = 403;
          ctx.body = { error: 'Wallet session does not match submitted wallet' };
          return;
        }

        if (!matchID) {
          ctx.status = 400;
          ctx.body = { error: 'matchID is required' };
          return;
        }
        if (!playerID || !credentials) {
          ctx.status = 403;
          ctx.body = { error: 'playerID and credentials are required' };
          return;
        }

        const { state, metadata, log } = await ctx.app.context.db.fetch(matchID, {
          state: true,
          metadata: true,
          log: true,
        });

        if (!state || !metadata) {
          ctx.status = 404;
          ctx.body = { error: 'Match not found' };
          return;
        }
        if (metadata.gameName !== gameName) {
          ctx.status = 400;
          ctx.body = { error: 'Wrong game' };
          return;
        }
        if (!getPlayer(metadata, playerID)) {
          ctx.status = 404;
          ctx.body = { error: 'Player not found' };
          return;
        }

        const isAuthorized = await ctx.app.context.auth.authenticateCredentials({
          playerID,
          credentials,
          metadata,
        });

        if (!isAuthorized) {
          ctx.status = 403;
          ctx.body = { error: 'Invalid credentials' };
          return;
        }
        if (!isRankedMatch(metadata)) {
          ctx.status = 409;
          ctx.body = { error: 'Only automatic Multiplayer matches count for leaderboard' };
          return;
        }
        if (!state.G?.winner) {
          ctx.status = 409;
          ctx.body = { error: 'Match is not complete yet' };
          return;
        }

        if (recordedResults.has(matchID)) {
          const persistentLeaderboard = await fetchPersistentLeaderboard();
          const dashboard = submitterWalletAddress
            ? await buildPlayerDashboard(submitterWalletAddress).catch(() => null)
            : null;
          ctx.body = {
            result: recordedResults.get(matchID),
            dashboard,
            leaderboard: persistentLeaderboard || serializeLeaderboard(leaderboard),
          };
          return;
        }

        if (processingResults.has(matchID)) {
          ctx.status = 409;
          ctx.body = { error: 'Match result is already being recorded' };
          return;
        }
        processingResults.add(matchID);
        lockedMatchID = matchID;

        const persistentMatch = await fetchPersistentMatch(matchID);
        if (persistentMatch) {
          const persistentLeaderboard = await fetchPersistentLeaderboard();
          const dashboard = await buildPlayerDashboard(submitterWalletAddress).catch(() => null);
          processingResults.delete(matchID);
          lockedMatchID = '';
          ctx.body = {
            result: { matchID, alreadyRecorded: true, persistent: true },
            dashboard,
            leaderboard: persistentLeaderboard || serializeLeaderboard(leaderboard),
          };
          return;
        }

        const result = buildResultPayload({
          matchID,
          state,
          metadata,
          log,
          submitterPlayerID: playerID,
          submitterWalletAddress,
        });

        try {
          result.onchain = await recordMatchOnChain(result);
        } catch (error) {
          result.onchain = {
            status: 'failed',
            reason: error.message || 'On-chain write failed',
          };
        }

        recordedResults.set(matchID, result);
        updateLeaderboard(leaderboard, result);
        await persistMatchRecord(result, log).catch((error) => {
          result.persistence = {
            status: 'failed',
            reason: error.message || 'Supabase persistence failed',
          };
        });

        const persistentLeaderboard = await fetchPersistentLeaderboard();
        const dashboard = submitterWalletAddress
          ? await buildPlayerDashboard(submitterWalletAddress).catch(() => null)
          : null;

        processingResults.delete(matchID);
        lockedMatchID = '';
        ctx.body = {
          result,
          dashboard,
          leaderboard: persistentLeaderboard || serializeLeaderboard(leaderboard),
        };
        return;
      } catch (error) {
        if (lockedMatchID) processingResults.delete(lockedMatchID);
        ctx.status = error.status || 500;
        ctx.body = { error: error.message || 'Ranked result registration failed' };
        return;
      }
    }

    await next();
  };
}

module.exports = {
  createRankedResultsApi,
};
