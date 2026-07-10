# Nexus Arena

Nexus Arena is a full-screen board-control card game prototype built with React, boardgame.io, Supabase, and an EVM testnet pack flow.

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
- Node.js API server
- Supabase database
- Solidity contracts
- Render deployment

## Local Development

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm start
```

Run the multiplayer/API server:

```bash
npm run server
```

Build production files:

```bash
npm run build
```

## Project Structure

- `src/LayetGame` - Nexus Arena game UI, multiplayer client, pack client, and card logic
- `server` - boardgame.io server, pack API, Supabase writes, ranked result handling
- `contracts` - Genesis Pack and match registry contracts
- `supabase` - database schema
- `public/assets` - runtime game assets
- `assets` - source art and working asset library
- `scripts` - deployment, seeding, and asset preparation scripts

## Deployment

The Render deployment uses:

- Web service for the React build
- API service for multiplayer, packs, and ranked result endpoints
- Supabase for persistent player, pack, inventory, and leaderboard data

This repository is Nexus-only and does not include the old legacy card-game frontend.
