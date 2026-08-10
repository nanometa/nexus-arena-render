import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { createPublicClient, http, isAddress, parseEventLogs } from 'npm:viem@2.55.0';
import { applyGameMove, createGameState, publicGameView } from '../_shared/game-engine.mjs';
import { walletFromWeb3AuthUser } from '../_shared/wallet-identity.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY =
  Deno.env.get('NEXUS_PUBLIC_API_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LITVM_RPC_URL = Deno.env.get('LITVM_RPC_URL') || 'https://liteforge.rpc.caldera.xyz/http';
const GENESIS_PACK_ADDRESS = Deno.env.get('GENESIS_PACK_ADDRESS') || '';
const PACK_CHAIN_STRICT = (Deno.env.get('PACK_CHAIN_STRICT') || 'true') === 'true';
const EXTRA_ORIGINS = (Deno.env.get('APP_ORIGINS') || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  'https://nexusarena.pro',
  'https://www.nexusarena.pro',
  'https://nexus-arena.pages.dev',
  'https://nexus-arena-4iz.pages.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  ...EXTRA_ORIGINS,
]);

function isAllowedOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^nexus-arena(?:-[a-z0-9]+)?\.pages\.dev$/.test(url.hostname);
  } catch (_error) {
    return false;
  }
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PACK_ABI = [
  {
    type: 'event',
    name: 'PackMinted',
    inputs: [
      { indexed: true, name: 'player', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'PackOpened',
    inputs: [
      { indexed: true, name: 'player', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
  },
] as const;

const chainClient = createPublicClient({ transport: http(LITVM_RPC_URL) });

const PACK_PLAN = [
  ['300-390', '400-490'], ['300-390', '400-490'], ['400-490'], ['400-490'],
  ['400-490', '500-590'], ['500-590'], ['500-590'], ['500-590', '600-680'],
  ['600-680'], ['600-680'], ['600-680', '700-740'], ['700-740'], ['700-740'],
  ['700-740', '750'], ['300-390', '400-490'], ['400-490', '500-590'],
  ['500-590'], ['500-590', '600-680'], ['600-680'], ['600-680', '700-740'],
];

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'https://nexusarena.pro',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function response(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function fail(message: string, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function normalizeWallet(value: unknown) {
  const wallet = String(value || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) fail('Invalid wallet address');
  return wallet;
}

function cleanName(value: unknown) {
  return String(value || '').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, 18);
}

function defaultName(wallet: string) {
  return `Pilot ${wallet.slice(-4).toUpperCase()}`;
}

function randomID(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const value = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return `${prefix}${value}`;
}

function walletFromAuthUser(user: any) {
  try {
    return walletFromWeb3AuthUser(user);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Authenticated wallet identity is missing', 401);
  }
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) fail('Wallet authentication required', 401);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) fail('Wallet session is invalid or expired', 401);
  return { user: data.user, wallet: walletFromAuthUser(data.user) };
}

async function ensurePlayer(user: any, wallet: string, requestedName = '') {
  const { data: existing, error: readError } = await admin
    .from('players').select('*').eq('wallet_address', wallet).maybeSingle();
  if (readError) throw readError;
  if (existing?.auth_user_id && existing.auth_user_id !== user.id) {
    fail('Wallet is already linked to another account', 409);
  }
  const nextName = cleanName(requestedName) || existing?.display_name || defaultName(wallet);
  const row = {
    wallet_address: wallet,
    auth_user_id: user.id,
    display_name: nextName,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from('players').upsert(row, { onConflict: 'wallet_address' })
    .select('*').single();
  if (error) throw error;
  if (requestedName) {
    await admin.from('leaderboard_entries').update({ display_name: nextName, updated_at: new Date().toISOString() })
      .eq('wallet_address', wallet);
  }
  return data;
}

async function inventoryFor(wallet: string) {
  const { data, error } = await admin
    .from('player_cards')
    .select('card_id,copy_number,pack_token_id,created_at,cards(id,name,element,tier,rarity,score,image)')
    .eq('wallet_address', wallet)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.cards?.id || row.card_id,
    card_id: row.card_id,
    name: row.cards?.name || row.card_id,
    element: row.cards?.element || '',
    tier: row.cards?.tier || '',
    rarity: row.cards?.rarity || '',
    score: Number(row.cards?.score || 0),
    image: row.cards?.image || '',
    copyNumber: row.copy_number,
    pack_token_id: row.pack_token_id,
    created_at: row.created_at,
  }));
}

async function dashboardFor(wallet: string) {
  const [{ data: profile }, { data: stats }, { data: packs }, inventory, { data: matches }] = await Promise.all([
    admin.from('players').select('*').eq('wallet_address', wallet).maybeSingle(),
    admin.from('leaderboard_entries').select('*').eq('wallet_address', wallet).maybeSingle(),
    admin.from('player_packs').select('*').eq('wallet_address', wallet).order('token_id'),
    inventoryFor(wallet),
    admin.from('matches').select('*')
      .or(`player0_wallet.eq.${wallet},player1_wallet.eq.${wallet}`)
      .order('created_at', { ascending: false }).limit(20),
  ]);
  return {
    walletAddress: wallet,
    profile: profile || null,
    stats: stats || { games: 0, wins: 0, losses: 0, draws: 0, points: 0 },
    packs: packs || [],
    inventory,
    matches: matches || [],
  };
}

async function getLeaderboard() {
  const { data: rows, error } = await admin.from('leaderboard_entries').select('*')
    .order('points', { ascending: false }).order('wins', { ascending: false }).limit(25);
  if (error) throw error;
  const wallets = (rows || []).map((row) => row.wallet_address);
  const { data: profiles } = wallets.length
    ? await admin.from('players').select('wallet_address,display_name').in('wallet_address', wallets)
    : { data: [] };
  const names = new Map((profiles || []).map((row) => [row.wallet_address, row.display_name]));
  return (rows || []).map((row) => ({
    id: row.wallet_address,
    walletAddress: row.wallet_address,
    name: names.get(row.wallet_address) || row.display_name || defaultName(row.wallet_address),
    games: Number(row.games || 0), wins: Number(row.wins || 0), losses: Number(row.losses || 0),
    draws: Number(row.draws || 0), points: Number(row.points || 0),
    powerFor: Number(row.power_for || 0), powerAgainst: Number(row.power_against || 0),
  }));
}

async function verifyPackEvent(txHash: string, eventName: 'PackMinted' | 'PackOpened', wallet: string, tokenId: bigint) {
  if (!PACK_CHAIN_STRICT) return { verified: false, status: 'unverified' };
  if (!GENESIS_PACK_ADDRESS || !isAddress(GENESIS_PACK_ADDRESS)) fail('Genesis Pack contract is not configured', 503);
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) fail('Invalid transaction hash');
  const receipt = await chainClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (receipt.status !== 'success') fail('Pack transaction failed onchain', 409);
  if (receipt.to?.toLowerCase() !== GENESIS_PACK_ADDRESS.toLowerCase()) fail('Wrong pack contract', 409);
  const logs = parseEventLogs({ abi: PACK_ABI, eventName, logs: receipt.logs });
  const event = logs.find((log: any) =>
    String(log.args?.player || '').toLowerCase() === wallet && BigInt(log.args?.tokenId) === tokenId
  );
  if (!event) fail(`${eventName} event does not match this wallet and token`, 409);
  return { verified: true, status: 'verified', blockNumber: Number(receipt.blockNumber) };
}

