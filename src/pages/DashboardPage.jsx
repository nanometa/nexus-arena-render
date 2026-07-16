import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import GenesisDrop from '../components/web3/GenesisDrop';
import gameEmblem from '../assets/branding/game-emblem.png';
import nexusArenaWordmark from '../assets/branding/nexus-arena-wordmark.svg';
import nexusSigil from '../assets/branding/nexus-ui-sigil.svg';
import { defaultPilotName } from '../LayetGame/genesisPackClient';
import { useNexusStore } from '../store/useNexusStore';

const CARD_BACK = '/assets/cards/backs/card-back-standard.png';

export default function DashboardPage() {
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const inventory = useMemo(
    () => (Array.isArray(playerAccount?.inventory) ? playerAccount.inventory : []),
    [playerAccount?.inventory]
  );
  const featuredCards = inventory.slice(0, 7);
  const pilotName =
    playerAccount?.profile?.display_name || defaultPilotName(playerAccount?.walletAddress);
  const stats = playerAccount?.stats || {};

  return (
    <section className="nexus-hub-page">
      <div className="nexus-hub-hero">
        <img src={nexusSigil} alt="" className="nexus-hub-hero__sigil" draggable="false" />
        <div className="nexus-hub-hero__copy">
          <p className="nexus-kicker">Command center online</p>
          <img src={nexusArenaWordmark} alt="NEXUS ARENA" draggable="false" />
          <h1>Welcome back, {pilotName}</h1>
          <p>
            Your Genesis deck is linked to this wallet. Enter Ranked play, challenge a rival,
            or inspect the cards under your command.
          </p>
          <div className="nexus-hub-hero__actions">
            <Link to="/arena" className="is-primary">Enter Arena</Link>
            <Link to="/collection">View Collection</Link>
          </div>
        </div>

        <div className="nexus-hub-hero__deck">
          <img src={gameEmblem} alt="" draggable="false" />
          <span>Active command deck</span>
          <strong>{inventory.length}/20</strong>
          <small>{inventory.length === 20 ? 'Combat ready' : 'Genesis pack required'}</small>
        </div>
      </div>

      <div className="nexus-hub-stats">
        <HubStat label="Rank points" value={stats.points || 0} />
        <HubStat label="Victories" value={stats.wins || 0} />
        <HubStat label="Battles" value={stats.games || 0} />
        <HubStat label="Cards" value={`${inventory.length}/20`} />
      </div>

      <div className="nexus-hub-content">
        <section className="nexus-hub-deck-preview">
          <header>
            <div>
              <p className="nexus-kicker">Command deck</p>
              <h2>Your formation</h2>
            </div>
            <Link to="/collection">Open collection</Link>
          </header>

          <div className="nexus-hub-card-line">
            {Array.from({ length: 7 }, (_, index) => {
              const card = featuredCards[index];
              return (
                <motion.img
                  key={card?.id || `sealed-${index}`}
                  src={card?.image || CARD_BACK}
                  alt={card?.name || 'Sealed Nexus card'}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.045 }}
                  whileHover={{ y: -12, scale: 1.045 }}
                  draggable="false"
                />
              );
            })}
          </div>
        </section>

        <aside className="nexus-hub-drop">
          <GenesisDrop />
        </aside>
      </div>
    </section>
  );
}

function HubStat({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
