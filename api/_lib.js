// Shared helpers for the admin-account functions (api/admin-users.js, api/login.js).
// Files starting with "_" are not exposed as endpoints by Vercel.
//
// SECURITY MODEL
//  - The browser never sees SUPABASE_SERVICE_ROLE_KEY. It lives only in the
//    Vercel environment variable of that name and is read here, server-side.
//  - Every request is authenticated by asking Supabase "who owns this access
//    token?" and then looking the person up in user_roles — we never trust
//    anything the browser says about who it is or what it may do.

const SUPABASE_URL = 'https://mmiegwjrzxbyguczcnku.supabase.co';
// The anon key is public (it is in the page source) — only used to ask Supabase who a token belongs to.
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taWVnd2pyenhieWd1Y3pjbmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDc5NjUsImV4cCI6MjA5Nzg4Mzk2NX0.q53UjckFFquySvy46MYm1IXd8TZ4_eI1sbcjVecsV5Q';
// Same constant as the website: this account always has full access.
const OWNER_EMAIL = 'weareaurumgroup@gmail.com';

// Keep in sync with MODULES in index.html. Only these keys can ever be granted.
const MODULE_KEYS = [
  'can_articles', 'can_scores', 'can_partners', 'can_ads', 'can_content', 'can_emissions',
  'can_finance', 'can_accounting', 'can_accounting_entry', 'can_team', 'can_logs',
  'can_announcements', 'can_broadcast', 'can_manager', 'can_maintenance', 'can_manage_accounts',
];
// Only the owner may hand this one out: it decides who can create accounts.
const OWNER_ONLY_KEYS = ['can_manage_accounts'];

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function sb(path, { method = 'GET', key, body, headers = {} } = {}) {
  const k = key || serviceKey();
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

// Who is calling? Returns { email, isOwner, row, perms } or null.
async function getCaller(req) {
  const m = /^Bearer\s+(.+)$/i.exec(String((req.headers && (req.headers.authorization || req.headers.Authorization)) || ''));
  if (!m) return null;
  const who = await sb('/auth/v1/user', { key: SUPABASE_ANON, headers: { Authorization: 'Bearer ' + m[1] } });
  const email = who.ok && who.data && who.data.email ? String(who.data.email).toLowerCase() : '';
  if (!email) return null;
  const isOwner = email === OWNER_EMAIL;
  const r = await sb('/rest/v1/user_roles?select=*&email=eq.' + encodeURIComponent(email) + '&limit=1');
  const row = r.ok && Array.isArray(r.data) ? r.data[0] || null : null;
  const perms = {};
  for (const k of MODULE_KEYS) perms[k] = isOwner || !!(row && row[k]);
  return { email, isOwner, row, perms };
}

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  try { return JSON.parse(String(b || '{}')); } catch { return {}; }
}

module.exports = { SUPABASE_URL, SUPABASE_ANON, OWNER_EMAIL, MODULE_KEYS, OWNER_ONLY_KEYS, serviceKey, sb, getCaller, json, readBody };
