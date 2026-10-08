// POST /api/admin-users — create a team login (username + password) with a role,
// or reset a team member's password. Called from Admin → Équipe.
//
// Who may call it: the owner, and team members who were given the
// "Créer des comptes admin" permission (can_manage_accounts).
// What they may grant: only permissions they hold themselves (the owner: any),
// and never can_manage_accounts unless they are the owner — so access can't
// escalate by creating accounts.

const { OWNER_EMAIL, MODULE_KEYS, OWNER_ONLY_KEYS, serviceKey, sb, getCaller, json, readBody } = require('./_lib');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

function checkPassword(pw, username, email) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Mot de passe : 8 caractères minimum.';
  if (pw.length > 72) return 'Mot de passe trop long (72 caractères maximum).';
  const low = pw.toLowerCase();
  if (low === String(username || '').toLowerCase() || low === String(email || '').toLowerCase()) return 'Le mot de passe ne doit pas être identique à l\'identifiant.';
  return '';
}

async function logAction(adminEmail, action, details) {
  try { await sb('/rest/v1/admin_logs', { method: 'POST', body: { admin_email: adminEmail, action, details }, headers: { Prefer: 'return=minimal' } }); } catch { /* best effort */ }
}

async function findAuthUserId(email) {
  for (let page = 1; page <= 20; page++) {
    const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = r.ok && r.data && Array.isArray(r.data.users) ? r.data.users : [];
    const hit = users.find(u => String(u.email || '').toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Méthode non autorisée.' }); }
  if (!serviceKey()) return json(res, 503, { error: 'Création de comptes non configurée (clé serveur manquante sur Vercel).' });

  let caller;
  try { caller = await getCaller(req); } catch { return json(res, 502, { error: 'Vérification impossible, réessayez.' }); }
  if (!caller) return json(res, 401, { error: 'Session expirée — reconnectez-vous.' });
  if (!caller.perms.can_manage_accounts) return json(res, 403, { error: 'Vous n\'avez pas la permission de gérer les comptes.' });

  const body = readBody(req);
  const action = String(body.action || '');

  try {
    // ------------------------------------------------------------ create
    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const username = String(body.username || '').trim().toLowerCase();
      const name = String(body.name || '').trim().slice(0, 100) || null;
      const jobTitle = String(body.job_title || '').trim().slice(0, 100) || null;
      const password = body.password;

      if (!EMAIL_RE.test(email) || email.length > 150) return json(res, 400, { error: 'E-mail invalide.' });
      if (!USERNAME_RE.test(username)) return json(res, 400, { error: 'Nom d\'utilisateur : 3 à 30 caractères (lettres minuscules, chiffres, . _ -).' });
      const pwErr = checkPassword(password, username, email);
      if (pwErr) return json(res, 400, { error: pwErr });

      // Permissions: whitelist, and never more than the creator has.
      const requested = body.perms && typeof body.perms === 'object' ? body.perms : {};
      const granted = {};
      for (const k of Object.keys(requested)) {
        if (!requested[k]) continue;
        if (!MODULE_KEYS.includes(k)) return json(res, 400, { error: 'Permission inconnue : ' + k });
        if (OWNER_ONLY_KEYS.includes(k) && !caller.isOwner) return json(res, 403, { error: 'Seul le propriétaire peut donner le droit de créer des comptes.' });
        if (!caller.perms[k]) return json(res, 403, { error: 'Vous ne pouvez pas donner une permission que vous n\'avez pas vous-même.' });
        granted[k] = true;
      }

      if (email === OWNER_EMAIL) return json(res, 409, { error: 'Cet e-mail est réservé.' });
      const dupe = await sb(`/rest/v1/user_roles?select=email,username&or=(email.eq.${encodeURIComponent(email)},username.eq.${encodeURIComponent(username)})&limit=2`);
      if (dupe.ok && Array.isArray(dupe.data) && dupe.data.length) {
        const sameUser = dupe.data.some(r => r.username === username);
        return json(res, 409, { error: sameUser ? 'Ce nom d\'utilisateur est déjà pris.' : 'Cet e-mail a déjà un compte.' });
      }

      const created = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true, user_metadata: { name } } });
      if (!created.ok || !created.data || !created.data.id) {
        const msg = JSON.stringify(created.data || '');
        if (created.status === 422 && /registered|exists/i.test(msg)) return json(res, 409, { error: 'Cet e-mail a déjà un compte de connexion.' });
        return json(res, 502, { error: 'Création du compte refusée par le service d\'authentification.' });
      }
      const authId = created.data.id;

      const roleRow = { email, name, job_title: jobTitle, username, ...granted };
      const saved = await sb('/rest/v1/user_roles?on_conflict=email', { method: 'POST', body: roleRow, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      if (!saved.ok) {
        await sb('/auth/v1/admin/users/' + authId, { method: 'DELETE' });   // roll back: no half-created account
        return json(res, 500, { error: 'Enregistrement du rôle impossible — compte annulé, réessayez.' });
      }

      await logAction(caller.email, 'Compte admin créé', `${email} (${username}) — ${Object.keys(granted).join(', ') || 'aucun accès'}`);
      return json(res, 200, { ok: true, email, username });
    }

    // ------------------------------------------------------ reset_password
    if (action === 'reset_password') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = body.password;
      if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'E-mail invalide.' });
      if (email === OWNER_EMAIL && !caller.isOwner) return json(res, 403, { error: 'Le compte propriétaire ne peut pas être modifié ici.' });

      const target = await sb('/rest/v1/user_roles?select=*&email=eq.' + encodeURIComponent(email) + '&limit=1');
      const row = target.ok && Array.isArray(target.data) ? target.data[0] : null;
      if (!row && email !== OWNER_EMAIL) return json(res, 404, { error: 'Membre introuvable.' });
      if (row && row.can_manage_accounts && !caller.isOwner && email !== caller.email) return json(res, 403, { error: 'Seul le propriétaire peut modifier ce compte.' });
      const pwErr = checkPassword(password, row && row.username, email);
      if (pwErr) return json(res, 400, { error: pwErr });

      const id = await findAuthUserId(email);
      if (!id) return json(res, 404, { error: 'Aucun compte de connexion pour cet e-mail.' });
      const upd = await sb('/auth/v1/admin/users/' + id, { method: 'PUT', body: { password } });
      if (!upd.ok) return json(res, 502, { error: 'Changement de mot de passe refusé.' });

      await logAction(caller.email, 'Mot de passe réinitialisé', email);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Action inconnue.' });
  } catch (e) {
    return json(res, 500, { error: 'Erreur serveur, réessayez.' });
  }
};
