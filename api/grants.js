const {
  extractError,
  getRequestQuery,
  json,
  methodNotAllowed,
  readJsonBody,
  requireSession,
  supabaseFetch,
} = require('./_supabase');

module.exports = async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return json(res, 401, { error: 'Not signed in' });

  if (req.method === 'GET') {
    const result = await supabaseFetch(`/rest/v1/access_grants?owner_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=id.desc`, {
      serviceRole: true,
    });
    if (!result.ok) return json(res, result.status, { error: extractError(result, 'Could not load grants') });
    return json(res, 200, { grants: result.data || [] });
  }

  if (req.method === 'POST') {
    const { email } = await readJsonBody(req);
    if (!email) return json(res, 400, { error: 'Email is required' });

    const result = await supabaseFetch('/rest/v1/access_grants', {
      method: 'POST',
      serviceRole: true,
      headers: {
        Prefer: 'return=representation',
      },
      body: [{ owner_id: session.user.id, grantee_email: email }],
    });

    if (!result.ok) return json(res, result.status, { error: extractError(result, 'Could not save grant') });
    return json(res, 200, { grant: Array.isArray(result.data) ? result.data[0] : result.data });
  }

  if (req.method === 'DELETE') {
    const query = getRequestQuery(req);
    const id = query.get('id');
    if (!id) return json(res, 400, { error: 'Grant id is required' });

    const result = await supabaseFetch(`/rest/v1/access_grants?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
      method: 'DELETE',
      serviceRole: true,
      headers: {
        Prefer: 'return=representation',
      },
    });

    if (!result.ok) return json(res, result.status, { error: extractError(result, 'Could not delete grant') });
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
};
