-- hotel_items RLS — admin/staff save fix
-- Run in Supabase Dashboard → SQL Editor (local + production)
--
-- Symptom: "new row violates row-level security policy for table hotel_items"
--          when admin saves hotel rows during review.
--
-- Requires auth_user_can_access_settlement() from
-- settlement_status_logs_rls_migration.sql (safe to re-run).

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_user_can_access_settlement(p_settlement_id uuid)
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
  )
  OR EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_can_access_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_settlement(uuid) TO authenticated;

ALTER TABLE public.hotel_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hotel_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.hotel_items', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY hotel_items_settlement_access
  ON public.hotel_items
  FOR ALL
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id))
  WITH CHECK (public.auth_user_can_access_settlement(settlement_id));

COMMIT;
