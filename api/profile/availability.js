const {
  findProfileByUsername,
  getRequestQuery,
  json,
  methodNotAllowed,
  requireSession,
} = require('../_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const query = getRequestQuery(req);
  const username = (query.get('username') || '').trim();
  if (!username) return json(res, 400, { error: 'username is required' });

  const session = await requireSession(req, res);
  const existing = await findProfileByUsername(username);
  const available = !existing || (session && existing.id === session.user.id);

  return json(res, 200, { available });
};
