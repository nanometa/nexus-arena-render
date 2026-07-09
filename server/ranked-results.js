const { getMatchRegistryStatus, hashMatchPayload, hashText, recordMatchOnChain } = require('./onchain/matchRegistry');

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
  ctx.set('Access-Control-Allow-Headers', 'Content-Type');
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

function buildResultPayload({ matchID, state, metadata, log }) {
  const G = state?.G;
  const player0 = getPlayer(metadata, '0') || {};
  const player1 = getPlayer(metadata, '1') || {};
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
      0: { hash: player0Hash, name: player0.name || 'Player 1' },
      1: { hash: player1Hash, name: player1.name || 'Player 2' },
    },
    score: {
      player0: player0Score,
      player1: player1Score,
    },
    winner,
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
      ctx.body = {
        leaderboard: serializeLeaderboard(leaderboard),
        onchain: getMatchRegistryStatus(),
      };
      return;
    }

    if (ctx.path === '/api/onchain/status' && ctx.method === 'GET') {
      ctx.body = getMatchRegistryStatus();
      return;
    }

    if (ctx.path === '/api/ranked-match-results' && ctx.method === 'POST') {
      try {
        const body = await readJSONBody(ctx);
        const matchID = String(body.matchID || '').trim();
        const playerID = String(body.playerID ?? '');
        const credentials = body.credentials;

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
          ctx.body = {
            result: recordedResults.get(matchID),
            leaderboard: serializeLeaderboard(leaderboard),
          };
          return;
        }

        const result = buildResultPayload({ matchID, state, metadata, log });

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

        ctx.body = {
          result,
          leaderboard: serializeLeaderboard(leaderboard),
        };
        return;
      } catch (error) {
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
