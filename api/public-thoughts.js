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

function buildThoughtsPath(userIds, { tag, status, date }) {
  const filters = [
    `user_id=in.(${userIds.map(id => encodeURIComponent(id)).join(',')})`,
    'select=id,user_id,text,tag,status,date,x,y',
    'order=date.desc',
  ];

  if (tag) filters.push(`tag=ilike.*${encodeURIComponent(tag)}*`);
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (date === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    filters.push(`date=gte.${encodeURIComponent(start.toISOString())}`);
  }

  return `/rest/v1/thoughts?${filters.join('&')}`;
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

  const query = getRequestQuery(req);
  const tag = query.get('tag')?.trim() || '';
  const requestedStatus = query.get('status');
  const status = isValidStatus(requestedStatus) ? requestedStatus : '';
  const rawStatus = query.get('status');
  const date = query.get('date') === 'today' ? 'today' : 'all';
  const limit = Math.min(Math.max(parseInt(query.get('limit') || '18', 10) || 18, 1), 36);

  const profilesResult = await supabaseFetch('/rest/v1/profiles?is_public=eq.true&select=id,username&order=username.asc', {
    serviceRole: true,
  });
  if (!profilesResult.ok) {
    return json(res, profilesResult.status, { error: extractError(profilesResult, 'Could not load public profiles') });
  }

  const profiles = profilesResult.data || [];
  if (!profiles.length) return json(res, 200, { thoughts: [] });

  const usernameById = new Map(profiles.map(profile => [profile.id, profile.username]));
  const thoughtsResult = await supabaseFetch(buildThoughtsPath(profiles.map(profile => profile.id), {
    tag,
    status: rawStatus ? status : '',
    date,
  }), {
    serviceRole: true,
  });

  if (!thoughtsResult.ok) {
    return json(res, thoughtsResult.status, { error: extractError(thoughtsResult, 'Could not load public thoughts') });
  }

  const thoughts = interleaveThoughts(
    (thoughtsResult.data || []).map(thought => ({
      ...thought,
      status: normalizeStatus(thought.status),
      username: usernameById.get(thought.user_id) || 'anonymous',
    })),
    limit,
  );

  return json(res, 200, { thoughts });
};
