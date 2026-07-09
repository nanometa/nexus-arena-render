const path = require('path');
const dotenv = require('dotenv');
const { loadCardCatalog, summarizeCatalog } = require('../server/cards/catalog');
const { supabaseRest } = require('../server/supabase/client');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

(async () => {
  const cards = loadCardCatalog();
  const rows = cards.map((card) => ({
    id: card.id,
    name: card.name,
    element: card.element,
    tier: card.tier,
    rarity: card.rarity,
    score: card.score,
    image: card.image,
  }));

  await supabaseRest('cards?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: rows,
  });

  console.log('Seeded Supabase cards catalog');
  console.log(JSON.stringify(summarizeCatalog(cards), null, 2));
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
