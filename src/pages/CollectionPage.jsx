import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import gameEmblem from '../assets/branding/game-emblem.png';
import { useNexusStore } from '../store/useNexusStore';

const CARD_BACK = '/assets/cards/backs/card-back-standard.png';
const ELEMENTS = ['all', 'fire', 'water', 'earth', 'nature', 'shadow', 'electric'];
const RARITIES = ['all', 'common', 'rare', 'epic', 'legendary'];

export default function CollectionPage() {
  const inventory = useNexusStore((state) => state.playerAccount?.inventory || []);
  const [element, setElement] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [selectedCard, setSelectedCard] = useState(null);

  const filteredCards = useMemo(
    () =>
      inventory.filter(
        (card) =>
          (element === 'all' || card.element === element) &&
          (rarity === 'all' || card.rarity === rarity)
      ),
    [element, inventory, rarity]
  );

  return (
    <section className="nexus-collection-page">
      <header className="nexus-page-intro nexus-page-intro--collection">
        <div>
          <p className="nexus-kicker">Wallet-bound command deck</p>
          <h1>Collection</h1>
          <p>Inspect your Genesis cards and prepare the deck you take into the Arena.</p>
        </div>
        <div className="nexus-page-intro__status">
          <img src={gameEmblem} alt="" draggable="false" />
          <div>
            <strong>{inventory.length}/20</strong>
            <span>Cards revealed</span>
          </div>
        </div>
      </header>

      <div className="nexus-collection-toolbar">
        <FilterGroup label="Element" values={ELEMENTS} value={element} onChange={setElement} />
        <FilterGroup label="Rarity" values={RARITIES} value={rarity} onChange={setRarity} />
        <span className="nexus-collection-toolbar__count">{filteredCards.length} cards</span>
      </div>

      {inventory.length ? (
        <motion.div layout className="nexus-collection-grid">
          <AnimatePresence mode="popLayout">
            {filteredCards.map((card, index) => (
              <motion.button
                layout
                key={`${card.id}-${card.copyNumber || card.copy_number || index}`}
                type="button"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                whileHover={{ y: -8, scale: 1.025 }}
                transition={{ duration: 0.2 }}
                className="nexus-collection-card"
                onClick={() => setSelectedCard(card)}
              >
                <img src={card.image || CARD_BACK} alt={card.name} draggable="false" />
                <span className="nexus-collection-card__shine" />
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="nexus-collection-empty">
          <img src={CARD_BACK} alt="Nexus card back" />
          <div>
            <p className="nexus-kicker">Genesis deck sealed</p>
            <h2>Your collection is waiting</h2>
            <p>Mint and open the Genesis Pack to reveal your twenty-card command deck.</p>
            <Link to="/">Return to Hub</Link>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedCard && (
          <CardInspector card={selectedCard} onClose={() => setSelectedCard(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}

function FilterGroup({ label, values, value, onChange }) {
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

function CardInspector({ card, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <motion.div
      className="nexus-card-inspector"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
      >
        <div className="nexus-card-inspector__art">
          <img src={card.image || CARD_BACK} alt={card.name} />
        </div>
        <div className="nexus-card-inspector__copy">
          <button type="button" onClick={onClose} aria-label="Close card inspection">Close</button>
          <p className="nexus-kicker">Genesis command card</p>
          <h2>{card.name}</h2>
          <dl>
            <div><dt>Element</dt><dd>{card.element || 'Unknown'}</dd></div>
            <div><dt>Rarity</dt><dd>{card.rarity || 'Unknown'}</dd></div>
            <div><dt>Tier</dt><dd>{card.tier || 'Unknown'}</dd></div>
            <div><dt>Copy</dt><dd>#{card.copyNumber || card.copy_number || 1}</dd></div>
          </dl>
          <Link to="/arena">Deploy to Arena</Link>
        </div>
      </motion.section>
    </motion.div>
  );
}
