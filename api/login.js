// POST /api/login — sign in to the admin panel with a USERNAME + password.
//
// Why this exists: the login form used to look the username up in user_roles
// straight from the browser, but that table is (rightly) not readable by
// anonymous visitors, so username login returned nothing for everyone. Doing
// the lookup here keeps user_roles private AND never reveals anyone's e-mail
// address — the browser only ever gets a session back, or one generic error.
// (Signing in with an e-mail address still works directly in the browser.)

const { SUPABASE_URL, SUPABASE_ANON, serviceKey, sb, json, readBody } = require('./_lib');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Méthode non autorisée.' }); }
  if (!serviceKey()) return json(res, 503, { error: 'Connexion par nom d\'utilisateur non configurée — utilisez votre e-mail.' });

  const body = readBody(req);
  const identifier = String(body.identifier || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const fail = async () => { await sleep(500); return json(res, 401, { error: 'Identifiants incorrects' }); };  // same answer for "no such user" and "wrong password"

  if (!identifier || !password || password.length > 200 || identifier.length > 150) return fail();

  let email = identifier;
  if (!identifier.includes('@')) {
    if (!USERNAME_RE.test(identifier)) return fail();
    const r = await sb('/rest/v1/user_roles?select=email&username=eq.' + encodeURIComponent(identifier) + '&limit=1');
    email = r.ok && Array.isArray(r.data) && r.data[0] ? String(r.data[0].email).toLowerCase() : '';
    if (!email) return fail();
  }

  const t = await sb('/auth/v1/token?grant_type=password', { method: 'POST', key: SUPABASE_ANON, body: { email, password } });
  if (!t.ok || !t.data || !t.data.access_token) return fail();

  return json(res, 200, { access_token: t.data.access_token, refresh_token: t.data.refresh_token });
};
