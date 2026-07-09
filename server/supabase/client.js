const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

function cleanBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getSupabaseConfig() {
  const url = cleanBaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  return {
    url,
    serviceRoleKey,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    enabled: Boolean(url && serviceRoleKey),
  };
}

function getSupabaseStatus() {
  const config = getSupabaseConfig();
  return {
    enabled: config.enabled,
    hasUrl: Boolean(config.url),
    hasServiceRoleKey: Boolean(config.serviceRoleKey),
    hasPublishableKey: Boolean(config.publishableKey),
  };
}

async function supabaseRest(path, options = {}) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message || body?.hint || body?.error || `Supabase ${response.status}`;
    throw new Error(message);
  }

  return body;
}

module.exports = {
  getSupabaseConfig,
  getSupabaseStatus,
  supabaseRest,
};
