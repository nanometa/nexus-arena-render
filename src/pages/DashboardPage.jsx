import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import GenesisDrop from '../components/web3/GenesisDrop';
import gameEmblem from '../assets/branding/game-emblem.png';
import nexusArenaWordmark from '../assets/branding/nexus-arena-wordmark.svg';
import nexusSigil from '../assets/branding/nexus-ui-sigil.svg';
import { CARD_CATALOG } from '../LayetGame/cards.generated';
import { defaultPilotName } from '../LayetGame/genesisPackClient';
import { useNexusStore } from '../store/useNexusStore';

const ELEMENTS = ['all', 'fire', 'water', 'earth', 'nature', 'shadow', 'electric'];
const RARITIES = ['all', 'common', 'rare', 'epic', 'legendary'];

function rarityFromTier(tier) {
  if (tier === '300-390' || tier === '400-490') return 'common';
  if (tier === '500-590') return 'rare';
  if (tier === '600-680') return 'epic';
  return 'legendary';
}

export default function DashboardPage() {
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const [element, setElement] = useState('all');
  const [rarity, setRarity] = useState('all');
  const inventory = useMemo(
    () => (Array.isArray(playerAccount?.inventory) ? playerAccount.inventory : []),
    [playerAccount?.inventory]
  );
  const codexCards = useMemo(
    () => CARD_CATALOG.map((card) => ({ ...card, rarity: rarityFromTier(card.tier) })),
    []
  );
  const filteredCodex = useMemo(
    () => codexCards.filter(
      (card) =>
        (element === 'all' || card.element === element) &&
        (rarity === 'all' || card.rarity === rarity)
    ),
    [codexCards, element, rarity]
  );
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
              <p className="nexus-kicker">Complete card archive</p>
              <h2>Nexus Codex</h2>
            </div>
            <Link to="/collection">My collection</Link>
          </header>

          <div className="nexus-hub-codex-toolbar">
            <CodexFilter label="Element" values={ELEMENTS} value={element} onChange={setElement} />
            <CodexFilter label="Rarity" values={RARITIES} value={rarity} onChange={setRarity} />
            <strong>{filteredCodex.length}/{codexCards.length}</strong>
          </div>

          <div className="nexus-hub-codex-grid" aria-label="Complete Nexus card catalog">
            {filteredCodex.map((card, index) => (
              <motion.figure
                key={card.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 18) * 0.025 }}
                whileHover={{ y: -7, scale: 1.025 }}
                title={`${card.name} - ${card.element} - ${card.rarity}`}
              >
                <img src={card.image} alt={card.name} draggable="false" />
              </motion.figure>
            ))}
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

function CodexFilter({ label, values, value, onChange }) {
  return (
    <div className="nexus-filter-group">
      <span>{label}</span>
      <div>
        {values.map((option) => (
          <button
            key={option}
            type="button"
            className={option === value ? 'is-active' : ''}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
