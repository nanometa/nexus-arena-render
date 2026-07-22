# Nexus Arena Security

## Security model

Nexus Arena treats the browser as untrusted. Multiplayer moves, turns, captures,
scores, winners, pack ownership, and leaderboard writes are validated by the
server or by the LitVM contract. Client-submitted score and winner values are
never accepted as authoritative.

The production server uses:

- wallet signature login with one-time nonce replay protection;
- short-lived, HMAC-signed wallet sessions;
- match and seat-scoped identity tickets;
- ranked self-play protection requiring two different wallets;
- authenticated matchmaking create and join requests;
- server-authoritative boardgame.io state with undo and redo disabled;
- player views that redact opponent hands, all deck order, and private draws;
- on-chain pack transaction verification when `PACK_CHAIN_STRICT=true`;
- persistent ranked-result idempotency plus an in-process submission lock;
- request rate limits and defensive HTTP response headers.

## Production configuration

Set `NEXUS_SESSION_SECRET` to a cryptographically random value of at least 32
characters. Keep it server-side and never expose it through a `REACT_APP_*`
variable. Also keep `SUPABASE_SERVICE_ROLE_KEY` and all private keys server-side.

Production should use:

```text
NODE_ENV=production
PACK_CHAIN_STRICT=true
NEXUS_SESSION_SECRET=<random 32+ character secret>
```

Rotate secrets immediately if they are ever committed, logged, or shared.

## Reporting a vulnerability

Do not publish an exploit in a public issue. Report it privately through the
repository's GitHub Security Advisory page with reproduction steps and impact.
