const MATCH_CLAIM_TTL_MS = 6 * 60 * 60 * 1000;

const claims = new Map();

function reserveWalletSeat({ matchID, playerID, walletAddress, now = Date.now() }) {
  for (const [key, claim] of claims) {
    if (claim.expiresAt <= now) claims.delete(key);
  }

  const key = `${matchID}:${walletAddress}`;
  const existing = claims.get(key);
  if (existing && existing.playerID !== String(playerID)) {
    throw Object.assign(new Error('The same wallet cannot occupy both player seats'), {
      status: 403,
    });
  }

  const claim = {
    matchID,
    playerID: String(playerID),
    walletAddress,
    expiresAt: now + MATCH_CLAIM_TTL_MS,
  };
  claims.set(key, claim);
  return claim;
}

module.exports = {
  reserveWalletSeat,
};
