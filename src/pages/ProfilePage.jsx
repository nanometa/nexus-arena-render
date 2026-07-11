import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import profileFrame from '../assets/branding/nexus-profile-frame.png';
import { fetchPlayerDashboard } from '../LayetGame/packApi';
import { defaultPilotName } from '../LayetGame/genesisPackClient';
import { useNexusStore } from '../store/useNexusStore';
import { useToastStore } from '../store/useToastStore';

const GAME_SERVER_URL = process.env.REACT_APP_GAME_SERVER_URL || 'http://localhost:8000';

export default function ProfilePage() {
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);
  const pushToast = useToastStore((state) => state.pushToast);
  const [leaderboard, setLeaderboard] = useState([]);
  const walletAddress = playerAccount?.walletAddress;
  const authenticated = playerAccount?.authenticated;

  useEffect(() => {
    fetch(`${GAME_SERVER_URL}/api/leaderboard`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Leaderboard offline'))))
      .then((data) => setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []))
      .catch((error) => pushToast({ message: error.message || 'Leaderboard offline.' }));
  }, [pushToast]);

  useEffect(() => {
    if (!walletAddress) return;
    fetchPlayerDashboard(walletAddress)
      .then((data) => setPlayerAccount({ ...data, authenticated }))
      .catch((error) => pushToast({ message: error.message || 'Profile sync failed.' }));
  }, [authenticated, pushToast, setPlayerAccount, walletAddress]);

  return (
    <div className="min-h-screen bg-transparent px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[1500px]">
        <ProfileHero account={playerAccount} />

        <div className="mt-5 grid items-start gap-8 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.55fr)]">
          <InventoryCollection inventory={playerAccount?.inventory || []} />
          <div className="flex min-w-0 flex-col gap-8">
            <Leaderboard entries={leaderboard} />
            <WalletHistory account={playerAccount} />
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileHero({ account }) {
  const stats = account?.stats || {};
  const inventory = account?.inventory || [];
  const name = account?.profile?.display_name || defaultPilotName(account?.walletAddress);

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="nexus-profile-hero"
    >
      <div className="nexus-profile-identity">
        <img src={profileFrame} alt="" className="nexus-profile-identity__frame" draggable="false" />
        <div className="nexus-profile-identity__content relative z-10 min-w-0">
          <h1 className="nexus-profile-identity__name truncate text-3xl font-black uppercase text-white sm:text-4xl">
            {name}
          </h1>
        </div>
      </div>

      <div className="nexus-profile-hero__stats relative z-10 grid grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-4">
        <HeroStat label="Games" value={stats.games || 0} />
        <HeroStat label="Victories" value={stats.wins || 0} />
        <HeroStat label="Rank Points" value={stats.points || 0} />
        <HeroStat label="Collection" value={`${inventory.length}/20`} />
      </div>
    </motion.header>
  );
}

function InventoryCollection({ inventory }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="nexus-section-flow"
    >
      <SectionHeading eyebrow="Command deck" title="Collection" meta={`${inventory.length}/20 cards`} />

      {inventory.length ? (
        <div className="mt-5 grid grid-cols-5 gap-2.5 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5">
          {inventory.slice(0, 20).map((card, index) => (
            <motion.img
              whileHover={{ y: -6, scale: 1.04 }}
              transition={{ duration: 0.18 }}
              key={`${card.id}-${card.copyNumber || card.copy_number || index}`}
              className="aspect-[2/3] w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.58)]"
              src={card.image}
              alt={card.name}
            />
          ))}
        </div>
      ) : (
        <CompactEmpty
          title="No cards revealed"
          copy="Open your Genesis Pack to build the first command deck."
        />
      )}
    </motion.section>
  );
}

function Leaderboard({ entries }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="nexus-section-flow"
    >
      <SectionHeading eyebrow="Ranked multiplayer" title="Leaderboard" meta="Season 01" />

      {entries.length ? (
        <ol className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {entries.slice(0, 10).map((entry, index) => (
            <li
              key={entry.walletAddress || entry.name || index}
              className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-3 py-3.5"
            >
              <span className="font-mono text-sm text-gold">#{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <strong className="block truncate text-sm uppercase tracking-wide text-white">
                  {entry.name || entry.displayName || defaultPilotName(entry.walletAddress)}
                </strong>
                <span className="text-[11px] text-slate-500">
                  {entry.wins || 0}W · {entry.losses || 0}L · {entry.draws || 0}D
                </span>
              </div>
              <strong className="font-mono text-sm text-gold">{entry.points || 0} PTS</strong>
            </li>
          ))}
        </ol>
      ) : (
        <CompactEmpty
          title="Season awaiting its first champion"
          copy="Complete a ranked Multiplayer match to enter the board. Private rooms do not count."
          index="01"
        />
      )}
    </motion.section>
  );
}

function WalletHistory({ account }) {
  const matches = Array.isArray(account?.matches) ? account.matches : [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="nexus-section-flow"
    >
      <SectionHeading eyebrow="Wallet history" title="Match Log" meta={`${matches.length} recorded`} />

      {matches.length ? (
        <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {matches.slice(0, 12).map((match, index) => {
            const won = match.winner_wallet === account?.walletAddress;
            return (
              <article
                key={match.match_id || match.matchId || match.id}
                className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 py-3.5"
              >
                <span className="font-mono text-xs text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-white">{match.match_id || match.matchId}</strong>
                  <span className="text-[11px] text-slate-500">
                    {match.created_at || match.completed_at || 'recent'}
                  </span>
                </div>
                <span className={won ? 'text-gold' : 'text-slate-400'}>{won ? 'VICTORY' : 'RESULT'}</span>
              </article>
            );
          })}
        </div>
      ) : (
        <CompactEmpty
          title="No battle record yet"
          copy="Your verified ranked results will appear here after the first duel."
          index="00"
        />
      )}
    </motion.section>
  );
}

function SectionHeading({ eyebrow, title, meta }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-gold/20 pb-3">
      <div>
        <p className="nexus-kicker">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black uppercase text-white sm:text-3xl">{title}</h2>
      </div>
      <span className="pb-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{meta}</span>
    </div>
  );
}

function CompactEmpty({ title, copy, index = '00' }) {
  return (
    <div className="nexus-empty-state">
      <span className="nexus-empty-state__index">{index}</span>
      <div>
        <strong className="block text-sm uppercase tracking-[0.08em] text-white">{title}</strong>
        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">{copy}</p>
      </div>
    </div>
  );
}

function HeroStat({ label, value }) {
  return (
    <div className="border-l border-gold/30 pl-3">
      <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <strong className="mt-1 block font-mono text-xl text-gold sm:text-2xl">{value}</strong>
    </div>
  );
}
