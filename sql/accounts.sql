-- SportFM — admin accounts: database changes
-- Run ONCE in the Supabase SQL editor (sportfm project). Safe to re-run.

-- 1) Permission columns. "can_maintenance" was missing from the Maintenance & Achats
--    release — without it, ticking that permission for a team member fails.
--    "can_manage_accounts" is the new "Créer des comptes admin" permission.
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS can_maintenance boolean NOT NULL DEFAULT false;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS can_manage_accounts boolean NOT NULL DEFAULT false;

-- 2) Guard: only the owner may switch "can_manage_accounts" on or off.
--    The website already hides that checkbox from everyone else, but anyone with
--    a login could still try to write it straight to the database; this trigger
--    makes the rule real. The account-creation server function (service role)
--    and the SQL editor are not affected.
CREATE OR REPLACE FUNCTION public.guard_manage_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user IN ('postgres', 'supabase_admin') THEN RETURN NEW; END IF;      -- SQL editor / dashboard
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;                        -- our server function (it enforces its own rules)
  IF lower(coalesce(auth.jwt() ->> 'email', '')) = 'weareaurumgroup@gmail.com' THEN RETURN NEW; END IF;   -- owner
  IF TG_OP = 'INSERT' AND coalesce(NEW.can_manage_accounts, false) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut donner le droit de créer des comptes';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.can_manage_accounts IS DISTINCT FROM OLD.can_manage_accounts THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier le droit de créer des comptes';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_manage_accounts ON user_roles;
CREATE TRIGGER guard_manage_accounts BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_manage_accounts();

-- Check: both columns should be listed, and the trigger should exist.
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'user_roles' AND column_name IN ('can_maintenance', 'can_manage_accounts');
SELECT tgname FROM pg_trigger WHERE tgname = 'guard_manage_accounts';
