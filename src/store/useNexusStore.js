import { create } from 'zustand';

export const PLAYER_ACCOUNT_STORAGE_KEY = 'nexus-arena-player-account-v1';
export const PLAYER_SESSION_STORAGE_KEY = 'nexus-arena-wallet-session-v1';

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
    sessionToken: data.sessionToken || '',
    sessionExpiresAt: Number(data.sessionExpiresAt || 0),
  };
}

function readSession() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PLAYER_SESSION_STORAGE_KEY) || 'null');
    if (!parsed?.sessionToken || Number(parsed.sessionExpiresAt || 0) <= Date.now() / 1000) {
      window.sessionStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function readStoredAccount() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(PLAYER_ACCOUNT_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed) return null;
    const session = readSession();
    const sessionMatches =
      session && String(session.walletAddress).toLowerCase() === String(parsed.walletAddress).toLowerCase();
    return normalizePlayerAccount({
      ...parsed,
      ...(sessionMatches ? session : {}),
      authenticated: Boolean(sessionMatches),
    });
  } catch (error) {
    return null;
  }
}

function writeStoredAccount(account) {
  if (typeof window === 'undefined') return;
  try {
    if (!account) {
      window.localStorage.removeItem(PLAYER_ACCOUNT_STORAGE_KEY);
      window.sessionStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
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
    if (account.sessionToken && account.sessionExpiresAt > Date.now() / 1000) {
      window.sessionStorage.setItem(
        PLAYER_SESSION_STORAGE_KEY,
        JSON.stringify({
          walletAddress: account.walletAddress,
          sessionToken: account.sessionToken,
          sessionExpiresAt: account.sessionExpiresAt,
        })
      );
    }
  } catch (error) {
    // Local storage is optional; the in-memory state remains usable.
  }
}

export const useNexusStore = create((set, get) => ({
  playerAccount: readStoredAccount(),
  roomID: '',
  setRoomID: (roomID) => set({ roomID }),
  setPlayerAccount: (nextAccount) => {
    const current = get().playerAccount;
    const sameWallet =
      current?.walletAddress &&
      String(current.walletAddress).toLowerCase() === String(nextAccount?.walletAddress || '').toLowerCase();
    const account = normalizePlayerAccount({
      ...(sameWallet ? current : {}),
      ...nextAccount,
      sessionToken: nextAccount?.sessionToken || (sameWallet ? current.sessionToken : ''),
      sessionExpiresAt:
        nextAccount?.sessionExpiresAt || (sameWallet ? current.sessionExpiresAt : 0),
      authenticated:
        nextAccount?.authenticated === undefined
          ? Boolean(sameWallet && current.authenticated)
          : nextAccount.authenticated,
    });
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
