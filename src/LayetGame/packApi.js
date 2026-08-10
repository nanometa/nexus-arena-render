import { invokeNexus, requireSupabaseSession, supabase } from '../lib/supabaseClient';

let serviceWarmupPromise = null;

export function warmGameServer() {
  if (!serviceWarmupPromise) {
    serviceWarmupPromise = invokeNexus('status', {}, { authenticated: false }).catch(() => null);
  }
  return serviceWarmupPromise;
}

async function withSession(data) {
  const session = await requireSupabaseSession();
  return {
    ...data,
    sessionToken: session.access_token,
    sessionExpiresAt: session.expires_at || 0,
  };
}

export function fetchPackStatus() {
  return invokeNexus('status', {}, { authenticated: false });
}

export function fetchInventory(walletAddress) {
  return invokeNexus('inventory', { walletAddress });
}

export async function createPlayerSession({ walletAddress, displayName }) {
  const dashboard = await invokeNexus('session', { walletAddress, displayName });
  return withSession(dashboard);
}

// Kept for compatibility with older UI callers. Supabase Auth now owns seat identity.
export async function requestMatchTicket({ matchID, playerID, mode }) {
  const session = await requireSupabaseSession();
  return {
    matchID,
    playerID,
    mode,
    identityTicket: session.access_token,
  };
}

export function fetchPlayerDashboard(walletAddress) {
  return invokeNexus('dashboard', { walletAddress });
}

export function updatePlayerProfile({ walletAddress, displayName }) {
  return invokeNexus('profile.update', { walletAddress, displayName });
}

export function registerPackMint({ walletAddress, tokenId, txHash, displayName }) {
  return invokeNexus('pack.mint', { walletAddress, tokenId, txHash, displayName });
}

export function registerPackOpen({ walletAddress, tokenId, txHash, displayName }) {
  return invokeNexus('pack.open', { walletAddress, tokenId, txHash, displayName });
}

export function fetchLeaderboard() {
  return invokeNexus('leaderboard', {}, { authenticated: false }).then((data) => data.leaderboard || []);
}

export function joinMatchmaking() {
  return invokeNexus('matchmaking.join');
}

export function createPrivateRoom() {
  return invokeNexus('room.create');
}

export function joinPrivateRoom(matchID) {
  return invokeNexus('room.join', { matchID });
}

export function fetchRoom(matchID) {
  return invokeNexus('room.get', { matchID });
}

export function cancelRoom(matchID) {
  return invokeNexus('room.cancel', { matchID });
}

export function sendGameMove(matchID, move, args = {}) {
  return invokeNexus('game.move', { matchID, move, args });
}

export async function fetchGameView(matchID, playerID) {
  const { data, error } = await supabase
    .from('game_room_views')
    .select('state,version')
    .eq('room_id', matchID)
    .eq('player_id', String(playerID))
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToRoom(matchID, onRoom, onError = () => {}) {
  const channel = supabase
    .channel(`room:${matchID}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${matchID}` },
      (payload) => onRoom(payload.new)
    )
    .subscribe((status, error) => {
      if (error || status === 'CHANNEL_ERROR') onError(error || new Error('Room subscription failed'));
    });
  return () => supabase.removeChannel(channel);
}

export function subscribeToGameView(matchID, playerID, onView, onError = () => {}) {
  const channel = supabase
    .channel(`game:${matchID}:${playerID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_room_views',
        filter: `room_id=eq.${matchID}`,
      },
      (payload) => {
        const row = payload.new;
        if (String(row?.player_id) === String(playerID)) onView(row);
      }
    )
    .subscribe((status, error) => {
      if (error || status === 'CHANNEL_ERROR') onError(error || new Error('Game subscription failed'));
    });
  return () => supabase.removeChannel(channel);
}
