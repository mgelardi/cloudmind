const {
  extractError,
  findProfileByUsername,
  getRequestQuery,
  json,
  methodNotAllowed,
} = require('../_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const query = getRequestQuery(req);
    const username = (query.get('username') || '').trim();
    if (!username) return json(res, 400, { error: 'username is required' });

    const existing = await findProfileByUsername(username);
    const available = !existing;

    return json(res, 200, { available });
  } catch (error) {
    console.error('profile availability error:', error);
    return json(res, 500, { error: extractError(error, 'Could not check username availability') });
  }
};
