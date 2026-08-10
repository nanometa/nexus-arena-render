# Nexus Arena

Nexus Arena is a full-screen Web3 board-control card game built with React,
boardgame.io, Supabase, and an EVM testnet Genesis Pack flow.

## Current Focus

- Full-screen multiplayer scene
- Matchmaking and private room flows
- Genesis Pack mint/open flow
- Player inventory from opened packs
- Ranked leaderboard for matchmaking games
- Nexus-style card catalog and arena UI

## Tech Stack

- React 18
- boardgame.io
- Supabase Auth, Postgres, Realtime, and Edge Functions
- Cloudflare Pages
- Solidity contracts

## Local Development

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm start
```

Run the legacy Node server only when testing historical server code:

```bash
npm run server
```

Build production files:

```bash
npm run build
```

## Project Structure

- `src/LayetGame` - Nexus Arena game UI, multiplayer client, pack client, and card logic
- `server` - legacy Node implementation and its security regression tests
- `contracts` - Genesis Pack and match registry contracts
- `supabase/functions/nexus-api` - authoritative pack, profile, room, and match API
- `supabase/functions/_shared` - server-authoritative 4x4 game engine
- `supabase/migrations` - additive database and Realtime migrations
- `public/assets` - runtime game assets
- `assets` - source art and working asset library
- `scripts` - deployment, seeding, and asset preparation scripts

## Production Deployment

- `nexusarena.pro` is served by Cloudflare Pages.
- Supabase Web3 Auth uses the connected wallet as the persistent identity.
- The `nexus-api` Edge Function validates pack receipts and every online move.
- Supabase Realtime broadcasts a different redacted game view to each player.
- Existing players, packs, opened inventories, matches, and leaderboard rows are
  preserved by the additive migration.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact setup and verification steps.

This repository is Nexus-only and does not include the old legacy card-game frontend.
