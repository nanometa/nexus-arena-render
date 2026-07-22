const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NEXUS_SESSION_SECRET = 'test-only-nexus-session-secret-with-more-than-32-characters';

const {
  consumeLoginNonce,
  issueMatchTicket,
  issueSessionToken,
  verifyMatchTicket,
  verifySessionToken,
} = require('./session');

const WALLET = '0x1111111111111111111111111111111111111111';

test('wallet session tokens reject tampering and expiration', () => {
  const session = issueSessionToken(WALLET, 60);
  assert.equal(verifySessionToken(session.token).walletAddress, WALLET);
  assert.throws(() => verifySessionToken(`${session.token}x`), /invalid/i);

  const expired = issueSessionToken(WALLET, -1);
  assert.throws(() => verifySessionToken(expired.token), /expired|invalid/i);
});

test('match identity tickets are scoped to one match and one seat', () => {
  const ticket = issueMatchTicket({
    walletAddress: WALLET,
    matchID: 'secure_match_123',
    playerID: '0',
    mode: 'matchmaking',
  });

  assert.equal(
    verifyMatchTicket(ticket, {
      walletAddress: WALLET,
      matchID: 'secure_match_123',
      playerID: '0',
      mode: 'matchmaking',
    }).walletAddress,
    WALLET
  );
  assert.throws(
    () => verifyMatchTicket(ticket, { matchID: 'another_match', playerID: '0' }),
    /does not match/i
  );
  assert.throws(
    () => verifyMatchTicket(ticket, { matchID: 'secure_match_123', playerID: '1' }),
    /does not match/i
  );
});

test('a signed login nonce cannot be replayed', () => {
  consumeLoginNonce(WALLET, 'unique-login-nonce-001');
  assert.throws(
    () => consumeLoginNonce(WALLET, 'unique-login-nonce-001'),
    /already used/i
  );
});
