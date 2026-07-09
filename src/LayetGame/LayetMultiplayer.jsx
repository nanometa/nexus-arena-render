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
  shortAddress,
  walletErrorMessage,
} from './genesisPackClient';
import {
  fetchInventory,
  fetchPackStatus,
  registerPackMint,
  registerPackOpen,
} from './packApi';

const GAME_NAME = LayetDuelMultiplayer.name;
const GAME_TITLE = 'NEXUS ARENA';
const GAME_SERVER_URL = process.env.REACT_APP_GAME_SERVER_URL || 'http://localhost:8000';
const MATCHMAKING_SETUP = { mode: 'matchmaking' };
const LEADERBOARD_STORAGE_KEY = 'nexus-arena-matchmaking-leaderboard-v1';
const RECORDED_MATCHES_STORAGE_KEY = 'nexus-arena-recorded-match-results-v1';
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

function createSession(matchID, joinResult, playerName, mode) {
  return {
    matchID,
    playerID: joinResult.playerID,
    credentials: joinResult.playerCredentials,
    playerName,
    mode,
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

function packCountLabel(packs) {
  const minted = packs.filter((pack) => pack.status === 'minted').length;
  const opened = packs.filter((pack) => pack.status === 'opened').length;
  return `${minted} ready / ${opened} opened`;
}

function GenesisPackPanel({ playerName }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [packStatus, setPackStatus] = useState(null);
  const [chainDrop, setChainDrop] = useState(null);
  const [packs, setPacks] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [openedCards, setOpenedCards] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const activePack = packs.find((pack) => pack.status === 'minted');
  const drop = chainDrop || packStatus?.drop;
  const contractReady = Boolean(GENESIS_PACK_ADDRESS);

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

  const loadInventory = async (wallet) => {
    if (!wallet) return;
    const data = await fetchInventory(wallet);
    setPacks(Array.isArray(data.packs) ? data.packs : []);
    setInventory(Array.isArray(data.inventory) ? data.inventory : []);
  };

  useEffect(() => {
    loadDrop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setMessage('Connecting wallet...');
    try {
      const address = await connectWallet();
      setWalletAddress(address);
      await Promise.all([loadInventory(address), loadDrop(address)]);
      setMessage(`Wallet connected: ${shortAddress(address)}`);
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
      <div className="genesis-pack__copy">
        <p className="layet-multiplayer-lobby__eyebrow">Genesis Drop</p>
        <h2>Mint your play pack</h2>
        <p>
          Free testnet pack. 1 pack per wallet. 20 balanced cards for your inventory.
        </p>
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

      <div className="genesis-pack__actions">
        <button type="button" onClick={handleConnect} disabled={busy || !hasWalletProvider()}>
          {walletAddress ? shortAddress(walletAddress) : 'Connect Wallet'}
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

      {openedCards.length > 0 && (
        <div className="genesis-pack__cards" aria-label="Opened pack cards">
          {openedCards.slice(0, 8).map((card) => (
            <article key={`${card.id}-${card.copyNumber}`}>
              <img src={card.image} alt={card.name} />
              <strong>{card.score}</strong>
              <span>{card.rarity}</span>
            </article>
          ))}
        </div>
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

function LayetMultiplayerLobby({ onExit, onJoinOnline, onWaitForOpponent }) {
  const lobbyClient = useMemo(() => new LobbyClient({ server: GAME_SERVER_URL }), []);
  const [playerName, setPlayerName] = useState('Player');
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaderboard, setLeaderboard] = useState(() => readLocalLeaderboard());

  const cleanPlayerName = playerName.trim() || 'Player';

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
    setBusy(true);
    setStatus('Searching opponent...');
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const openMatch = await findOpenMatchmakingRoom(lobbyClient);
        if (!openMatch) break;

        try {
          const joinResult = await lobbyClient.joinMatch(GAME_NAME, openMatch.matchID, {
            playerName: cleanPlayerName,
            data: { mode: MATCHMAKING_SETUP.mode },
          });
          onJoinOnline(createSession(openMatch.matchID, joinResult, cleanPlayerName, 'matchmaking'));
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
        data: { mode: MATCHMAKING_SETUP.mode },
      });

      onWaitForOpponent(createSession(matchID, joinResult, cleanPlayerName, 'matchmaking'));
    } catch (error) {
      setStatus(multiplayerErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async () => {
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
        data: { mode: 'private' },
      });

      onJoinOnline(createSession(matchID, joinResult, cleanPlayerName, 'private'));
    } catch (error) {
      setStatus(multiplayerErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (event) => {
    event.preventDefault();
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
        data: { mode: 'private' },
      });

      onJoinOnline(createSession(matchID, joinResult, cleanPlayerName, 'private'));
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

          <GenesisPackPanel playerName={cleanPlayerName} />

          <div className="layet-multiplayer-lobby__modes" aria-label="Play modes">
            <button
              type="button"
              className="layet-multiplayer-lobby__mode-card layet-multiplayer-lobby__mode-card--ranked"
              onClick={startMatchmaking}
              disabled={busy}
            >
              <span>Play Mode</span>
              <strong>Multiplayer</strong>
              <small>Auto matchmaking. Counts for leaderboard.</small>
            </button>

            <button
              type="button"
              className="layet-multiplayer-lobby__mode-card"
              onClick={createRoom}
              disabled={busy}
            >
              <span>Private</span>
              <strong>Create Room</strong>
              <small>Room code match. No leaderboard points.</small>
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
            <button type="submit" disabled={busy}>
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

        <aside className="layet-multiplayer-lobby__leaderboard">
          <div>
            <p className="layet-multiplayer-lobby__eyebrow">Ranked only</p>
            <h2>Leaderboard</h2>
            <small>Only automatic Multiplayer matches are counted.</small>
          </div>

          {leaderboard.length > 0 ? (
            <ol>
              {leaderboard.map((entry, index) => (
                <li key={entry.name}>
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
      submitRankedMatchResult(session).catch(() => {
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
