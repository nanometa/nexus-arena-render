const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NEXUS_SESSION_SECRET =
  process.env.NEXUS_SESSION_SECRET || 'test-only-session-secret-that-is-long-enough';

const { createSecurityMiddleware } = require('./middleware');
const { issueSessionToken } = require('./session');

function makeContext({ path, authorization = '', ip = '127.0.0.90' }) {
  const headers = new Map();
  return {
    method: 'POST',
    path,
    ip,
    request: {},
    get(name) {
      if (String(name).toLowerCase() === 'authorization') return authorization;
      return '';
    },
    set(name, value) {
      headers.set(name, value);
    },
    headers,
  };
}

test('multiplayer create and join endpoints require a wallet session', async () => {
  const middleware = createSecurityMiddleware({ gameName: 'nexus-duel' });
  const createContext = makeContext({ path: '/games/nexus-duel/create' });
  let createReached = false;

  await middleware(createContext, async () => {
    createReached = true;
  });

  assert.equal(createContext.status, 401);
  assert.equal(createReached, false);

  const walletAddress = '0x1111111111111111111111111111111111111111';
  const { token } = issueSessionToken(walletAddress);
  const joinContext = makeContext({
    path: '/games/nexus-duel/example-match/join',
    authorization: `Bearer ${token}`,
    ip: '127.0.0.91',
  });
  let joinReached = false;

  await middleware(joinContext, async () => {
    joinReached = true;
  });

  assert.equal(joinContext.status, undefined);
  assert.equal(joinReached, true);
});
