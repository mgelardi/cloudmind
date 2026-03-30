const {
  extractError,
  findProfileByUsername,
  getProfileById,
  json,
  methodNotAllowed,
  readJsonBody,
  requireSession,
  supabaseFetch,
} = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);

  const session = await requireSession(req, res);
  if (!session) return json(res, 401, { error: 'Not signed in' });

  const { username, isPublic } = await readJsonBody(req);
  if (!username) return json(res, 400, { error: 'username cannot be empty' });

  const existing = await findProfileByUsername(username);
  if (existing && existing.id !== session.user.id) {
    return json(res, 409, { error: 'username already taken' });
  }

  const update = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`, {
    method: 'PATCH',
    serviceRole: true,
    headers: {
      Prefer: 'return=representation',
    },
    body: {
      username,
      is_public: !!isPublic,
    },
  });

  if (!update.ok) return json(res, update.status, { error: extractError(update, 'Could not update profile') });

  const profile = await getProfileById(session.user.id);
  return json(res, 200, { profile });
};
