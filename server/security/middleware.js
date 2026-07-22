const { requireSession } = require('./session');

const buckets = new Map();

function clientKey(ctx) {
  const forwarded = String(ctx.get('x-forwarded-for') || '').split(',')[0].trim();
  return String(forwarded || ctx.ip || ctx.request?.ip || ctx.req?.socket?.remoteAddress || 'unknown');
}

function rateRule(ctx, gameName) {
  if (ctx.path === '/api/player/session') return { id: 'login', limit: 12, windowMs: 5 * 60 * 1000 };
  if (ctx.path === '/api/player/match-ticket') return { id: 'ticket', limit: 80, windowMs: 5 * 60 * 1000 };
  if (ctx.path === '/api/packs/register-mint' || ctx.path === '/api/packs/open') {
    return { id: 'pack-write', limit: 20, windowMs: 5 * 60 * 1000 };
  }
  if (ctx.path === `/games/${gameName}/create`) {
    return { id: 'match-create', limit: 20, windowMs: 10 * 60 * 1000 };
  }
  if (ctx.path.startsWith(`/games/${gameName}/`) && ctx.path.endsWith('/join')) {
    return { id: 'match-join', limit: 60, windowMs: 10 * 60 * 1000 };
  }
  return { id: 'global', limit: 360, windowMs: 60 * 1000 };
}

function enforceRateLimit(ctx, gameName, now = Date.now()) {
  const rule = rateRule(ctx, gameName);
  const key = `${clientKey(ctx)}:${rule.id}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  const remaining = Math.max(0, rule.limit - bucket.count);
  ctx.set('X-RateLimit-Limit', String(rule.limit));
  ctx.set('X-RateLimit-Remaining', String(remaining));
  ctx.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count > rule.limit) {
    ctx.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    ctx.status = 429;
    ctx.body = { error: 'Too many requests. Try again shortly.' };
    return false;
  }
  return true;
}

function isProtectedLobbyMutation(ctx, gameName) {
  if (ctx.method !== 'POST') return false;
  return (
    ctx.path === `/games/${gameName}/create` ||
    (ctx.path.startsWith(`/games/${gameName}/`) && ctx.path.endsWith('/join'))
  );
}

function createSecurityMiddleware({ gameName }) {
  return async function nexusSecurity(ctx, next) {
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('Referrer-Policy', 'same-origin');
    ctx.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (!enforceRateLimit(ctx, gameName)) return;

    if (isProtectedLobbyMutation(ctx, gameName)) {
      try {
        requireSession(ctx);
      } catch (error) {
        ctx.status = error.status || 401;
        ctx.body = { error: error.message || 'Wallet session required' };
        return;
      }
    }

    await next();
  };
}

module.exports = {
  createSecurityMiddleware,
  enforceRateLimit,
};
