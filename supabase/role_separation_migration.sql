-- Role separation — P0
-- Run in Supabase Dashboard → SQL Editor (local + production)
--
-- Option A: staff → admin; master_admin assigned manually after migration.
-- Safe to re-run: no DROP COLUMN, no DELETE/TRUNCATE on business data.

BEGIN;

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'master_admin';

UPDATE public.profiles
SET role = 'admin'
WHERE role = 'staff';

-- ── Shared RLS helpers (admin tier = admin | master_admin) ─────────────────

CREATE OR REPLACE FUNCTION public.auth_user_is_admin_tier()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'master_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'master_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_can_access_settlement(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_is_admin_tier()
  OR EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_is_admin_tier() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_admin_tier() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_is_master_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_master_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_can_access_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_settlement(uuid) TO authenticated;

-- Drop legacy helper name if present from line-items migration
DROP FUNCTION IF EXISTS public.auth_user_is_admin_staff();

COMMIT;

-- Manual step after migration:
-- UPDATE public.profiles SET role = 'master_admin' WHERE email IN ('finance@example.com');
