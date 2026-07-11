import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import GenesisDrop from '../components/web3/GenesisDrop';
import nexusArenaWordmark from '../assets/branding/nexus-arena-wordmark.svg';
import nexusSigil from '../assets/branding/nexus-ui-sigil.svg';
import dashboardFrame from '../assets/branding/nexus-dashboard-frame.png';
import genesisPackArt from '../LayetGame/assets/packs/nexus-genesis-pack.png';
import { useNexusStore } from '../store/useNexusStore';

const CARD_BACK = '/assets/cards/backs/card-back-standard.png';

export default function DashboardPage() {
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const inventory = useMemo(
    () => (Array.isArray(playerAccount?.inventory) ? playerAccount.inventory : []),
    [playerAccount?.inventory]
  );
  const displayCards = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) => {
        const card = inventory[index];
        return card || {
          id: `placeholder-${index}`,
          name: 'Unrevealed Nexus Card',
          image: CARD_BACK,
          placeholder: true,
        };
      }),
    [inventory]
  );

  return (
    <section className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1660px]">
        <DashboardHero inventoryCount={inventory.length} />

        <div className="mt-4 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0">
            <div className="flex items-end justify-between gap-4 border-b border-gold/20 pb-3">
              <div>
                <p className="nexus-kicker">Wallet collection</p>
                <h1 className="mt-1 text-2xl font-black uppercase text-white sm:text-3xl">Command Deck</h1>
              </div>
              <span className="font-mono text-sm text-gold">{inventory.length}/20</span>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
              <img
                src={nexusSigil}
                alt=""
                className="nexus-ornament-bg left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 opacity-15"
                draggable="false"
              />
              {displayCards.map((card, index) => (
                <PremiumCard key={`${card.id}-${index}`} card={card} index={index} />
              ))}
            </div>
          </main>

          <aside className="nexus-command-rail">
            <WalletSummary account={playerAccount} inventoryCount={inventory.length} />
            <div className="my-1 h-px bg-gradient-to-r from-gold/50 via-gold/15 to-transparent" />
            <GenesisDrop />
          </aside>
        </div>
      </div>
    </section>
  );
}

function DashboardHero({ inventoryCount }) {
  return (
    <header className="nexus-dashboard-hero">
      <img src={dashboardFrame} alt="" className="nexus-hero-frame" draggable="false" />
      <div className="min-w-0">
        <img
          src={nexusArenaWordmark}
          alt="NEXUS ARENA"
          className="h-auto w-[min(450px,100%)] select-none drop-shadow-[0_24px_70px_rgba(37,99,235,0.32)]"
          draggable="false"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="flex shrink-0 items-center gap-4"
      >
        <img
          src={genesisPackArt}
          alt="Nexus Genesis Pack"
          className="h-24 w-16 object-cover drop-shadow-[0_14px_30px_rgba(0,0,0,0.8)]"
        />
        <div>
          <span className="nexus-kicker block">Genesis Deck</span>
          <strong className="mt-1 block font-mono text-3xl text-white">{inventoryCount}/20</strong>
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">cards revealed</span>
        </div>
      </motion.div>
    </header>
  );
}

function PremiumCard({ card, index }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: Math.min(index * 0.018, 0.24) }}
      whileHover={{ y: -8, scale: 1.025 }}
      className={[
        'group relative z-[1] aspect-[2/3] overflow-hidden bg-transparent drop-shadow-[0_20px_24px_rgba(0,0,0,0.58)]',
        'before:pointer-events-none before:absolute before:inset-0 before:z-10 before:bg-[linear-gradient(120deg,transparent_34%,rgba(255,255,255,0.16)_46%,transparent_58%)] before:opacity-0 before:transition before:duration-500 hover:before:opacity-100',
        card.placeholder
          ? 'opacity-90 hover:drop-shadow-[0_24px_30px_rgba(37,99,235,0.28)]'
          : 'hover:drop-shadow-[0_24px_30px_rgba(37,99,235,0.28)]',
      ].join(' ')}
    >
      <img
        className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.018]"
        src={card.image || CARD_BACK}
        alt={card.name}
      />
    </motion.article>
  );
}

function WalletSummary({ account, inventoryCount }) {
  const wallet = account?.walletAddress || '';
  const compact = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '0x0000...0000';

  return (
    <section className="py-2">
      <p className="nexus-kicker">Pilot Status</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <h2 className="truncate text-2xl font-black text-white">
          {account?.profile?.display_name || 'Connected Pilot'}
        </h2>
        <span className="mb-1 h-2 w-2 shrink-0 rounded-full bg-gold shadow-[0_0_16px_rgba(245,211,138,0.8)]" />
      </div>
      <dl className="mt-5 divide-y divide-white/10 border-y border-white/10">
        <SummaryRow label="Wallet" value={compact} />
        <SummaryRow label="Collection" value={`${inventoryCount}/20`} />
        <SummaryRow label="Ranked Points" value={account?.stats?.points || 0} />
      </dl>
    </section>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="font-mono text-sm text-white">{value}</dd>
    </div>
  );
}
