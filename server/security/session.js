const crypto = require('crypto');

const TOKEN_ISSUER = 'nexus-arena';
const TOKEN_VERSION = 1;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MATCH_TICKET_TTL_SECONDS = 6 * 60 * 60;

let developmentSecret;
const consumedLoginNonces = new Map();

function getSecret() {
  const configured =
    process.env.NEXUS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (configured.length >= 32) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXUS_SESSION_SECRET must contain at least 32 characters');
  }

  if (!developmentSecret) developmentSecret = crypto.randomBytes(48).toString('hex');
  return developmentSecret;
}

function encodeJSON(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeJSON(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signatureFor(encodedPayload) {
  return crypto.createHmac('sha256', getSecret()).update(encodedPayload).digest('base64url');
}

function signToken(payload) {
  const encodedPayload = encodeJSON({
    iss: TOKEN_ISSUER,
    v: TOKEN_VERSION,
    ...payload,
  });
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

function verifyToken(token, expectedType) {
  const [encodedPayload, suppliedSignature, extra] = String(token || '').split('.');
  if (!encodedPayload || !suppliedSignature || extra) throw unauthorized('Invalid security token');

  const expectedSignature = signatureFor(encodedPayload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw unauthorized('Invalid security token');
  }

  let payload;
  try {
    payload = decodeJSON(encodedPayload);
  } catch (error) {
    throw unauthorized('Invalid security token');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.iss !== TOKEN_ISSUER ||
    payload.v !== TOKEN_VERSION ||
    payload.typ !== expectedType ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= now
  ) {
    throw unauthorized('Security token expired or invalid');
  }
  return payload;
}

function unauthorized(message) {
  return Object.assign(new Error(message), { status: 401 });
}

function issueSessionToken(walletAddress, ttlSeconds = SESSION_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;
  return {
    token: signToken({
      typ: 'session',
      sub: walletAddress,
      iat: now,
      exp: expiresAt,
      jti: crypto.randomBytes(16).toString('hex'),
    }),
    expiresAt,
  };
}

function verifySessionToken(token) {
  const payload = verifyToken(token, 'session');
  if (!/^0x[a-f0-9]{40}$/.test(payload.sub || '')) throw unauthorized('Invalid wallet session');
  return { ...payload, walletAddress: payload.sub };
}

function bearerTokenFromContext(ctx) {
  const header = String(ctx.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function requireSession(ctx) {
  const token = bearerTokenFromContext(ctx);
  if (!token) throw unauthorized('Wallet session required');
  return verifySessionToken(token);
}

function issueMatchTicket({ walletAddress, matchID, playerID, mode }) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    typ: 'match',
    sub: walletAddress,
    matchID,
    playerID: String(playerID),
    mode,
    iat: now,
    exp: now + MATCH_TICKET_TTL_SECONDS,
  });
}

function verifyMatchTicket(token, expected = {}) {
  const payload = verifyToken(token, 'match');
  const checks = [
    ['matchID', expected.matchID],
    ['playerID', expected.playerID === undefined ? undefined : String(expected.playerID)],
    ['mode', expected.mode],
    ['sub', expected.walletAddress],
  ];
  for (const [field, value] of checks) {
    if (value !== undefined && payload[field] !== value) {
      throw unauthorized('Match identity ticket does not match this seat');
    }
  }
  return { ...payload, walletAddress: payload.sub };
}

function consumeLoginNonce(walletAddress, nonce, now = Date.now()) {
  const cleanNonce = String(nonce || '').trim();
  if (cleanNonce.length < 8 || cleanNonce.length > 128) {
    throw unauthorized('Signed login nonce is missing or invalid');
  }

  for (const [key, expiresAt] of consumedLoginNonces) {
    if (expiresAt <= now) consumedLoginNonces.delete(key);
  }

  const key = `${walletAddress}:${cleanNonce}`;
  if (consumedLoginNonces.has(key)) throw unauthorized('Signed login message was already used');
  consumedLoginNonces.set(key, now + 15 * 60 * 1000);
}

module.exports = {
  bearerTokenFromContext,
  consumeLoginNonce,
  issueMatchTicket,
  issueSessionToken,
  requireSession,
  signToken,
  verifyMatchTicket,
  verifySessionToken,
};
