const {
  getProfileById,
  json,
  methodNotAllowed,
  requireSession,
} = require('../_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = await requireSession(req, res);
  if (!session) {
    return json(res, 200, {
      user: null,
      profile: null,
    });
  }

  const profile = await getProfileById(session.user.id);
  if (!profile) return json(res, 404, { error: 'Profile not found' });

  return json(res, 200, {
    user: session.user,
    profile,
  });
};