function choosePackCards(cards: any[]) {
  const unused = new Set(cards.map((card) => card.id));
  const selected: any[] = [];
  for (const tiers of PACK_PLAN) {
    let candidates = cards.filter((card) => unused.has(card.id) && tiers.includes(card.tier));
    if (!candidates.length) candidates = cards.filter((card) => unused.has(card.id));
    if (!candidates.length) fail('Card catalog is too small for a Genesis Pack', 500);
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    const picked = candidates[bytes[0] % candidates.length];
    unused.delete(picked.id);
    selected.push(picked);
  }
  return selected;
}

async function roomForUser(roomID: string, authUserID: string) {
  const { data, error } = await admin.from('game_rooms').select('*').eq('id', roomID).maybeSingle();
  if (error) throw error;
  if (!data) fail('Room not found', 404);
  const playerID = data.player0_auth_user_id === authUserID ? '0'
    : data.player1_auth_user_id === authUserID ? '1' : null;
  if (!playerID) fail('You are not a participant in this room', 403);
  return { room: data, playerID };
}

async function initializeRoom(room: any) {
  if (!room.player1_wallet) fail('A second player is required', 409);
  const [cards0, cards1] = await Promise.all([
    inventoryFor(room.player0_wallet), inventoryFor(room.player1_wallet),
  ]);
  const state = createGameState({ cards0, cards1, name0: room.player0_name, name1: room.player1_name });
  await admin.from('game_room_states').upsert({ room_id: room.id, state, version: 1, updated_at: new Date().toISOString() });
  await admin.from('game_room_views').upsert([
    { room_id: room.id, player_id: '0', auth_user_id: room.player0_auth_user_id, state: publicGameView(state, '0'), version: 1 },
    { room_id: room.id, player_id: '1', auth_user_id: room.player1_auth_user_id, state: publicGameView(state, '1'), version: 1 },
  ]);
  const { data, error } = await admin.from('game_rooms').update({
    status: 'playing', current_player: '0', version: 1,
    started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', room.id).select('*').single();
  if (error) throw error;
  return data;
}

async function updateLeaderboard(wallet: string, name: string, own: any, rival: any, winner: string, playerID: string) {
  const { data: current } = await admin.from('leaderboard_entries').select('*').eq('wallet_address', wallet).maybeSingle();
  const draw = winner === 'draw';
  const won = winner === playerID;
  const next: any = {
    wallet_address: wallet, display_name: name,
    games: Number(current?.games || 0) + 1,
    wins: Number(current?.wins || 0) + (won ? 1 : 0),
    losses: Number(current?.losses || 0) + (!won && !draw ? 1 : 0),
    draws: Number(current?.draws || 0) + (draw ? 1 : 0),
    power_for: Number(current?.power_for || 0) + Number(own?.power || 0),
    power_against: Number(current?.power_against || 0) + Number(rival?.power || 0),
    updated_at: new Date().toISOString(),
  };
  next.points = next.wins * 3 + next.draws;
  await admin.from('leaderboard_entries').upsert(next, { onConflict: 'wallet_address' });
}

async function persistFinishedRoom(room: any, state: any) {
  const winnerWallet = state.winner === '0' ? room.player0_wallet : state.winner === '1' ? room.player1_wallet : null;
  const { data: inserted, error } = await admin.from('matches').upsert({
    match_id: room.id, player0_wallet: room.player0_wallet, player1_wallet: room.player1_wallet,
    player0_name: room.player0_name, player1_name: room.player1_name,
    winner_wallet: winnerWallet, winner_player_id: state.winner,
    score: { player0: state.score['0'], player1: state.score['1'] }, mode: room.mode,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'match_id', ignoreDuplicates: true }).select('match_id');
  if (error) throw error;
  if (room.mode !== 'matchmaking' || !inserted?.length) return;
  await Promise.all([
    updateLeaderboard(room.player0_wallet, room.player0_name, state.score['0'], state.score['1'], state.winner, '0'),
    updateLeaderboard(room.player1_wallet, room.player1_name, state.score['1'], state.score['0'], state.winner, '1'),
  ]);
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return response(request, { error: 'Method not allowed' }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'status') {
      const [{ count: catalogCount }, { count: totalMinted }, { count: totalOpened }] = await Promise.all([
        admin.from('cards').select('*', { count: 'exact', head: true }),
        admin.from('player_packs').select('*', { count: 'exact', head: true }),
        admin.from('player_packs').select('*', { count: 'exact', head: true }).eq('status', 'opened'),
      ]);
      return response(request, { cardsPerPack: 20, catalog: { total: catalogCount || 0 }, drop: { totalMinted: totalMinted || 0, totalOpened: totalOpened || 0, maxSupply: 5000 } });
    }
    if (action === 'leaderboard') return response(request, { leaderboard: await getLeaderboard() });

    const { user, wallet } = await authenticatedUser(request);
    const requestedWallet = body.walletAddress ? normalizeWallet(body.walletAddress) : wallet;
    if (requestedWallet !== wallet) fail('Wallet does not match authenticated identity', 403);
    const profile = await ensurePlayer(user, wallet, action === 'profile.update' ? body.displayName : '');

    if (action === 'session' || action === 'dashboard') {
      return response(request, await dashboardFor(wallet));
    }
    if (action === 'profile.update') {
      return response(request, { ...(await dashboardFor(wallet)), profile });
    }
    if (action === 'inventory') {
      return response(request, { walletAddress: wallet, inventory: await inventoryFor(wallet) });
    }
    if (action === 'pack.mint') {
      const tokenId = BigInt(body.tokenId);
      const txHash = String(body.txHash || '');
      const verification = await verifyPackEvent(txHash, 'PackMinted', wallet, tokenId);
      const { data: existing } = await admin.from('player_packs').select('*').eq('wallet_address', wallet).maybeSingle();
      if (existing && BigInt(existing.token_id) !== tokenId) fail('This wallet already has a Genesis Pack', 409);
      const { data: pack, error } = await admin.from('player_packs').upsert({
        token_id: tokenId.toString(), wallet_address: wallet, status: 'minted', minted_tx_hash: txHash, updated_at: new Date().toISOString(),
      }, { onConflict: 'token_id' }).select('*').single();
      if (error) throw error;
      return response(request, { pack, verification, ...(await dashboardFor(wallet)) });
    }
    if (action === 'pack.open') {
      const tokenId = BigInt(body.tokenId);
      const txHash = String(body.txHash || '');
      const verification = await verifyPackEvent(txHash, 'PackOpened', wallet, tokenId);
      const { data: cards, error: cardsError } = await admin.from('cards').select('*');
      if (cardsError) throw cardsError;
      const selected = choosePackCards(cards || []);
      const seed = `${wallet}:${tokenId}:${txHash}`;
      const { error } = await admin.rpc('nexus_register_pack_open', {
        p_wallet: wallet, p_token_id: tokenId.toString(), p_tx_hash: txHash, p_seed: seed,
        p_card_ids: selected.map((card) => card.id),
      });
      if (error) fail(error.message, 409);
      return response(request, { cards: selected, verification, ...(await dashboardFor(wallet)) });
    }
    if (action === 'matchmaking.join') {
      const { data: room, error } = await admin.rpc('nexus_claim_matchmaking', {
        p_room_id: randomID('R'), p_auth_user_id: user.id, p_wallet: wallet, p_name: profile.display_name,
      });
      if (error) throw error;
      const activeRoom = room.status === 'starting' ? await initializeRoom(room) : room;
      const playerID = activeRoom.player0_auth_user_id === user.id ? '0' : '1';
      return response(request, { session: { matchID: activeRoom.id, playerID, mode: 'matchmaking' }, room: activeRoom });
    }
    if (action === 'room.create') {
      const roomID = randomID('P');
      const { data: room, error } = await admin.from('game_rooms').insert({
        id: roomID, mode: 'private', status: 'waiting', player0_auth_user_id: user.id,
        player0_wallet: wallet, player0_name: profile.display_name,
      }).select('*').single();
      if (error) throw error;
      return response(request, { session: { matchID: roomID, playerID: '0', mode: 'private' }, room });
    }
    if (action === 'room.join') {
      const roomID = String(body.matchID || '').trim();
      const { data: room, error } = await admin.rpc('nexus_join_private_room', {
        p_room_id: roomID, p_auth_user_id: user.id, p_wallet: wallet, p_name: profile.display_name,
      });
      if (error) fail(error.message, 409);
      const activeRoom = await initializeRoom(room);
      return response(request, { session: { matchID: roomID, playerID: '1', mode: 'private' }, room: activeRoom });
    }
    if (action === 'room.get') {
      const { room, playerID } = await roomForUser(String(body.matchID || ''), user.id);
      return response(request, { room, session: { matchID: room.id, playerID, mode: room.mode } });
    }
    if (action === 'room.cancel') {
      const { room } = await roomForUser(String(body.matchID || ''), user.id);
      if (room.status === 'waiting') {
        await admin.from('game_rooms').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', room.id);
      }
      return response(request, { canceled: true });
    }
    if (action === 'game.move') {
      const { room, playerID } = await roomForUser(String(body.matchID || ''), user.id);
      if (room.status !== 'playing') fail('Match is not active', 409);
      const { data: stateRow, error: stateError } = await admin.from('game_room_states').select('*').eq('room_id', room.id).single();
      if (stateError) throw stateError;
      const state = applyGameMove(stateRow.state, playerID, String(body.move || ''), body.args || {});
      const nextVersion = Number(stateRow.version) + 1;
      const { data: updated, error: updateError } = await admin.from('game_room_states')
        .update({ state, version: nextVersion, updated_at: new Date().toISOString() })
        .eq('room_id', room.id).eq('version', stateRow.version).select('room_id');
      if (updateError) throw updateError;
      if (!updated?.length) fail('The match changed before this move was accepted. Retry.', 409);
      await admin.from('game_room_views').upsert([
        { room_id: room.id, player_id: '0', auth_user_id: room.player0_auth_user_id, state: publicGameView(state, '0'), version: nextVersion, updated_at: new Date().toISOString() },
        { room_id: room.id, player_id: '1', auth_user_id: room.player1_auth_user_id, state: publicGameView(state, '1'), version: nextVersion, updated_at: new Date().toISOString() },
      ]);
      await admin.from('game_rooms').update({
        current_player: state.currentPlayer, winner_player_id: state.winner || null,
        status: state.winner ? 'finished' : 'playing', version: nextVersion,
        completed_at: state.winner ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }).eq('id', room.id);
      if (state.winner) await persistFinishedRoom(room, state);
      return response(request, { accepted: true, version: nextVersion, state: publicGameView(state, playerID) });
    }

    fail('Unknown action', 404);
  } catch (error) {
    console.error(error);
    return response(request, { error: error?.message || 'Nexus service error' }, Number(error?.status || 500));
  }
});
