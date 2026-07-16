require('./register-layet-game');

const path = require('path');
const dotenv = require('dotenv');
const { Server, Origins } = require('boardgame.io/server');
const { LayetDuelMultiplayer } = require('../src/LayetGame/game.multiplayer');
const { getMatchRegistryStatus } = require('./onchain/matchRegistry');
const { getGenesisPackStatus } = require('./onchain/genesisPack');
const { getSupabaseStatus } = require('./supabase/client');
const { createRankedResultsApi } = require('./ranked-results');
const { createPacksApi } = require('./packs-api');
const { createPlayerApi } = require('./player-api');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const port = Number(process.env.PORT || 8000);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3001';
const additionalClientOrigins = (process.env.CLIENT_ORIGINS || 'https://nexusarena.pro,https://www.nexusarena.pro')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? [...new Set([clientOrigin, ...additionalClientOrigins])]
    : [clientOrigin, ...additionalClientOrigins, 'http://localhost:3000', 'http://localhost:3001', Origins.LOCALHOST];

const server = Server({
  games: [LayetDuelMultiplayer],
  origins: allowedOrigins,
  apiOrigins: allowedOrigins,
});

server.app.use(
  createRankedResultsApi({
    gameName: LayetDuelMultiplayer.name,
    allowedOrigins,
  })
);

server.app.use(createPacksApi({ allowedOrigins }));
server.app.use(createPlayerApi({ allowedOrigins }));

server.app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = {
      ok: true,
      game: LayetDuelMultiplayer.name,
      onchain: getMatchRegistryStatus(),
      genesisPack: getGenesisPackStatus(),
      supabase: getSupabaseStatus(),
      time: new Date().toISOString(),
    };
    return;
  }

  await next();
});

server.run(port, () => {
  console.log(`NEXUS ARENA multiplayer server running on port ${port}`);
});
