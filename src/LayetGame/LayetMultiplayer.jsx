import React, { useEffect, useMemo, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { LobbyClient } from 'boardgame.io/client';
import { Local, SocketIO } from 'boardgame.io/multiplayer';
import { LayetBoard } from './LayetGame';
import { LayetDuelMultiplayer } from './game.multiplayer';
import { BOT_ID, PLAYER_ID } from './game';
import {
  GENESIS_PACK_ADDRESS,
  connectWallet,
  hasWalletProvider,
  mintGenesisPack,
  openGenesisPack,
  readDropState,
  signWalletLogin,
  shortAddress,
  walletErrorMessage,
} from './genesisPackClient';
import {
  createPlayerSession,
  fetchPlayerDashboard,
  fetchPackStatus,
  registerPackMint,
  registerPackOpen,
} from './packApi';
import genesisPackArt from './assets/packs/nexus-genesis-pack.png';

const GAME_NAME = LayetDuelMultiplayer.name;
const GAME_TITLE = 'NEXUS ARENA';
const GAME_SERVER_URL = process.env.REACT_APP_GAME_SERVER_URL || 'http://localhost:8000';
const MATCHMAKING_SETUP = { mode: 'matchmaking' };
const LEADERBOARD_STORAGE_KEY = 'nexus-arena-matchmaking-leaderboard-v1';
const RECORDED_MATCHES_STORAGE_KEY = 'nexus-arena-recorded-match-results-v1';
const PLAYER_ACCOUNT_STORAGE_KEY = 'nexus-arena-player-account-v1';
const localMultiplayer = Local();
const socketMultiplayer = SocketIO({ server: GAME_SERVER_URL });

const LocalPreviewClient = Client({
  game: LayetDuelMultiplayer,
  board: LayetBoard,
  numPlayers: 2,
  multiplayer: localMultiplayer,
  debug: false,
});

const OnlineClient = Client({
  game: LayetDuelMultiplayer,
  board: LayetBoard,
  numPlayers: 2,
  multiplayer: socketMultiplayer,
  debug: false,
});

function normalizeRoomCode(value) {
  return value.trim();
}

function multiplayerErrorMessage(error) {
  if (error?.details?.error) return error.details.error;
  if (typeof error?.details === 'string') return error.details;
  if (error?.message) return error.message;
  return 'Multiplayer server unavailable';
}

function isMatchmakingRoom(match) {
  return match?.setupData?.mode === MATCHMAKING_SETUP.mode;
}

function hasFreeSeat(match) {
  return Boolean(match?.players?.some((player) => !player.name));
}

function isJoinConflict(error) {
  return error?.message?.includes('409') || String(error?.details || '').includes('not available');
}

async function findOpenMatchmakingRoom(lobbyClient) {
  const { matches } = await lobbyClient.listMatches(GAME_NAME, { isGameover: false });
  return matches
    .filter((match) => isMatchmakingRoom(match) && hasFreeSeat(match))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
}

function createSession(matchID, joinResult, playerName, mode, walletAddress) {
  return {
    matchID,
    playerID: joinResult.playerID,
    credentials: joinResult.playerCredentials,
    playerName,
    mode,
    walletAddress,
  };
}

function readStorageArray(key) {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeStorageArray(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // A locked-down browser can block localStorage; the match should still finish.
  }
}

function readLocalLeaderboard() {
  return readStorageArray(LEADERBOARD_STORAGE_KEY)
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.wins || 0) - (a.wins || 0))
    .slice(0, 8);
}

function writeLocalLeaderboard(entries) {
  writeStorageArray(LEADERBOARD_STORAGE_KEY, entries || []);
}

function readStoredPlayerAccount() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(PLAYER_ACCOUNT_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed ? { ...parsed, authenticated: false } : null;
  } catch (error) {
    return null;
  }
}

function writeStoredPlayerAccount(account) {
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
    // A locked-down browser can block localStorage; the wallet session remains live in memory.
  }
}

