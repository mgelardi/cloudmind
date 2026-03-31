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
    const result = await supabaseFetch(`/rest/v1/thoughts?user_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=date.desc`, {
      serviceRole: true,
    });
    if (!result.ok) return json(res, result.status, { error: extractError(result, 'Could not load thoughts') });
    return json(res, 200, { thoughts: result.data || [] });
  }

  if (req.method === 'POST') {
    const { text, tag, status, date, x, y } = await readJsonBody(req);
    if (!text) return json(res, 400, { error: 'Thought text is required' });

    const normalizedStatus = ['positive', 'neutral', 'negative'].includes(status) ? status : 'neutral';

    const result = await supabaseFetch('/rest/v1/thoughts', {
      method: 'POST',
      serviceRole: true,
      headers: {
        Prefer: 'return=representation',
      },
      body: [{
        user_id: session.user.id,
        text,
        tag: tag || 'thought',
        status: normalizedStatus,
        date,
        x,
        y,
      }],
    });

    if (!result.ok) return json(res, result.status, { error: extractError(result, 'Could not save thought') });
    return json(res, 200, { thought: Array.isArray(result.data) ? result.data[0] : result.data });
  }

  if (req.method === 'PATCH') {
    const query = getRequestQuery(req);
    const id = query.get('id');
    if (!id) return json(res, 400, { error: 'Thought id is required' });

    const { x, y } = await readJsonBody(req);
    const result = await supabaseFetch(`/rest/v1/thoughts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(session.user.id)}`, {
      method: 'PATCH',
      serviceRole: true,
      headers: {
        Prefer: 'return=representation',
      },
      body: { x, y },
    });

    if (!result.ok) return json(res, result.status, { error: extractError(result, 'Could not update thought') });
    return json(res, 200, { thought: Array.isArray(result.data) ? result.data[0] : result.data });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
};
