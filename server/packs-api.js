const { ethers } = require('ethers');
const { loadCardCatalog, summarizeCatalog } = require('./cards/catalog');
const { getGenesisPackStatus, normalizeAddress, readPackDropStats, verifyPackMinted, verifyPackOpened } = require('./onchain/genesisPack');
const { getSupabaseStatus, supabaseRest } = require('./supabase/client');

const MAX_BODY_BYTES = 96 * 1024;
const CARDS_PER_PACK = 20;
const PACK_PLAN = [
  ['common', 10],
  ['rare', 6],
  ['epic', 3],
  ['legendary', 1],
];

const memory = {
  packs: new Map(),
  inventory: new Map(),
  openings: new Map(),
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

function tokenFromValue(value) {
  const tokenId = Number(value);
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    const error = new Error('Valid tokenId is required');
    error.status = 400;
    throw error;
  }
  return tokenId;
}

function txHashFromValue(value) {
  if (!value) return '';
  if (!ethers.isHexString(value, 32)) {
    const error = new Error('Valid txHash is required');
    error.status = 400;
    throw error;
  }
  return value;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return function rng() {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne(cards, rng, usedIds) {
  const available = cards.filter((card) => !usedIds.has(card.id));
  const pool = available.length > 0 ? available : cards;
  if (pool.length === 0) return null;
  const picked = pool[Math.floor(rng() * pool.length)];
  usedIds.add(picked.id);
  return picked;
}

function generateBalancedPack(catalog, seed) {
  const rng = createRng(seed);
  const usedIds = new Set();
  const cards = [];

  PACK_PLAN.forEach(([rarity, count]) => {
    const pool = catalog.filter((card) => card.rarity === rarity);
    for (let index = 0; index < count; index += 1) {
      const picked = pickOne(pool, rng, usedIds);
      if (picked) cards.push(picked);
    }
  });

  while (cards.length < CARDS_PER_PACK) {
    const picked = pickOne(catalog, rng, usedIds);
    if (!picked) break;
    cards.push(picked);
  }

  return cards.slice(0, CARDS_PER_PACK).map((card, index) => ({
    ...card,
    copyNumber: index + 1,
  }));
}

function byCreatedAtDesc(a, b) {
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

async function ensurePlayer(walletAddress, displayName) {
  const status = getSupabaseStatus();
  if (!status.enabled) return null;

  const [player] = await supabaseRest('players?on_conflict=wallet_address', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [
      {
        wallet_address: walletAddress,
        display_name: displayName || null,
        updated_at: new Date().toISOString(),
      },
    ],
  });
  return player;
}

async function upsertPack({ walletAddress, tokenId, mintedTxHash, openedTxHash, status }) {
  const supabaseStatus = getSupabaseStatus();
  if (!supabaseStatus.enabled) {
    const pack = {
      wallet_address: walletAddress,
      token_id: tokenId,
      minted_tx_hash: mintedTxHash || null,
      opened_tx_hash: openedTxHash || null,
      status,
      updated_at: new Date().toISOString(),
    };
    memory.packs.set(`${walletAddress}:${tokenId}`, pack);
    return pack;
  }

  const [pack] = await supabaseRest('player_packs?on_conflict=token_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [
      {
        wallet_address: walletAddress,
        token_id: tokenId,
        minted_tx_hash: mintedTxHash || null,
        opened_tx_hash: openedTxHash || null,
        status,
        opened_at: status === 'opened' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
    ],
  });
  return pack;
}

async function getExistingOpening(walletAddress, tokenId) {
  if (!getSupabaseStatus().enabled) {
    return memory.openings.get(`${walletAddress}:${tokenId}`) || null;
  }

  const rows = await supabaseRest(
    `pack_openings?wallet_address=eq.${walletAddress}&pack_token_id=eq.${tokenId}&select=*&limit=1`
  );
  return rows[0] || null;
}

async function insertOpening({ walletAddress, tokenId, txHash, seed, cards }) {
  const opening = {
    wallet_address: walletAddress,
    pack_token_id: tokenId,
    opened_tx_hash: txHash || null,
    seed,
    card_ids: cards.map((card) => card.id),
    opened_at: new Date().toISOString(),
  };

  if (!getSupabaseStatus().enabled) {
    memory.openings.set(`${walletAddress}:${tokenId}`, opening);
    return opening;
  }

  const [row] = await supabaseRest('pack_openings', {
    method: 'POST',
    prefer: 'return=representation',
    body: [opening],
  });
  return row;
}

async function insertPlayerCards({ walletAddress, tokenId, cards }) {
  const rows = cards.map((card) => ({
    wallet_address: walletAddress,
    card_id: card.id,
    pack_token_id: tokenId,
    copy_number: card.copyNumber,
  }));

  if (!getSupabaseStatus().enabled) {
    const current = memory.inventory.get(walletAddress) || [];
    const next = [
      ...current,
      ...cards.map((card) => ({
        ...card,
        card_id: card.id,
        pack_token_id: tokenId,
        created_at: new Date().toISOString(),
      })),
    ];
    memory.inventory.set(walletAddress, next);
    return next;
  }

  await supabaseRest('player_cards', {
    method: 'POST',
    prefer: 'return=minimal',
    body: rows,
  });

  return getInventory(walletAddress);
}

async function getInventory(walletAddress) {
  if (!getSupabaseStatus().enabled) {
    return (memory.inventory.get(walletAddress) || []).slice().sort(byCreatedAtDesc);
  }

  const rows = await supabaseRest(
    `player_cards?wallet_address=eq.${walletAddress}&select=card_id,copy_number,pack_token_id,created_at,cards(id,name,element,tier,rarity,score,image)&order=created_at.desc`
  );

  return rows.map((row) => ({
    id: row.cards?.id || row.card_id,
    card_id: row.card_id,
    name: row.cards?.name || row.card_id,
    element: row.cards?.element || '',
    tier: row.cards?.tier || '',
    rarity: row.cards?.rarity || '',
    score: row.cards?.score || 0,
    image: row.cards?.image || '',
    copyNumber: row.copy_number,
    pack_token_id: row.pack_token_id,
    created_at: row.created_at,
  }));
}

async function getPacks(walletAddress) {
  if (!getSupabaseStatus().enabled) {
    return [...memory.packs.values()]
      .filter((pack) => pack.wallet_address === walletAddress)
      .sort((a, b) => Number(a.token_id) - Number(b.token_id));
  }

  return supabaseRest(
    `player_packs?wallet_address=eq.${walletAddress}&select=*&order=token_id.asc`
  );
}

function createPacksApi({ allowedOrigins }) {
  const cardCatalog = loadCardCatalog();
  const catalogSummary = summarizeCatalog(cardCatalog);

  return async function packsApi(ctx, next) {
    if (ctx.path.startsWith('/api/packs')) {
      setApiCors(ctx, allowedOrigins);
      if (ctx.method === 'OPTIONS') {
        ctx.status = 204;
        return;
      }
    }

    if (ctx.path === '/api/packs/status' && ctx.method === 'GET') {
      let drop = null;
      try {
        drop = await readPackDropStats();
      } catch (error) {
        drop = { error: error.message };
      }
      ctx.body = {
        cardsPerPack: CARDS_PER_PACK,
        packPlan: Object.fromEntries(PACK_PLAN),
        catalog: catalogSummary,
        supabase: getSupabaseStatus(),
        onchain: getGenesisPackStatus(),
        drop,
      };
      return;
    }

    if (ctx.path === '/api/packs/catalog' && ctx.method === 'GET') {
      const limit = Math.min(Number(ctx.query.limit || 40), 200);
      ctx.body = {
        summary: catalogSummary,
        cards: cardCatalog.slice(0, limit),
      };
      return;
    }

    if (ctx.path === '/api/packs/inventory' && ctx.method === 'GET') {
      try {
        const walletAddress = walletFromValue(ctx.query.walletAddress || ctx.query.wallet);
        ctx.body = {
          walletAddress,
          packs: await getPacks(walletAddress),
          inventory: await getInventory(walletAddress),
        };
        return;
      } catch (error) {
        ctx.status = error.status || 500;
        ctx.body = { error: error.message || 'Inventory unavailable' };
        return;
      }
    }

    if (ctx.path === '/api/packs/register-mint' && ctx.method === 'POST') {
      try {
        const body = await readJSONBody(ctx);
        const walletAddress = walletFromValue(body.walletAddress);
        const tokenId = tokenFromValue(body.tokenId);
        const txHash = txHashFromValue(body.txHash);
        const existingPacks = await getPacks(walletAddress);

        if (existingPacks.length > 0 && !existingPacks.some((pack) => Number(pack.token_id) === tokenId)) {
          ctx.status = 409;
          ctx.body = { error: 'This wallet already has a Genesis Pack' };
          return;
        }

        const verification = txHash
          ? await verifyPackMinted({ walletAddress, tokenId, txHash })
          : { verified: false, status: 'unverified', reason: 'No txHash provided' };

        if (getGenesisPackStatus().strict && !verification.verified) {
          ctx.status = 409;
          ctx.body = { error: verification.reason || 'Mint verification failed', verification };
          return;
        }

        await ensurePlayer(walletAddress, body.displayName);
        const pack = await upsertPack({
          walletAddress,
          tokenId,
          mintedTxHash: txHash,
          status: 'minted',
        });

        ctx.body = {
          pack,
          verification,
          packs: await getPacks(walletAddress),
          inventory: await getInventory(walletAddress),
        };
        return;
      } catch (error) {
        ctx.status = error.status || 500;
        ctx.body = { error: error.message || 'Pack mint registration failed' };
        return;
      }
    }

    if (ctx.path === '/api/packs/open' && ctx.method === 'POST') {
      try {
        const body = await readJSONBody(ctx);
        const walletAddress = walletFromValue(body.walletAddress);
        const tokenId = tokenFromValue(body.tokenId);
        const txHash = txHashFromValue(body.txHash);

        const verification = txHash
          ? await verifyPackOpened({ walletAddress, tokenId, txHash })
          : { verified: false, status: 'unverified', reason: 'No txHash provided' };

        if (getGenesisPackStatus().strict && !verification.verified) {
          ctx.status = 409;
          ctx.body = { error: verification.reason || 'Open verification failed', verification };
          return;
        }

        const existingOpening = await getExistingOpening(walletAddress, tokenId);
        if (existingOpening) {
          ctx.body = {
            opened: false,
            reason: 'Pack already opened',
            verification,
            packs: await getPacks(walletAddress),
            inventory: await getInventory(walletAddress),
          };
          return;
        }

        await ensurePlayer(walletAddress, body.displayName);
        const seed = `${walletAddress}:${tokenId}:${txHash || 'dev-open'}`;
        const cards = generateBalancedPack(cardCatalog, seed);
        await upsertPack({
          walletAddress,
          tokenId,
          openedTxHash: txHash,
          status: 'opened',
        });
        await insertOpening({ walletAddress, tokenId, txHash, seed, cards });
        const inventory = await insertPlayerCards({ walletAddress, tokenId, cards });

        ctx.body = {
          opened: true,
          cards,
          verification,
          packs: await getPacks(walletAddress),
          inventory,
        };
        return;
      } catch (error) {
        ctx.status = error.status || 500;
        ctx.body = { error: error.message || 'Pack opening failed' };
        return;
      }
    }

    await next();
  };
}

module.exports = {
  createPacksApi,
  ensurePlayer,
  generateBalancedPack,
  getInventory,
  getPacks,
};
