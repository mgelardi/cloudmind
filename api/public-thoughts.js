const {
  extractError,
  getRequestQuery,
  json,
  methodNotAllowed,
  supabaseFetch,
} = require('./_supabase');

function normalizeStatus(status) {
  return ['positive', 'neutral', 'negative'].includes(status) ? status : 'neutral';
}

function isValidStatus(status) {
  return ['positive', 'neutral', 'negative'].includes(status);
}

function isToday(iso) {
  const date = new Date(iso);
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear()
    && date.getUTCMonth() === now.getUTCMonth()
    && date.getUTCDate() === now.getUTCDate();
}

function interleaveThoughts(thoughts, limit) {
  const groups = new Map();

  thoughts.forEach(thought => {
    if (!groups.has(thought.user_id)) groups.set(thought.user_id, []);
    groups.get(thought.user_id).push(thought);
  });

  const mixed = [];
  let hasItems = true;

  while (hasItems && mixed.length < limit) {
    hasItems = false;
    groups.forEach(queue => {
      if (!queue.length || mixed.length >= limit) return;
      mixed.push(queue.shift());
      hasItems = true;
    });
  }

  return mixed;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const query = getRequestQuery(req);
    const tag = query.get('tag')?.trim().toLowerCase() || '';
    const requestedStatus = query.get('status');
    const status = isValidStatus(requestedStatus) ? requestedStatus : '';
    const date = query.get('date') === 'today' ? 'today' : 'all';
    const limit = Math.min(Math.max(parseInt(query.get('limit') || '18', 10) || 18, 1), 36);

    const profilesResult = await supabaseFetch('/rest/v1/profiles?is_public=eq.true&select=id,username&order=username.asc', {
      serviceRole: true,
    });
    if (!profilesResult.ok) {
      return json(res, profilesResult.status, { error: extractError(profilesResult, 'Could not load public profiles') });
    }

    const profiles = Array.isArray(profilesResult.data) ? profilesResult.data : [];
    if (!profiles.length) return json(res, 200, { thoughts: [] });

    const usernameById = new Map(profiles.map(profile => [profile.id, profile.username]));
    const thoughtsResult = await supabaseFetch('/rest/v1/thoughts?select=id,user_id,text,tag,status,date,x,y&order=date.desc&limit=250', {
      serviceRole: true,
    });
    if (!thoughtsResult.ok) {
      return json(res, thoughtsResult.status, { error: extractError(thoughtsResult, 'Could not load public thoughts') });
    }

    const filtered = (Array.isArray(thoughtsResult.data) ? thoughtsResult.data : [])
      .filter(thought => usernameById.has(thought.user_id))
      .map(thought => ({
        ...thought,
        status: normalizeStatus(thought.status),
        username: usernameById.get(thought.user_id) || 'anonymous',
      }))
      .filter(thought => !tag || String(thought.tag || '').toLowerCase().includes(tag))
      .filter(thought => !status || thought.status === status)
      .filter(thought => date !== 'today' || isToday(thought.date));

    return json(res, 200, { thoughts: interleaveThoughts(filtered, limit) });
  } catch (error) {
    console.error('public thoughts error:', error);
    return json(res, 500, { error: extractError(error, 'Could not load public thoughts') });
  }
};
