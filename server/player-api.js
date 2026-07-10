const { ethers } = require('ethers');
const { normalizeAddress } = require('./onchain/genesisPack');
const { getSupabaseStatus, supabaseRest } = require('./supabase/client');
const { ensurePlayer, getInventory, getPacks } = require('./packs-api');

const MAX_BODY_BYTES = 64 * 1024;
const LOGIN_MAX_AGE_MS = 15 * 60 * 1000;

const memory = {
  players: new Map(),
};

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

function walletFromValue(value) {
  const normalized = normalizeAddress(value);
  if (!normalized) {
    const error = new Error('Valid walletAddress is required');
    error.status = 400;
    throw error;
  }
  return normalized;
}

function getMessageField(message, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(message || '').match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'im'));
  return match?.[1] || '';
}

function verifyWalletSignature({ walletAddress, message, signature }) {
  if (!message || !signature) {
    const error = new Error('Wallet signature is required');
    error.status = 401;
    throw error;
  }

  const messageWallet = walletFromValue(getMessageField(message, 'Wallet'));
  if (messageWallet !== walletAddress) {
    const error = new Error('Signed wallet does not match requested wallet');
    error.status = 401;
    throw error;
  }

  const issuedAt = Date.parse(getMessageField(message, 'Issued At'));
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > LOGIN_MAX_AGE_MS) {
    const error = new Error('Wallet signature expired. Sign in again.');
    error.status = 401;
    throw error;
  }

  const recovered = normalizeAddress(ethers.verifyMessage(message, signature));
  if (recovered !== walletAddress) {
    const error = new Error('Invalid wallet signature');
    error.status = 401;
    throw error;
  }
}

async function getPlayer(walletAddress) {
  if (!getSupabaseStatus().enabled) {
    return memory.players.get(walletAddress) || null;
  }

  try {
    const rows = await supabaseRest(
      `players?wallet_address=eq.${walletAddress}&select=*&limit=1`
    );
    return rows[0] || memory.players.get(walletAddress) || null;
  } catch (error) {
    return memory.players.get(walletAddress) || null;
  }
}

async function savePlayer(walletAddress, displayName) {
  if (!getSupabaseStatus().enabled) {
    const player = {
      wallet_address: walletAddress,
      display_name: displayName || 'Player',
      updated_at: new Date().toISOString(),
    };
    memory.players.set(walletAddress, player);
    return player;
  }

  try {
    return await ensurePlayer(walletAddress, displayName);
  } catch (error) {
    const player = {
      wallet_address: walletAddress,
      display_name: displayName || 'Player',
      updated_at: new Date().toISOString(),
    };
    memory.players.set(walletAddress, player);
    return player;
  }
}

async function getLeaderboardEntry(walletAddress) {
  if (!getSupabaseStatus().enabled) return null;
  const rows = await supabaseRest(
    `leaderboard_entries?wallet_address=eq.${walletAddress}&select=*&limit=1`
  );
  return rows[0] || null;
}

async function getMatchHistory(walletAddress) {
  if (!getSupabaseStatus().enabled) return [];

  try {
    return await supabaseRest(
      `matches?or=(player0_wallet.eq.${walletAddress},player1_wallet.eq.${walletAddress})&select=*&order=created_at.desc&limit=12`
    );
  } catch (error) {
    return [];
  }
}

async function buildPlayerDashboard(walletAddress) {
  const [profile, packs, inventory, leaderboardEntry, matches] = await Promise.all([
    getPlayer(walletAddress).catch(() => null),
    getPacks(walletAddress).catch(() => []),
    getInventory(walletAddress).catch(() => []),
    getLeaderboardEntry(walletAddress).catch(() => null),
    getMatchHistory(walletAddress),
  ]);

  return {
    walletAddress,
    profile,
    packs,
    inventory,
    stats: {
      games: Number(leaderboardEntry?.games || 0),
      wins: Number(leaderboardEntry?.wins || 0),
      losses: Number(leaderboardEntry?.losses || 0),
      draws: Number(leaderboardEntry?.draws || 0),
      points: Number(leaderboardEntry?.points || 0),
      powerFor: Number(leaderboardEntry?.power_for || 0),
      powerAgainst: Number(leaderboardEntry?.power_against || 0),
    },
    matches,
  };
}

function createPlayerApi({ allowedOrigins }) {
  return async function playerApi(ctx, next) {
    if (ctx.path.startsWith('/api/player')) {
      setApiCors(ctx, allowedOrigins);
      if (ctx.method === 'OPTIONS') {
        ctx.status = 204;
        return;
      }
    }

    if (ctx.path === '/api/player/session' && ctx.method === 'POST') {
      try {
        const body = await readJSONBody(ctx);
        const walletAddress = walletFromValue(body.walletAddress);
        verifyWalletSignature({
          walletAddress,
          message: body.message,
          signature: body.signature,
        });
        const displayName = String(body.displayName || '').trim() || 'Player';
        await savePlayer(walletAddress, displayName);
        ctx.body = {
          ...(await buildPlayerDashboard(walletAddress)),
          authenticated: true,
        };
        return;
      } catch (error) {
        ctx.status = error.status || 500;
        ctx.body = { error: error.message || 'Player session failed' };
        return;
      }
    }

    if (ctx.path === '/api/player/dashboard' && ctx.method === 'GET') {
      try {
        const walletAddress = walletFromValue(ctx.query.walletAddress || ctx.query.wallet);
        ctx.body = await buildPlayerDashboard(walletAddress);
        return;
      } catch (error) {
        ctx.status = error.status || 500;
        ctx.body = { error: error.message || 'Player dashboard unavailable' };
        return;
      }
    }

    await next();
  };
}

module.exports = {
  buildPlayerDashboard,
  createPlayerApi,
  verifyWalletSignature,
};
