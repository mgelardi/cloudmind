const {
  clearSessionCookies,
  json,
  methodNotAllowed,
} = require('../_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  clearSessionCookies(res);
  return json(res, 200, { ok: true });
};
