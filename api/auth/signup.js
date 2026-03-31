const {
  extractError,
  findProfileByUsername,
  getProfileById,
  json,
  methodNotAllowed,
  readJsonBody,
  setSessionCookies,
  supabaseFetch,
} = require('../_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const { email, password, username, isPublic } = await readJsonBody(req);
  if (!email || !password || !username) {
    return json(res, 400, { error: 'Email, password, and username are required' });
  }

  const existing = await findProfileByUsername(username);
  if (existing) return json(res, 409, { error: 'username already taken' });

  const signup = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: { email, password },
  });
  if (!signup.ok) return json(res, signup.status, { error: extractError(signup, 'Could not sign up') });

  const signupUser = signup.data?.user;
  if (!signupUser?.id) {
    return json(res, 500, { error: 'Sign up succeeded but no user was returned' });
  }

  const upsert = await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    serviceRole: true,
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: [{
      id: signupUser.id,
      email,
      username,
      is_public: !!isPublic,
    }],
  });

  if (!upsert.ok) {
    return json(res, upsert.status, { error: extractError(upsert, 'Could not create profile') });
  }

  const signupSession = signup.data?.session;
  if (signupSession?.access_token && signupSession?.refresh_token) {
    setSessionCookies(res, signupSession);
    const profile = await getProfileById(signupUser.id);
    return json(res, 200, {
      user: signupUser,
      profile,
    });
  }

  const login = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });

  if (login.ok && login.data?.user) {
    setSessionCookies(res, login.data);
    const profile = await getProfileById(login.data.user.id);
    return json(res, 200, {
      user: login.data.user,
      profile,
    });
  }

  return json(res, 200, {
    pendingVerification: true,
    message: 'Account created. Please check your email to confirm your account before signing in.',
  });
};
