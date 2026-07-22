import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import profileFrame from '../assets/branding/nexus-profile-frame.png';
import gameEmblem from '../assets/branding/game-emblem.png';
import { fetchPlayerDashboard } from '../LayetGame/packApi';
import { defaultPilotName, shortAddress } from '../LayetGame/genesisPackClient';
import { useWalletLogin } from '../components/web3/useWalletLogin';
import { useNexusStore } from '../store/useNexusStore';
import { useToastStore } from '../store/useToastStore';

const GAME_SERVER_URL = process.env.REACT_APP_GAME_SERVER_URL || 'http://localhost:8000';

async function fetchLeaderboardEntries() {
  const response = await fetch(`${GAME_SERVER_URL}/api/leaderboard`);
  if (!response.ok) throw new Error('Leaderboard offline');
  const data = await response.json();
  return Array.isArray(data.leaderboard) ? data.leaderboard : [];
}

export default function ProfilePage() {
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);
  const pushToast = useToastStore((state) => state.pushToast);
  const { connectAndSign, isPending } = useWalletLogin();
  const [leaderboard, setLeaderboard] = useState([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(
    playerAccount?.profile?.display_name || defaultPilotName(playerAccount?.walletAddress)
  );
  const walletAddress = playerAccount?.walletAddress;
  const authenticated = playerAccount?.authenticated;

  useEffect(() => {
    setName(playerAccount?.profile?.display_name || defaultPilotName(walletAddress));
  }, [playerAccount?.profile?.display_name, walletAddress]);

  useEffect(() => {
    fetchLeaderboardEntries()
      .then(setLeaderboard)
      .catch((error) => pushToast({ message: error.message || 'Leaderboard offline.' }));
  }, [pushToast]);

  useEffect(() => {
    if (!walletAddress) return;
    fetchPlayerDashboard(walletAddress)
      .then((data) => setPlayerAccount({ ...data, authenticated }))
      .catch((error) => pushToast({ message: error.message || 'Profile sync failed.' }));
  }, [authenticated, pushToast, setPlayerAccount, walletAddress]);

  const saveName = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      pushToast({ title: 'Pilot name', message: 'Use at least 3 characters.' });
      return;
    }
    try {
      await connectAndSign(cleanName.slice(0, 18));
      await fetchLeaderboardEntries()
        .then(setLeaderboard)
        .catch(() => null);
      setEditing(false);
      pushToast({ title: 'Pilot profile', message: 'Pilot name saved to this wallet.' });
    } catch (error) {
      // The wallet hook already reports signature errors.
    }
  };

  return (
    <section className="nexus-profile-page">
      <ProfileHero
        account={playerAccount}
        editing={editing}
        name={name}
        setName={setName}
        setEditing={setEditing}
        saveName={saveName}
        busy={isPending}
      />

      <div className="nexus-profile-layout">
        <InventorySummary inventory={playerAccount?.inventory || []} />
        <div className="nexus-profile-records">
          <Leaderboard entries={leaderboard} />
          <WalletHistory account={playerAccount} />
        </div>
      </div>
    </section>
  );
}

function ProfileHero({ account, editing, name, setName, setEditing, saveName, busy }) {
  const stats = account?.stats || {};
  const inventory = account?.inventory || [];

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="nexus-profile-command"
    >
      <img src={profileFrame} alt="" className="nexus-profile-command__frame" draggable="false" />
      <div className="nexus-profile-command__identity">
        <img src={gameEmblem} alt="" draggable="false" />
        <div>
          <p className="nexus-kicker">Pilot dossier</p>
          {editing ? (
            <form onSubmit={saveName} className="nexus-profile-name-form">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={18}
                autoFocus
              />
              <button type="submit" disabled={busy}>Save</button>
              <button type="button" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <div className="nexus-profile-command__name">
              <h1>{account?.profile?.display_name || defaultPilotName(account?.walletAddress)}</h1>
              <button type="button" onClick={() => setEditing(true)}>Edit name</button>
            </div>
          )}
          <span>{shortAddress(account?.walletAddress)}</span>
        </div>
      </div>

      <div className="nexus-profile-command__stats">
        <HeroStat label="Games" value={stats.games || 0} />
        <HeroStat label="Victories" value={stats.wins || 0} />
        <HeroStat label="Rank points" value={stats.points || 0} />
        <HeroStat label="Collection" value={`${inventory.length}/20`} />
      </div>
    </motion.header>
  );
}

function InventorySummary({ inventory }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="nexus-profile-deck">
      <SectionHeading eyebrow="Command deck" title="Collection" meta={`${inventory.length}/20`} />
      {inventory.length ? (
        <div>
          {inventory.slice(0, 20).map((card, index) => (
            <motion.img
              whileHover={{ y: -6, scale: 1.04 }}
              key={`${card.id}-${card.copyNumber || card.copy_number || index}`}
              src={card.image}
              alt={card.name}
              draggable="false"
            />
          ))}
        </div>
      ) : (
        <CompactEmpty title="No cards revealed" copy="Open the Genesis Pack to build your command deck." />
      )}
    </motion.section>
  );
}

function Leaderboard({ entries }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="nexus-record-section">
      <SectionHeading eyebrow="Ranked multiplayer" title="Leaderboard" meta="Season 01" />
      {entries.length ? (
        <ol>
          {entries.slice(0, 10).map((entry, index) => (
            <li key={entry.walletAddress || entry.name || index}>
              <span>#{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{entry.name || entry.displayName || defaultPilotName(entry.walletAddress)}</strong>
                <small>{entry.wins || 0}W · {entry.losses || 0}L · {entry.draws || 0}D</small>
              </div>
              <b>{entry.points || 0} PTS</b>
            </li>
          ))}
        </ol>
      ) : (
        <CompactEmpty title="Season awaiting its first champion" copy="Complete a Ranked duel to enter the leaderboard." index="01" />
      )}
    </motion.section>
  );
}

function WalletHistory({ account }) {
  const matches = Array.isArray(account?.matches) ? account.matches : [];
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="nexus-record-section">
      <SectionHeading eyebrow="Wallet history" title="Battle Log" meta={`${matches.length} recorded`} />
      {matches.length ? (
        <div className="nexus-battle-log">
          {matches.slice(0, 12).map((match, index) => {
            const won = match.winner_wallet === account?.walletAddress;
            const draw = !match.winner_wallet;
            return (
              <article key={match.match_id || match.matchId || match.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{match.mode === 'matchmaking' ? 'Ranked Duel' : 'Private Duel'}</strong>
                  <small>{match.match_id || match.matchId}</small>
                </div>
                <b className={won ? 'is-win' : ''}>{draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}</b>
              </article>
            );
          })}
        </div>
      ) : (
        <CompactEmpty title="No battle record yet" copy="Verified Ranked results appear here after your first duel." />
      )}
    </motion.section>
  );
}

function SectionHeading({ eyebrow, title, meta }) {
  return (
    <header className="nexus-section-heading">
      <div><p className="nexus-kicker">{eyebrow}</p><h2>{title}</h2></div>
      <span>{meta}</span>
    </header>
  );
}

function CompactEmpty({ title, copy, index = '00' }) {
  return (
    <div className="nexus-empty-state">
      <span className="nexus-empty-state__index">{index}</span>
      <div><strong>{title}</strong><p>{copy}</p></div>
    </div>
  );
}

function HeroStat({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
