const fs = require('fs');
const path = require('path');

function rarityFromTier(tier) {
  if (tier === '300-390' || tier === '400-490') return 'common';
  if (tier === '500-590') return 'rare';
  if (tier === '600-680') return 'epic';
  return 'legendary';
}

function loadCardCatalog() {
  const catalogPath = path.resolve(__dirname, '..', '..', 'src', 'LayetGame', 'cards.generated.js');
  const source = fs.readFileSync(catalogPath, 'utf8');
  const match = source.match(/export const CARD_CATALOG = ([\s\S]*?);\s*export const CARD_TOTAL/);
  if (!match) {
    throw new Error('Unable to parse CARD_CATALOG from cards.generated.js');
  }

  return JSON.parse(match[1]).map((card) => ({
    ...card,
    rarity: rarityFromTier(card.tier),
  }));
}

function summarizeCatalog(cards) {
  return cards.reduce(
    (summary, card) => {
      summary.total += 1;
      summary.elements[card.element] = (summary.elements[card.element] || 0) + 1;
      summary.tiers[card.tier] = (summary.tiers[card.tier] || 0) + 1;
      summary.rarities[card.rarity] = (summary.rarities[card.rarity] || 0) + 1;
      return summary;
    },
    { total: 0, elements: {}, tiers: {}, rarities: {} }
  );
}

module.exports = {
  loadCardCatalog,
  rarityFromTier,
  summarizeCatalog,
};
