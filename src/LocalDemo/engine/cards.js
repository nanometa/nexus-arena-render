/**
 * Local demo — temporary card data for the 6 test characters.
 *
 * IMPORTANT (first test): data is intentionally simple and deterministic.
 * Cards have NO complex effects yet. `ability` is a short display label only and
 * does NOT alter combat. Combat is resolved purely on `power`.
 *
 * Deck rules implemented here:
 *  - DECK_SIZE = 18
 *  - MAX_COPIES_NORMAL = 3 copies max of a given normal card
 *  - MAX_LEGENDARY = 1 legendary card max in a deck
 *  - a legendary card costs 2 sacrifices to summon (enforced in gameLogic.js)
 *
 * NOTE on the 6-character test pool: with only 6 characters, the only way to reach
 * exactly 18 cards while respecting "max 3 normal copies" and "max 1 legendary" is an
 * all-normal deck (6 x 3 = 18). The legendary mechanic is therefore fully implemented
 * and unit-tested (see engine tests + SAMPLE_LEGENDARY) but is not part of the default
 * test deck. A legendary becomes deck-legal as soon as a 7th+ card exists.
 */

export const ELEMENTS = {
  ELECTRIC: 'ELECTRIC',
  FIRE: 'FIRE',
  WATER: 'WATER',
  EARTH: 'EARTH',
  NATURE: 'NATURE',
  SHADOW: 'SHADOW',
};

export const RARITY = {
  NORMAL: 'normal',
  LEGENDARY: 'legendary',
};

export const DECK_SIZE = 18;
export const MAX_COPIES_NORMAL = 3;
export const MAX_LEGENDARY = 1;
export const LEGENDARY_SACRIFICES = 2;

// Base path where final artworks will live. Files are not served yet (they live under
// the repo-root `assets/` folder, outside CRA's `public/`). The UI attempts to load them
// and falls back to a CSS placeholder on error (see LocalDemo.css). When a future step
// serves `assets/` (or copies it into `public/`), these same paths will resolve.
export const ARTWORK_BASE = '/assets/cards/artworks';

// Separate visual layers: the transparent PNG frame and the elemental icon each have their
// own base path (served in dev by src/setupProxy.js). When a given PNG is missing, GameCard
// falls back to a CSS frame / an emoji icon — no asset file is required for the demo to work.
export const FRAME_BASE = '/assets/cards/frames';
export const ELEMENT_ICON_BASE = '/assets/elements';

// Display metadata for each element: French label + emoji used as the icon fallback.
export const ELEMENT_META = {
  [ELEMENTS.ELECTRIC]: { label: 'Électrique', icon: '⚡' },
  [ELEMENTS.FIRE]: { label: 'Feu', icon: '🔥' },
  [ELEMENTS.WATER]: { label: 'Eau', icon: '💧' },
  [ELEMENTS.EARTH]: { label: 'Terre', icon: '⛰️' },
  [ELEMENTS.NATURE]: { label: 'Nature', icon: '🌿' },
  [ELEMENTS.SHADOW]: { label: 'Ombre', icon: '🌑' },
};

export const RARITY_META = {
  [RARITY.NORMAL]: { label: 'Normale' },
  [RARITY.LEGENDARY]: { label: 'Légendaire' },
};

/**
 * The 6 test characters. `power` is the only stat used by combat for now.
 */
export const CHARACTERS = {
  NYRA: {
    key: 'NYRA',
    name: 'Nyra',
    element: ELEMENTS.ELECTRIC,
    power: 500,
    rarity: RARITY.NORMAL,
    ability: 'Aucun effet (test)',
    artwork: `${ARTWORK_BASE}/nyra-electric-sentinel-premium-v2.png`,
  },
  PYRA: {
    key: 'PYRA',
    name: 'Pyra',
    element: ELEMENTS.FIRE,
    power: 600,
    rarity: RARITY.NORMAL,
    ability: 'Aucun effet (test)',
    artwork: `${ARTWORK_BASE}/pyra-fire-duelist-premium-v2.png`,
  },
  NERIS: {
    key: 'NERIS',
    name: 'Neris',
    element: ELEMENTS.WATER,
    power: 450,
    rarity: RARITY.NORMAL,
    ability: 'Aucun effet (test)',
    artwork: `${ARTWORK_BASE}/neris-water-oracle-premium-v2.png`,
  },
  GORAM: {
    key: 'GORAM',
    name: 'Goram',
    element: ELEMENTS.EARTH,
    power: 700,
    rarity: RARITY.NORMAL,
    ability: 'Aucun effet (test)',
    artwork: `${ARTWORK_BASE}/goram-earth-colossus-premium-v2.png`,
  },
  SYLVA: {
    key: 'SYLVA',
    name: 'Sylva',
    element: ELEMENTS.NATURE,
    power: 400,
    rarity: RARITY.NORMAL,
    ability: 'Aucun effet (test)',
    artwork: `${ARTWORK_BASE}/sylva-nature-warden-premium-v2.png`,
  },
  NOX: {
    key: 'NOX',
    name: 'Nox',
    element: ELEMENTS.SHADOW,
    power: 800,
    rarity: RARITY.NORMAL,
    ability: 'Aucun effet (test)',
    artwork: `${ARTWORK_BASE}/nox-shadow-revenant-premium-v2.png`,
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

/**
 * Sample legendary card used to exercise the legendary deck rule and the
 * 2-sacrifice summon cost in unit tests / future content. NOT in the default deck.
 */
export const SAMPLE_LEGENDARY = {
  key: 'NOX_PRIME',
  name: 'Nox Prime',
  element: ELEMENTS.SHADOW,
  power: 1200,
  rarity: RARITY.LEGENDARY,
  ability: 'Légendaire — nécessite 2 sacrifices (test)',
  artwork: `${ARTWORK_BASE}/nox-shadow-revenant-premium-v2.png`,
};

/**
 * Build the default 18-card test deck: 3 copies of each of the 6 normal characters.
 * Returns an array of card *templates* (plain definitions). gameLogic instantiates them
 * with unique instance ids.
 */
export function buildDefaultDeck() {
  const deck = [];
  for (const character of CHARACTER_LIST) {
    for (let i = 0; i < MAX_COPIES_NORMAL; i++) {
      deck.push({ ...character });
    }
  }
  return deck; // 6 * 3 = 18
}

/**
 * Validate a deck (array of card templates) against the demo rules.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDeck(deck) {
  const errors = [];

  if (!Array.isArray(deck)) {
    return { valid: false, errors: ['Le deck doit être un tableau.'] };
  }

  if (deck.length !== DECK_SIZE) {
    errors.push(`Le deck doit contenir ${DECK_SIZE} cartes (actuel : ${deck.length}).`);
  }

  let legendaryCount = 0;
  const normalCopies = {};

  for (const card of deck) {
    if (!card || !card.key || !card.rarity) {
      errors.push('Carte invalide (clé/rareté manquante).');
      continue;
    }
    if (card.rarity === RARITY.LEGENDARY) {
      legendaryCount++;
    } else {
      normalCopies[card.key] = (normalCopies[card.key] || 0) + 1;
    }
  }

  if (legendaryCount > MAX_LEGENDARY) {
    errors.push(
      `Maximum ${MAX_LEGENDARY} carte légendaire par deck (actuel : ${legendaryCount}).`
    );
  }

  for (const [key, count] of Object.entries(normalCopies)) {
    if (count > MAX_COPIES_NORMAL) {
      errors.push(
        `Maximum ${MAX_COPIES_NORMAL} exemplaires de la carte normale ${key} (actuel : ${count}).`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