function normalizeDashboard(data) {
  if (!data) return null;
  return {
    walletAddress: data.walletAddress,
    profile: data.profile || null,
    stats: data.stats || {},
    packs: Array.isArray(data.packs) ? data.packs : [],
    inventory: Array.isArray(data.inventory) ? data.inventory : [],
    matches: Array.isArray(data.matches) ? data.matches : [],
    authenticated: Boolean(data.authenticated),
  };
}

function packCountLabel(packs) {
  const minted = packs.filter((pack) => pack.status === 'minted').length;
  const opened = packs.filter((pack) => pack.status === 'opened').length;
  return `${minted} ready / ${opened} opened`;
}

function GenesisPackPanel({ playerName, playerAccount, onInventoryReady, onPlayerAccountChange }) {
  const [walletAddress, setWalletAddress] = useState(playerAccount?.walletAddress || '');
  const [packStatus, setPackStatus] = useState(null);
  const [chainDrop, setChainDrop] = useState(null);
  const [packs, setPacks] = useState(playerAccount?.packs || []);
  const [inventory, setInventory] = useState(playerAccount?.inventory || []);
  const [openedCards, setOpenedCards] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const activePack = packs.find((pack) => pack.status === 'minted');
  const openedPack = packs.find((pack) => pack.status === 'opened');
  const hasInventory = inventory.length > 0;
  const authenticated = Boolean(playerAccount?.authenticated);
  const drop = chainDrop || packStatus?.drop;
  const contractReady = Boolean(GENESIS_PACK_ADDRESS);

  useEffect(() => {
    onInventoryReady?.(hasInventory && authenticated);
  }, [authenticated, hasInventory, onInventoryReady]);

  useEffect(() => {
    if (!playerAccount?.walletAddress) return;
    setWalletAddress(playerAccount.walletAddress);
    setPacks(Array.isArray(playerAccount.packs) ? playerAccount.packs : []);
    setInventory(Array.isArray(playerAccount.inventory) ? playerAccount.inventory : []);
  }, [playerAccount]);

  const applyDashboard = (data) => {
    const dashboard = normalizeDashboard({
      ...data,
      authenticated: Boolean(data?.authenticated || playerAccount?.authenticated),
    });
    if (!dashboard) return null;
    setWalletAddress(dashboard.walletAddress || '');
    setPacks(dashboard.packs);
    setInventory(dashboard.inventory);
    onPlayerAccountChange?.(dashboard);
    writeStoredPlayerAccount(dashboard);
    return dashboard;
  };

  const loadDrop = async (wallet = walletAddress) => {
    try {
      const [serverStatus, onchainDrop] = await Promise.all([
        fetchPackStatus(),
        wallet && contractReady ? readDropState(wallet).catch(() => null) : Promise.resolve(null),
      ]);
      setPackStatus(serverStatus);
      if (onchainDrop) setChainDrop(onchainDrop);
    } catch (error) {
      setMessage(error.message || 'Pack status unavailable');
    }
  };

  const loadDashboard = async (wallet) => {
    if (!wallet) return;
    const data = await fetchPlayerDashboard(wallet);
    applyDashboard(data);
  };

  useEffect(() => {
    loadDrop();
    if (walletAddress) {
      loadDashboard(walletAddress).catch((error) => {
        setMessage(error.message || 'Dashboard unavailable');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setMessage('Connecting wallet...');
    try {
      const address = await connectWallet();
      setMessage('Sign wallet login to load your Nexus profile...');
      const signedLogin = await signWalletLogin({ walletAddress: address, displayName: playerName });
      const dashboard = await createPlayerSession({
        walletAddress: address,
        displayName: playerName,
        message: signedLogin.message,
        signature: signedLogin.signature,
      });
      applyDashboard(dashboard);
      await loadDrop(address);
      setMessage(`Profile loaded: ${shortAddress(address)}`);
    } catch (error) {
      setMessage(walletErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleMint = async () => {
    if (!walletAddress) {
      await handleConnect();
      return;
    }
    if (!contractReady) {
      setMessage('Genesis Pack contract is not deployed/configured yet.');
      return;
    }

    setBusy(true);
    setOpenedCards([]);
    setMessage('Minting Genesis Pack...');
    try {
      const minted = await mintGenesisPack();
      const data = await registerPackMint({
        walletAddress,
        tokenId: minted.tokenId,
        txHash: minted.txHash,
        displayName: playerName,
      });
      setPacks(Array.isArray(data.packs) ? data.packs : []);
      setInventory(Array.isArray(data.inventory) ? data.inventory : []);
      await loadDashboard(walletAddress);
      await loadDrop(walletAddress);
      setMessage(`Genesis Pack #${minted.tokenId} minted.`);
    } catch (error) {
      setMessage(walletErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async () => {
    if (!activePack) {
      setMessage('No unopened pack found for this wallet.');
      return;
    }
    if (!contractReady) {
      setMessage('Genesis Pack contract is not deployed/configured yet.');
      return;
    }

    setBusy(true);
    setOpenedCards([]);
    setMessage(`Opening Pack #${activePack.token_id}...`);
    try {
      const opened = await openGenesisPack(activePack.token_id);
      const data = await registerPackOpen({
        walletAddress,
        tokenId: opened.tokenId,
        txHash: opened.txHash,
        displayName: playerName,
      });
      setPacks(Array.isArray(data.packs) ? data.packs : []);
      setInventory(Array.isArray(data.inventory) ? data.inventory : []);
      setOpenedCards(Array.isArray(data.cards) ? data.cards : []);
      await loadDashboard(walletAddress);
      await loadDrop(walletAddress);
      setMessage(`Pack opened: ${data.cards?.length || 20} cards added.`);
    } catch (error) {
      setMessage(walletErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="genesis-pack">
      <div className="genesis-pack__stage">
        <div className="genesis-pack__art-wrap" data-ready={hasInventory ? 'true' : 'false'}>
          <img className="genesis-pack__art" src={genesisPackArt} alt="Nexus Arena Genesis Pack" />
          <span className="genesis-pack__shine" />
        </div>

        <div className="genesis-pack__copy">
          <p className="layet-multiplayer-lobby__eyebrow">Genesis Drop</p>
          <h2>Claim your first deck</h2>
          <p>
            Mint 1 free testnet booster, open it, then play with the 20 cards added to your inventory.
          </p>
        </div>
      </div>

      <div className="genesis-pack__stats">
        <span>
          <strong>{drop?.totalMinted ?? 0}</strong>
          <small>/ {drop?.maxSupply ?? 5000} minted</small>
        </span>
        <span>
          <strong>{packStatus?.cardsPerPack || drop?.cardsPerPack || 20}</strong>
          <small>cards / pack</small>
        </span>
        <span>
          <strong>{inventory.length}</strong>
          <small>cards owned</small>
        </span>
      </div>

      <div className="genesis-pack__progress" aria-label="Pack onboarding progress">
        <span className={walletAddress ? 'is-done' : ''}>1 Wallet</span>
        <span className={activePack || openedPack ? 'is-done' : ''}>2 Mint</span>
        <span className={hasInventory ? 'is-done' : ''}>3 Open</span>
        <span className={hasInventory && authenticated ? 'is-done' : ''}>4 Play</span>
      </div>

      <div className="genesis-pack__actions">
        <button type="button" onClick={handleConnect} disabled={busy || !hasWalletProvider()}>
          {walletAddress ? (authenticated ? shortAddress(walletAddress) : `Sign ${shortAddress(walletAddress)}`) : 'Connect Wallet'}
        </button>
        <button type="button" onClick={handleMint} disabled={busy || !walletAddress || !contractReady}>
          Mint Pack
        </button>
        <button type="button" onClick={handleOpen} disabled={busy || !activePack || !contractReady}>
          Open Pack
        </button>
      </div>

      <div className="genesis-pack__meta">
        <span>{walletAddress ? packCountLabel(packs) : 'Wallet not connected'}</span>
        {!contractReady && <span>Contract address missing</span>}
        {!hasWalletProvider() && <span>Wallet extension missing</span>}
      </div>

      {message && <p className="genesis-pack__message">{message}</p>}

      <div className="genesis-pack__inventory">
        <div className="genesis-pack__inventory-head">
          <strong>Inventory</strong>
          <span>{inventory.length || 0} / 20 cards</span>
        </div>

        {inventory.length > 0 ? (
          <div className="genesis-pack__cards" aria-label="Owned inventory cards">
            {inventory.map((card) => (
              <article key={`${card.id}-${card.copyNumber || card.copy_number || card.name}`}>
                <img src={card.image} alt={card.name} />
                <div>
                  <strong>{card.score}</strong>
                  <span>{card.rarity}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="genesis-pack__empty-inventory">
            Open the Genesis Pack to reveal your first playable cards.
          </div>
        )}
      </div>

      {openedCards.length > 0 && (
        <div className="genesis-pack__reveal" aria-label="Latest opened pack cards">
          <span>Latest reveal</span>
          {openedCards.slice(0, 5).map((card) => (
            <article key={`reveal-${card.id}-${card.copyNumber}`}>
              <img src={card.image} alt={card.name} />
              <strong>{card.score}</strong>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function compactNumber(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );
}

function formatMatchDate(value) {
  if (!value) return 'Recent';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit' }).format(new Date(value));
  } catch (error) {
    return 'Recent';
  }
}

function PlayerProfilePanel({ account, canPlay }) {
  const stats = account?.stats || {};
  const walletAddress = account?.walletAddress || '';
  const displayName = account?.profile?.display_name || 'Unsigned pilot';
  const packs = Array.isArray(account?.packs) ? account.packs : [];
  const inventory = Array.isArray(account?.inventory) ? account.inventory : [];
  const openedPacks = packs.filter((pack) => pack.status === 'opened').length;
  const statusLabel = !walletAddress
    ? 'Connect wallet to save progress'
    : !account?.authenticated
      ? 'Sign wallet to unlock play'
      : canPlay
        ? 'Play unlocked'
        : 'Open Genesis Pack to unlock play';

  return (
    <section className="nexus-profile-card">
      <div className="nexus-profile-card__top">
        <div className="nexus-profile-card__avatar">{displayName.slice(0, 1).toUpperCase()}</div>
        <div>
          <p className="layet-multiplayer-lobby__eyebrow">Pilot Profile</p>
          <h2>{displayName}</h2>
          <small>{walletAddress ? shortAddress(walletAddress) : 'Connect wallet to save progress'}</small>
        </div>
      </div>

      <div className="nexus-profile-card__status" data-ready={canPlay ? 'true' : 'false'}>
        {statusLabel}
      </div>

      <div className="nexus-profile-card__stats">
        <span>
          <strong>{compactNumber(inventory.length)}</strong>
          <small>Cards</small>
        </span>
        <span>
          <strong>{compactNumber(openedPacks)}</strong>
          <small>Packs</small>
        </span>
        <span>
          <strong>{compactNumber(stats.points)}</strong>
          <small>Points</small>
        </span>
        <span>
          <strong>{stats.wins || 0}W</strong>
          <small>{stats.losses || 0}L / {stats.draws || 0}D</small>
        </span>
      </div>
    </section>
  );
}

function MatchHistoryPanel({ account }) {
  const walletAddress = account?.walletAddress;
  const matches = Array.isArray(account?.matches) ? account.matches : [];

  return (
    <section className="nexus-history-card">
      <div>
        <p className="layet-multiplayer-lobby__eyebrow">Wallet History</p>
        <h2>Recent Matches</h2>
      </div>

      {walletAddress && matches.length > 0 ? (
        <ol>
          {matches.slice(0, 6).map((match) => {
            const isP0 = match.player0_wallet === walletAddress;
            const opponent = isP0
              ? match.player1_name || shortAddress(match.player1_wallet || '')
              : match.player0_name || shortAddress(match.player0_wallet || '');
            const result =
              match.winner_wallet === walletAddress
                ? 'WIN'
                : match.winner_wallet
                  ? 'LOSS'
                  : 'DRAW';
            const score = match.score || {};
            const myScore = isP0 ? score.player0 : score.player1;
            const opponentScore = isP0 ? score.player1 : score.player0;

            return (
              <li key={match.match_id}>
                <span data-result={result.toLowerCase()}>{result}</span>
                <strong>{opponent || 'Opponent'}</strong>
                <em>
                  {myScore?.power ?? 0} / {opponentScore?.power ?? 0}
                </em>
                <small>{formatMatchDate(match.completed_at || match.created_at)}</small>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="layet-multiplayer-lobby__empty">
          {walletAddress ? 'No saved matches yet.' : 'Connect wallet to load match history.'}
        </p>
      )}
    </section>
  );
}

async function fetchServerLeaderboard() {
  const response = await fetch(`${GAME_SERVER_URL}/api/leaderboard`);
  if (!response.ok) throw new Error('Leaderboard unavailable');
  const data = await response.json();
  return Array.isArray(data.leaderboard) ? data.leaderboard : [];
}

async function submitRankedMatchResult(session) {
  const response = await fetch(`${GAME_SERVER_URL}/api/ranked-match-results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      matchID: session.matchID,
      playerID: session.playerID,
      credentials: session.credentials,
      walletAddress: session.walletAddress,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ranked result registration failed');
  if (Array.isArray(data.leaderboard)) writeLocalLeaderboard(data.leaderboard);
  return data;
}

function recordLocalMatchmakingFallback(session, summary) {
  if (session?.mode !== MATCHMAKING_SETUP.mode || !summary?.winner) return;

  const resultKey = `${session.matchID}:${session.playerID}:${summary.winner}`;
  const recordedMatches = readStorageArray(RECORDED_MATCHES_STORAGE_KEY);
  if (recordedMatches.includes(resultKey)) return;
  writeStorageArray(RECORDED_MATCHES_STORAGE_KEY, [...recordedMatches, resultKey].slice(-100));

  const playerName = session.playerName || `Player ${Number(session.playerID) + 1}`;
  const leaderboard = readStorageArray(LEADERBOARD_STORAGE_KEY);
  const existing = leaderboard.find(
    (entry) => entry.name.toLowerCase() === playerName.toLowerCase()
  );
  const entry =
    existing ||
    {
      name: playerName,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      powerFor: 0,
      powerAgainst: 0,
      lastPlayedAt: null,
    };

  const isDraw = summary.winner === 'draw';
  const won = summary.winner === session.playerID;
  entry.games = (entry.games || 0) + 1;
  entry.wins = (entry.wins || 0) + (won ? 1 : 0);
  entry.losses = (entry.losses || 0) + (!won && !isDraw ? 1 : 0);
  entry.draws = (entry.draws || 0) + (isDraw ? 1 : 0);
  entry.points = entry.wins * 3 + entry.draws;
  entry.powerFor = (entry.powerFor || 0) + (summary.viewerScore?.power || 0);
  entry.powerAgainst = (entry.powerAgainst || 0) + (summary.opponentScore?.power || 0);
  entry.lastPlayedAt = Date.now();

  const nextLeaderboard = existing
    ? leaderboard.map((candidate) => (candidate === existing ? entry : candidate))
    : [...leaderboard, entry];

  writeStorageArray(LEADERBOARD_STORAGE_KEY, nextLeaderboard);
}

function LayetMultiplayerLobby({
  onExit,
  onJoinOnline,
  onWaitForOpponent,
  playerAccount,
  onPlayerAccountChange,
  canPlay,
  onCanPlayChange,
}) {
  const lobbyClient = useMemo(() => new LobbyClient({ server: GAME_SERVER_URL }), []);
  const [playerName, setPlayerName] = useState('Player');
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaderboard, setLeaderboard] = useState(() => readLocalLeaderboard());

  const cleanPlayerName = playerName.trim() || 'Player';
  const walletAddress = playerAccount?.walletAddress || '';

  useEffect(() => {
    if (playerAccount?.profile?.display_name) {
      setPlayerName(playerAccount.profile.display_name);
    }
  }, [playerAccount?.profile?.display_name]);

  useEffect(() => {
    let active = true;
    fetchServerLeaderboard()
      .then((entries) => {
        if (!active) return;
        setLeaderboard(entries);
        writeLocalLeaderboard(entries);
      })
      .catch(() => {
        if (active) setLeaderboard(readLocalLeaderboard());
      });

    return () => {
      active = false;
    };
  }, []);

  const startMatchmaking = async () => {
    if (!playerAccount?.authenticated) {
      setStatus('Connect and sign your wallet first.');
      return;
    }
    if (!canPlay) {
      setStatus('Open your Genesis Pack first to unlock Multiplayer.');
      return;
    }

    setBusy(true);
    setStatus('Searching opponent...');
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const openMatch = await findOpenMatchmakingRoom(lobbyClient);
        if (!openMatch) break;

        try {
          const joinResult = await lobbyClient.joinMatch(GAME_NAME, openMatch.matchID, {
            playerName: cleanPlayerName,
            data: { mode: MATCHMAKING_SETUP.mode, walletAddress },
          });
          onJoinOnline(createSession(openMatch.matchID, joinResult, cleanPlayerName, 'matchmaking', walletAddress));
          return;
        } catch (error) {
          if (!isJoinConflict(error)) throw error;
        }
      }

      const { matchID } = await lobbyClient.createMatch(GAME_NAME, {
        numPlayers: 2,
        setupData: MATCHMAKING_SETUP,
      });
      const joinResult = await lobbyClient.joinMatch(GAME_NAME, matchID, {
        playerID: PLAYER_ID,
        playerName: cleanPlayerName,
        data: { mode: MATCHMAKING_SETUP.mode, walletAddress },
      });

      onWaitForOpponent(createSession(matchID, joinResult, cleanPlayerName, 'matchmaking', walletAddress));
    } catch (error) {
      setStatus(multiplayerErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async () => {
    if (!playerAccount?.authenticated) {
      setStatus('Connect and sign your wallet first.');
      return;
    }
    if (!canPlay) {
      setStatus('Open your Genesis Pack first to unlock Private Rooms.');
      return;
    }

    setBusy(true);
    setStatus('Creating private room...');
    try {
      const { matchID } = await lobbyClient.createMatch(GAME_NAME, {
        numPlayers: 2,
        setupData: { mode: 'private' },
        unlisted: true,
      });
      const joinResult = await lobbyClient.joinMatch(GAME_NAME, matchID, {
        playerID: PLAYER_ID,
        playerName: cleanPlayerName,
        data: { mode: 'private', walletAddress },
      });

      onJoinOnline(createSession(matchID, joinResult, cleanPlayerName, 'private', walletAddress));
    } catch (error) {
      setStatus(multiplayerErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (event) => {
    event.preventDefault();
    if (!playerAccount?.authenticated) {
      setStatus('Connect and sign your wallet first.');
      return;
    }
    if (!canPlay) {
      setStatus('Open your Genesis Pack first to join a room.');
      return;
    }

    const matchID = normalizeRoomCode(roomCode);
    if (!matchID) {
      setStatus('Room code required');
      return;
    }

    setBusy(true);
    setStatus('Joining room...');
    try {
      const joinResult = await lobbyClient.joinMatch(GAME_NAME, matchID, {
        playerName: cleanPlayerName,
        data: { mode: 'private', walletAddress },
      });

      onJoinOnline(createSession(matchID, joinResult, cleanPlayerName, 'private', walletAddress));
    } catch (error) {
      setStatus(multiplayerErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="layet-multiplayer-lobby">
      <section className="layet-multiplayer-lobby__shell">
        <div className="layet-multiplayer-lobby__hero">
          <p className="layet-multiplayer-lobby__eyebrow">Online card battle</p>
          <h1>{GAME_TITLE}</h1>
          <p className="layet-multiplayer-lobby__subtitle">
            Play ranked matchmaking, create a private room, or join a room code.
          </p>

          <label className="layet-multiplayer-lobby__field">
            <span>Name</span>
            <input
              value={playerName}
              maxLength={18}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </label>

          <GenesisPackPanel
            playerName={cleanPlayerName}
            playerAccount={playerAccount}
            onInventoryReady={onCanPlayChange}
            onPlayerAccountChange={onPlayerAccountChange}
          />

          <div className="layet-multiplayer-lobby__modes" aria-label="Play modes">
            <button
              type="button"
              className="layet-multiplayer-lobby__mode-card layet-multiplayer-lobby__mode-card--ranked"
              onClick={startMatchmaking}
              disabled={busy || !canPlay}
            >
              <span>Play Mode</span>
              <strong>Multiplayer</strong>
              <small>{canPlay ? 'Auto matchmaking. Counts for leaderboard.' : 'Open pack to unlock.'}</small>
            </button>

            <button
              type="button"
              className="layet-multiplayer-lobby__mode-card"
              onClick={createRoom}
              disabled={busy || !canPlay}
            >
              <span>Private</span>
              <strong>Create Room</strong>
              <small>{canPlay ? 'Room code match. No leaderboard points.' : 'Requires unlocked inventory.'}</small>
            </button>
          </div>

          <form className="layet-multiplayer-lobby__join" onSubmit={joinRoom}>
            <label className="layet-multiplayer-lobby__field">
              <span>Room Code</span>
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="matchID"
              />
            </label>
            <button type="submit" disabled={busy || !canPlay}>
              Join Room
            </button>
          </form>

          {status && <p className="layet-multiplayer-lobby__status">{status}</p>}

          {onExit && (
            <button type="button" className="layet-multiplayer-lobby__menu" onClick={onExit}>
              Menu
            </button>
          )}
        </div>

        <aside className="layet-multiplayer-lobby__side">
          <PlayerProfilePanel account={playerAccount} canPlay={canPlay} />

          <section className="layet-multiplayer-lobby__leaderboard">
            <div>
              <p className="layet-multiplayer-lobby__eyebrow">Ranked only</p>
              <h2>Leaderboard</h2>
              <small>Only automatic Multiplayer matches are counted.</small>
            </div>

            {leaderboard.length > 0 ? (
              <ol>
                {leaderboard.map((entry, index) => (
                  <li key={entry.walletAddress || entry.name}>
                    <span>{index + 1}</span>
                    <strong>{entry.name}</strong>
                    <em>{entry.points} pts</em>
                    <small>
                      {entry.wins}W / {entry.losses}L / {entry.draws}D
                      {entry.lastTxHash ? ' / ON-CHAIN' : ''}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="layet-multiplayer-lobby__empty">
                No ranked multiplayer results yet.
              </p>
            )}
          </section>

          <MatchHistoryPanel account={playerAccount} />
        </aside>
      </section>
    </main>
  );
}

function MatchmakingWaiting({ session, onMatched, onCancel }) {
  const lobbyClient = useMemo(() => new LobbyClient({ server: GAME_SERVER_URL }), []);
  const [status, setStatus] = useState('Waiting for opponent...');
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    let active = true;
    let intervalID;

    const checkMatch = async () => {
      try {
        const match = await lobbyClient.getMatch(GAME_NAME, session.matchID);
        if (!active) return;
        if (!hasFreeSeat(match)) {
          onMatched(session);
          return;
        }
        setStatus('Waiting for opponent...');
      } catch (error) {
        if (active) setStatus(multiplayerErrorMessage(error));
      }
    };

    checkMatch();
    intervalID = window.setInterval(checkMatch, 1400);
    return () => {
      active = false;
      window.clearInterval(intervalID);
    };
  }, [lobbyClient, onMatched, session]);

  const cancelMatchmaking = async () => {
    setCanceling(true);
    try {
      await lobbyClient.leaveMatch(GAME_NAME, session.matchID, {
        playerID: session.playerID,
        credentials: session.credentials,
      });
    } catch (error) {
      // Leaving is best-effort; returning to lobby matters more for this preview.
    } finally {
      onCancel();
    }
  };

  return (
    <main className="layet-multiplayer-lobby">
      <section className="layet-multiplayer-lobby__panel layet-multiplayer-lobby__panel--waiting">
        <p className="layet-multiplayer-lobby__eyebrow">{GAME_TITLE}</p>
        <h1>Searching</h1>
        <p className="layet-multiplayer-lobby__status">{status}</p>
        <small className="layet-multiplayer-lobby__server">Auto matchmaking</small>
        <button
          type="button"
          className="layet-multiplayer-lobby__secondary"
          onClick={cancelMatchmaking}
          disabled={canceling}
        >
          Cancel
        </button>
      </section>
    </main>
  );
}

function OnlineRoomBadge({ session, onBackToLobby }) {
  const copyRoomCode = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(session.matchID);
  };

  return (
    <div className="layet-multiplayer__room">
      <span>{session.mode === 'matchmaking' ? 'Match' : 'Room'}</span>
      <strong>{session.matchID}</strong>
      <small>P{Number(session.playerID) + 1}</small>
      <button type="button" onClick={copyRoomCode}>
        Copy
      </button>
      <button type="button" onClick={onBackToLobby}>
        Lobby
      </button>
    </div>
  );
}

function LocalPreviewMatch({ onBackToLobby }) {
  const [viewerID, setViewerID] = useState(PLAYER_ID);

  return (
    <div className="layet-multiplayer">
      <LocalPreviewClient
        matchID="layet-vm-local-preview"
        playerID={viewerID}
        sceneVariant="page2"
        onExit={onBackToLobby}
      />
      <div className="layet-multiplayer__switch" aria-label="Local multiplayer player switch">
        <button
          type="button"
          className={viewerID === PLAYER_ID ? 'is-active' : ''}
          onClick={() => setViewerID(PLAYER_ID)}
        >
          P1
        </button>
        <button
          type="button"
          className={viewerID === BOT_ID ? 'is-active' : ''}
          onClick={() => setViewerID(BOT_ID)}
        >
          P2
        </button>
      </div>
    </div>
  );
}

export default function LayetMultiplayer({ onExit }) {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState('lobby');
  const [playerAccount, setPlayerAccountState] = useState(() => readStoredPlayerAccount());
  const [canPlay, setCanPlay] = useState(() => {
    const storedAccount = readStoredPlayerAccount();
    return Boolean(storedAccount?.authenticated && storedAccount?.inventory?.length);
  });

  const updatePlayerAccount = (account) => {
    const dashboard = normalizeDashboard(account);
    setPlayerAccountState(dashboard);
    writeStoredPlayerAccount(dashboard);
    setCanPlay(Boolean(dashboard?.authenticated && dashboard?.inventory?.length));
  };

  if (mode === 'local') {
    return <LocalPreviewMatch onBackToLobby={() => setMode('lobby')} />;
  }

  if (mode === 'waiting' && session) {
    return (
      <MatchmakingWaiting
        session={session}
        onMatched={(matchedSession) => {
          setSession(matchedSession);
          setMode('online');
        }}
        onCancel={() => {
          setSession(null);
          setMode('lobby');
        }}
      />
    );
  }

  if (mode === 'online' && session) {
    const handleMatchEnd = (summary) => {
      if (session.mode !== MATCHMAKING_SETUP.mode) return;
      submitRankedMatchResult(session)
        .then((data) => {
          if (data.dashboard) updatePlayerAccount(data.dashboard);
        })
        .catch(() => {
          recordLocalMatchmakingFallback(session, summary);
        });
      window.setTimeout(() => {
        setSession(null);
        setMode('lobby');
      }, 1600);
    };

    return (
      <div className="layet-multiplayer">
        <OnlineClient
          matchID={session.matchID}
          playerID={session.playerID}
          credentials={session.credentials}
          sceneVariant="page2"
          onExit={() => {
            setSession(null);
            setMode('lobby');
          }}
          onMatchEnd={handleMatchEnd}
        />
        {session.mode !== MATCHMAKING_SETUP.mode && (
          <OnlineRoomBadge
            session={session}
            onBackToLobby={() => {
              setSession(null);
              setMode('lobby');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <LayetMultiplayerLobby
      onExit={onExit}
      playerAccount={playerAccount}
      canPlay={canPlay}
      onCanPlayChange={setCanPlay}
      onPlayerAccountChange={updatePlayerAccount}
      onJoinOnline={(nextSession) => {
        setSession(nextSession);
        setMode('online');
      }}
      onWaitForOpponent={(nextSession) => {
        setSession(nextSession);
        setMode('waiting');
      }}
    />
  );
}
