const {
  ensureProfileForUser,
  extractError,
  json,
  methodNotAllowed,
  readJsonBody,
  setSessionCookies,
  supabaseFetch,
} = require('../_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const { email, password } = await readJsonBody(req);
  if (!email || !password) return json(res, 400, { error: 'Email and password are required' });

  const login = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });

  if (!login.ok) return json(res, login.status, { error: extractError(login, 'Could not sign in') });

  setSessionCookies(res, login.data);
  const profile = await ensureProfileForUser(login.data.user);

  return json(res, 200, {
    user: login.data.user,
    profile,
  });
};
