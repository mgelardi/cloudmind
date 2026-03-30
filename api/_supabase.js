const ACCESS_COOKIE = 'cloudmind-access-token';
const REFRESH_COOKIE = 'cloudmind-refresh-token';

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: 'Method not allowed' });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, chunk) => {
    const [key, ...rest] = chunk.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function cookieBaseParts() {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts;
}

function serializeCookie(name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, ...cookieBaseParts()];
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function setSessionCookies(res, session) {
  const expiresIn = Number(session.expires_in || 3600);
  res.setHeader('Set-Cookie', [
    serializeCookie(ACCESS_COOKIE, session.access_token, expiresIn),
    serializeCookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30),
  ]);
}

function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [
    serializeCookie(ACCESS_COOKIE, '', 0),
    serializeCookie(REFRESH_COOKIE, '', 0),
  ]);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildHeaders({ serviceRole = false, accessToken, extra = {} } = {}) {
  const apikey = serviceRole ? getEnv('SUPABASE_SERVICE_ROLE_KEY') : getEnv('SUPABASE_ANON_KEY');
  const headers = {
    Accept: 'application/json',
    apikey,
    ...extra,
  };
  headers.Authorization = `Bearer ${accessToken || apikey}`;
  return headers;
}

async function supabaseFetch(path, options = {}) {
  const url = `${getEnv('SUPABASE_URL')}${path}`;
  const headers = buildHeaders({
    serviceRole: options.serviceRole,
    accessToken: options.accessToken,
    extra: options.headers,
  });

  const init = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    init.body = headers['Content-Type'] === 'application/json' ? JSON.stringify(options.body) : options.body;
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

async function getUserFromAccessToken(accessToken) {
  const res = await supabaseFetch('/auth/v1/user', { accessToken });
  if (!res.ok) return null;
  return res.data;
}

async function refreshSession(refreshToken) {
  const res = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
  if (!res.ok) return null;
  return res.data;
}

async function requireSession(req, res) {
  const cookies = parseCookies(req);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];

  if (accessToken) {
    const user = await getUserFromAccessToken(accessToken);
    if (user) return { user, accessToken };
  }

  if (refreshToken) {
    const session = await refreshSession(refreshToken);
    if (!session) return null;
    setSessionCookies(res, session);
    const user = await getUserFromAccessToken(session.access_token);
    if (!user) return null;
    return { user, accessToken: session.access_token };
  }

  return null;
}

function getRequestQuery(req) {
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams;
}

async function getProfileById(id) {
  const res = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {
    serviceRole: true,
  });
  if (!res.ok) return null;
  return Array.isArray(res.data) ? res.data[0] || null : res.data;
}

async function findProfileByUsername(username) {
  const res = await supabaseFetch(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,username&limit=1`, {
    serviceRole: true,
  });
  if (!res.ok) return null;
  return Array.isArray(res.data) ? res.data[0] || null : res.data;
}

function extractError(result, fallback) {
  if (!result) return fallback;
  if (result.data?.msg) return result.data.msg;
  if (result.data?.message) return result.data.message;
  if (result.data?.error_description) return result.data.error_description;
  if (result.data?.error) return result.data.error;
  return fallback;
}

module.exports = {
  clearSessionCookies,
  extractError,
  findProfileByUsername,
  getProfileById,
  getRequestQuery,
  json,
  methodNotAllowed,
  readJsonBody,
  requireSession,
  setSessionCookies,
  supabaseFetch,
};
