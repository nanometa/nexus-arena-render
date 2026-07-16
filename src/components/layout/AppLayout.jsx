import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import ToastViewport from '../feedback/ToastViewport';
import WalletLanding from '../web3/WalletLanding';
import nexusArenaWordmark from '../../assets/branding/nexus-arena-wordmark.svg';
import arenaBackground from '../../assets/backgrounds/nexus-arena-v1.png';
import landingBackground from '../../assets/backgrounds/nexus-landing-v1.png';
import mintBackground from '../../assets/backgrounds/nexus-mint-v1.png';
import profileBackground from '../../assets/backgrounds/nexus-profile-v1.png';
import { CARD_CATALOG } from '../../LayetGame/cards.generated';
import { defaultPilotName, shortAddress } from '../../LayetGame/genesisPackClient';
import { useNexusStore } from '../../store/useNexusStore';

const navItems = [
  { to: '/', label: 'Hub', meta: 'Command' },
  { to: '/collection', label: 'Collection', meta: 'Deck' },
  { to: '/arena', label: 'Play', meta: 'Arena' },
  { to: '/profile', label: 'Profile', meta: 'Pilot' },
];

const routeBackgrounds = {
  '/': landingBackground,
  '/collection': mintBackground,
  '/arena': arenaBackground,
  '/profile': profileBackground,
};

function ClientNav({ className = '' }) {
  return (
    <nav className={`nexus-client-nav ${className}`} aria-label="Game navigation">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `nexus-client-nav__item ${isActive ? 'is-active' : ''}`
          }
        >
          <span>{item.label}</span>
          <small>{item.meta}</small>
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);
  const clearPlayerAccount = useNexusStore((state) => state.clearPlayerAccount);
  const isLocalPreview =
    process.env.NODE_ENV === 'development' &&
    new URLSearchParams(location.search).get('nexus-preview') === '1';
  const inventoryCount = playerAccount?.inventory?.length || 0;
  const isAuthenticated = Boolean(playerAccount?.authenticated);
  const routeBackground = routeBackgrounds[location.pathname] || routeBackgrounds['/'];
  const pilotName =
    playerAccount?.profile?.display_name || defaultPilotName(playerAccount?.walletAddress);

  useEffect(() => {
    if (!isLocalPreview || playerAccount?.authenticated) return;
    const inventory = CARD_CATALOG.slice(0, 20).map((card, index) => ({
      ...card,
      rarity: index < 10 ? 'common' : index < 15 ? 'rare' : index < 19 ? 'epic' : 'legendary',
      copyNumber: 1,
    }));
    setPlayerAccount({
      authenticated: true,
      walletAddress: '0x84c000000000000000000000000000000000d970',
      profile: { display_name: 'Pilot D970' },
      inventory,
      packs: [{ token_id: 1, status: 'opened' }],
      stats: { games: 18, wins: 11, losses: 6, draws: 1, points: 34 },
      matches: [],
    });
  }, [isLocalPreview, playerAccount?.authenticated, setPlayerAccount]);

  useEffect(() => {
    if (isLocalPreview) return;
    if (!isAuthenticated) return;
    const activeWallet = String(address || '').toLowerCase();
    const sessionWallet = String(playerAccount?.walletAddress || '').toLowerCase();
    if (!isConnected || !activeWallet || activeWallet !== sessionWallet) {
      clearPlayerAccount();
    }
  }, [address, clearPlayerAccount, isAuthenticated, isConnected, isLocalPreview, playerAccount?.walletAddress]);

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
      className="nexus-client-shell"
      style={{ '--nexus-route-background': `url(${routeBackground})` }}
    >
      <header className="nexus-client-bar">
        <NavLink to="/" className="nexus-client-brand" aria-label="Nexus Arena Hub">
          <img src={nexusArenaWordmark} alt="NEXUS ARENA" draggable="false" />
        </NavLink>

        <ClientNav className="nexus-client-nav--desktop" />

        <div className="nexus-client-pilot">
          <div className="nexus-client-pilot__copy">
            <strong>{pilotName}</strong>
            <span>{shortAddress(playerAccount.walletAddress)}</span>
          </div>
          <div className="nexus-client-pilot__deck">
            <strong>{inventoryCount}</strong>
            <span>/20</span>
          </div>
          <button type="button" onClick={clearPlayerAccount} aria-label="Disconnect wallet session">
            Exit
          </button>
        </div>
      </header>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: 'easeOut' }}
        className="nexus-client-stage"
      >
        <Outlet />
      </motion.main>

      <ClientNav className="nexus-client-nav--mobile" />
      <ToastViewport />
    </div>
  );
}
