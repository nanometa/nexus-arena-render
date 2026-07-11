import { create } from 'zustand';

export const PLAYER_ACCOUNT_STORAGE_KEY = 'nexus-arena-player-account-v1';

export function normalizePlayerAccount(data) {
  if (!data) return null;
  return {
    walletAddress: data.walletAddress || '',
    profile: data.profile || null,
    stats: data.stats || {},
    packs: Array.isArray(data.packs) ? data.packs : [],
    inventory: Array.isArray(data.inventory) ? data.inventory : [],
    matches: Array.isArray(data.matches) ? data.matches : [],
    authenticated: Boolean(data.authenticated),
  };
}

function readStoredAccount() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(PLAYER_ACCOUNT_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed ? normalizePlayerAccount({ ...parsed, authenticated: false }) : null;
  } catch (error) {
    return null;
  }
}

function writeStoredAccount(account) {
  if (typeof window === 'undefined') return;
  try {
    if (!account) {
      window.localStorage.removeItem(PLAYER_ACCOUNT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      PLAYER_ACCOUNT_STORAGE_KEY,
      JSON.stringify({
        walletAddress: account.walletAddress,
        profile: account.profile,
        stats: account.stats,
        packs: account.packs,
        inventory: account.inventory,
        matches: account.matches,
        authenticated: false,
      })
    );
  } catch (error) {
    // Local storage is optional; the in-memory state remains usable.
  }
}

export const useNexusStore = create((set, get) => ({
  playerAccount: readStoredAccount(),
  roomID: '',
  setRoomID: (roomID) => set({ roomID }),
  setPlayerAccount: (nextAccount) => {
    const account = normalizePlayerAccount(nextAccount);
    writeStoredAccount(account);
    set({ playerAccount: account });
  },
  setInventory: (inventory) => {
    const current = get().playerAccount || {};
    const account = normalizePlayerAccount({ ...current, inventory });
    writeStoredAccount(account);
    set({ playerAccount: account });
  },
  clearPlayerAccount: () => {
    writeStoredAccount(null);
    set({ playerAccount: null, roomID: '' });
  },
}));
