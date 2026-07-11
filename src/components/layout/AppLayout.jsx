import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ToastViewport from '../feedback/ToastViewport';
import WalletLanding from '../web3/WalletLanding';
import nexusArenaWordmark from '../../assets/branding/nexus-arena-wordmark.svg';
import nexusSigil from '../../assets/branding/nexus-ui-sigil.svg';
import arenaBackground from '../../assets/backgrounds/nexus-arena-v1.png';
import mintBackground from '../../assets/backgrounds/nexus-mint-v1.png';
import profileBackground from '../../assets/backgrounds/nexus-profile-v1.png';
import { shortAddress } from '../../LayetGame/genesisPackClient';
import { useNexusStore } from '../../store/useNexusStore';

const navItems = [
  { to: '/', label: 'Mint', meta: 'Genesis drop' },
  { to: '/arena', label: 'Arena', meta: 'Ranked play' },
  { to: '/profile', label: 'Profile', meta: 'Pilot record' },
];

const routeBackgrounds = {
  '/': mintBackground,
  '/arena': arenaBackground,
  '/profile': profileBackground,
};

export default function AppLayout() {
  const location = useLocation();
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const clearPlayerAccount = useNexusStore((state) => state.clearPlayerAccount);
  const inventoryCount = playerAccount?.inventory?.length || 0;
  const isAuthenticated = Boolean(playerAccount?.authenticated);
  const routeBackground = routeBackgrounds[location.pathname] || routeBackgrounds['/'];

  if (!isAuthenticated) {
    return (
      <>
        <WalletLanding />
        <ToastViewport />
      </>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-950 font-sans text-white"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(2,6,23,0.96), rgba(15,23,42,0.68), rgba(2,6,23,0.92)), url(${routeBackground})`,
        backgroundAttachment: 'fixed',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,211,138,0.18),transparent_28%),radial-gradient(circle_at_72%_44%,rgba(59,130,246,0.18),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.36),rgba(2,6,23,0.82))]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="nexus-app-rail relative overflow-hidden border-b border-gold/15 bg-slate-950/72 px-5 py-5 shadow-[18px_0_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <img
            src={nexusSigil}
            alt=""
            className="nexus-ornament-bg -right-40 top-28 h-96 w-96"
            draggable="false"
          />
          <div className="nexus-app-rail__body flex h-full flex-col">
            <NavLink to="/" className="group block">
              <img
                src={nexusArenaWordmark}
                alt="NEXUS ARENA"
                className="nexus-app-rail__logo h-auto w-full max-w-[220px] origin-left scale-[1.08] select-none drop-shadow-[0_18px_42px_rgba(37,99,235,0.35)] transition duration-300 group-hover:brightness-125"
                draggable="false"
              />
            </NavLink>

            <nav className="nexus-app-nav mt-8 grid gap-1 border-y border-white/10 py-3">
              {navItems.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'nexus-app-nav__item group relative border-l px-4 py-3 transition',
                      isActive
                        ? 'border-gold text-gold bg-gradient-to-r from-gold/10 to-transparent'
                        : 'border-transparent text-slate-400 hover:border-gold/35 hover:text-white',
                    ].join(' ')
                  }
                >
                  <span className="flex items-center justify-between gap-4">
                    <span>
                      <span className="nexus-app-nav__index block text-[10px] font-black uppercase tracking-[0.24em] text-white/35">
                        0{index + 1}
                      </span>
                      <span className="nexus-app-nav__label mt-1 block text-sm font-black uppercase tracking-[0.2em]">
                        {item.label}
                      </span>
                    </span>
                    <span className="nexus-app-nav__arrow font-mono text-sm text-gold/50 transition group-hover:translate-x-1">&gt;</span>
                  </span>
                  <span className="nexus-app-nav__meta mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {item.meta}
                  </span>
                </NavLink>
              ))}
            </nav>

            <div className="nexus-wallet-strip mt-8 border-y border-white/10 py-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold/75">
                Connected Wallet
              </p>
              <p className="nexus-wallet-strip__address mt-2 font-mono text-sm text-white">
                {shortAddress(playerAccount.walletAddress)}
              </p>
              <div className="nexus-wallet-strip__stats mt-4 grid grid-cols-2 divide-x divide-white/10 text-center">
                <div className="py-2">
                  <strong className="block text-xl text-gold">{inventoryCount}</strong>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Cards</span>
                </div>
                <div className="py-2">
                  <strong className="block text-xl text-white">20</strong>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Max</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={clearPlayerAccount}
              className="nexus-ccg-button mt-auto hidden border border-white/10 bg-black/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 transition hover:border-red-300/40 hover:bg-red-950/25 hover:text-red-100 lg:block"
            >
              Disconnect Session
            </button>
          </div>
        </aside>

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="min-w-0"
        >
          <Outlet />
        </motion.main>
      </div>

      <ToastViewport />
    </div>
  );
}
