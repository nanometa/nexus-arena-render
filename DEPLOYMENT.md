# Nexus Arena Free Production Stack

Production uses Cloudflare Pages for the React application and the existing
Supabase project for wallet authentication, persistent data, authoritative game
moves, and Realtime synchronization.

## 1. Supabase

1. Link the CLI to project `hqmnybdqtmssqxuqwghg`.
2. Apply `supabase/migrations/202608090001_cloudflare_realtime_multiplayer.sql`.
3. Enable Web3 Wallet authentication in Authentication settings.
4. Add `https://nexusarena.pro` as the site URL and allow
   `https://nexusarena.pro/**` plus `https://www.nexusarena.pro/**` redirects.
5. Configure Edge Function secrets:

   - `LITVM_RPC_URL`
   - `GENESIS_PACK_ADDRESS`
   - `PACK_CHAIN_STRICT=true`
   - `APP_ORIGINS=https://nexusarena.pro,https://www.nexusarena.pro,https://nexus-arena-4iz.pages.dev`

6. Deploy `nexus-api` with JWT gateway verification disabled. The function
   validates authenticated actions itself so `status` and `leaderboard` can
   remain public.

The migration is additive. It does not delete or rewrite `players`,
`player_packs`, `pack_openings`, `player_cards`, `cards`, `matches`, or
`leaderboard_entries`.

## 2. Cloudflare Pages

1. Build with `npm run build`.
2. Deploy `build` to the `nexus-arena` Pages project.
3. Configure `nexusarena.pro` and `www.nexusarena.pro` as custom domains.
4. Keep `public/_redirects`; it routes direct requests such as `/arena` and
   `/profile` back to the React application.

The browser bundle only receives the Supabase publishable key. Service-role,
wallet deployer, and relayer secrets must never be configured in Cloudflare.

## 3. Release Verification

Run before publishing:

```bash
npm run build
npm run test:supabase-game
npm run test:security
```

After publishing, verify:

- `/`, `/arena`, and `/profile` survive a direct refresh.
- A wallet session is restored after refresh.
- A saved display name remains canonical in Profile and Leaderboard.
- AI Duel works without changing ranked points.
- Private Room waits for a second wallet and never changes ranked points.
- Quick Match synchronizes both perspectives and changes ranked results once.
- Each player sees their own side as blue and the opponent as red.
- Genesis Pack status and all previously opened inventories are unchanged.
