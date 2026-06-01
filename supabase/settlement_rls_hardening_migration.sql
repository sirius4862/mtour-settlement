-- settlement RLS hardening — workflow + guide read redaction + profile role lock
-- Run in Supabase Dashboard → SQL Editor AFTER role_separation_migration.sql
--
-- Fixes:
-- P0-A (C-2): Status-aware settlement/line-item UPDATE; workflow trigger; admin cannot touch approved/paid
-- P0-B (C-1): Guide redacted read views; admin-only SELECT on base tables for sensitive data
-- P1: profiles.role immutable for authenticated clients
--
-- Safe to re-run: idempotent DROP + CREATE. No data changes.
-- Does NOT modify calc formulas or app workflow semantics.

BEGIN;

-- ── Helpers ────────────────────────────────────────────────────────────────

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

CREATE OR REPLACE FUNCTION public.auth_user_is_plain_admin()
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
      AND p.role = 'admin'
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

CREATE OR REPLACE FUNCTION public.auth_user_is_guide()
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
      AND p.role = 'guide'
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

CREATE OR REPLACE FUNCTION public.settlement_guide_owns(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.settlement_allows_guide_content_mutation(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
      AND s.status IN ('draft', 'rejected', 'edit_requested')
  );
$$;

CREATE OR REPLACE FUNCTION public.settlement_allows_guide_workflow_mutation(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
      AND s.status IN ('draft', 'rejected', 'edit_requested', 'pending_guide_confirmation')
  );
$$;

CREATE OR REPLACE FUNCTION public.settlement_allows_admin_operational_mutation(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.status IN ('submitted', 'clarification_requested')
  );
$$;

CREATE OR REPLACE FUNCTION public.settlement_allows_master_content_mutation(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.status IN ('submitted', 'clarification_requested', 'approved')
  );
$$;

CREATE OR REPLACE FUNCTION public.redact_calc_summary_json_for_guide(p_json jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_json IS NULL THEN NULL
    ELSE p_json - 'company_grand_total_usd'
  END;
$$;

CREATE OR REPLACE FUNCTION public.redact_snapshot_payload_for_guide(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result jsonb;
  v_shoppings jsonb := '[]'::jsonb;
  v_elem jsonb;
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_payload ? 'shoppings' AND jsonb_typeof(p_payload->'shoppings') = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_payload->'shoppings')
    LOOP
      v_shoppings := v_shoppings || jsonb_build_array(v_elem - 'kb_usd');
    END LOOP;
  END IF;

  v_result := p_payload
    || jsonb_build_object(
      'header', COALESCE(p_payload->'header', '{}'::jsonb)
        || jsonb_build_object(
          'ground_fee_usd', 0,
          'vehicle_fee_usd', 0,
          'head_tax_usd', 0,
          'seoul_biz_fee_usd', 0,
          'tc_company_usd', 0
        ),
      'company_expenses', '[]'::jsonb,
      'shoppings', CASE WHEN p_payload ? 'shoppings' THEN v_shoppings ELSE p_payload->'shoppings' END,
      'calc_summary', public.redact_calc_summary_json_for_guide(p_payload->'calc_summary')
    );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_guide_hidden_field_change(
  p_field_path text,
  p_excel_ref text,
  p_label text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_field_path = 'calc_summary.company_grand_total_usd'
    OR p_field_path = 'header.ground_fee_usd'
    OR p_field_path LIKE 'company_expenses.%'
    OR p_field_path LIKE '%.kb_usd'
    OR p_excel_ref IN ('R87', 'H72', 'H57')
    OR p_label ILIKE '%회사수익%'
    OR p_label ILIKE '%회사총수익%'
    OR p_label ILIKE '%KB%';
$$;

REVOKE ALL ON FUNCTION public.auth_user_is_admin_tier() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_admin_tier() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_is_plain_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_plain_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_is_master_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_master_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_is_guide() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_guide() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_can_access_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_settlement(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.settlement_guide_owns(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_guide_owns(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.settlement_allows_guide_content_mutation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_allows_guide_content_mutation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.settlement_allows_guide_workflow_mutation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_allows_guide_workflow_mutation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.settlement_allows_admin_operational_mutation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_allows_admin_operational_mutation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.settlement_allows_master_content_mutation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_allows_master_content_mutation(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.redact_calc_summary_json_for_guide(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redact_snapshot_payload_for_guide(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_guide_hidden_field_change(text, text, text) TO authenticated;

-- ── P0-B: Guide redacted read views ────────────────────────────────────────

CREATE OR REPLACE VIEW public.settlements_guide_read
WITH (security_barrier = true) AS
SELECT
  s.id,
  s.tour_id,
  s.guide_id,
  s.branch_id,
  s.status,
  s.year_month,
  s.exchange_rate,
  s.advance_vnd,
  s.tour_fee_usd,
  0::numeric AS ground_fee_usd,
  s.charming_other_usd,
  s.tip_received_usd,
  s.option_receivable_usd,
  s.tip_transfer_usd,
  s.option_credit_usd,
  0::numeric AS vehicle_fee_usd,
  0::numeric AS head_tax_usd,
  0::numeric AS seoul_biz_fee_usd,
  s.tc_guide_usd,
  0::numeric AS tc_company_usd,
  s.megugi_usd,
  s.guide_daily_fee_usd,
  s.settlement_ratio,
  s.guide_note,
  s.admin_note,
  s.reject_reason,
  s.submitted_at,
  s.reviewed_at,
  s.paid_at,
  s.edit_requested_at,
  s.reviewed_by,
  s.edit_requested_by,
  s.sent_for_confirmation_at,
  s.sent_for_confirmation_by,
  s.guide_confirmed_at,
  s.guide_confirmed_by,
  s.clarification_requested_at,
  s.clarification_message,
  s.active_confirmation_id,
  s.guide_submit_snapshot_id,
  public.redact_calc_summary_json_for_guide(s.calc_summary_json) AS calc_summary_json,
  s.created_at,
  s.updated_at
FROM public.settlements s
WHERE s.guide_id = auth.uid();

CREATE OR REPLACE VIEW public.hotel_items_guide_read
WITH (security_barrier = true) AS
SELECT
  hi.id,
  hi.settlement_id,
  hi.hotel_name,
  hi.check_in_date,
  hi.nights,
  hi.sgl_count,
  hi.twn_count,
  hi.trp_count,
  0::numeric AS unit_price_sgl_usd,
  0::numeric AS unit_price_trp_usd,
  0::numeric AS company_amount_usd,
  hi.guide_amount_usd,
  hi.sort_order,
  hi.created_at,
  hi.updated_at
FROM public.hotel_items hi
WHERE public.settlement_guide_owns(hi.settlement_id);

CREATE OR REPLACE VIEW public.shopping_items_guide_read
WITH (security_barrier = true) AS
SELECT
  si.id,
  si.settlement_id,
  si.visit_date,
  si.shop_name,
  si.sale_usd,
  si.com_usd,
  0::numeric AS kb_usd,
  si.sort_order,
  si.created_at,
  si.updated_at
FROM public.shopping_items si
WHERE public.settlement_guide_owns(si.settlement_id);

CREATE OR REPLACE VIEW public.meal_items_guide_read
WITH (security_barrier = true) AS
SELECT m.*
FROM public.meal_items m
WHERE public.settlement_guide_owns(m.settlement_id);

CREATE OR REPLACE VIEW public.entrance_items_guide_read
WITH (security_barrier = true) AS
SELECT e.*
FROM public.entrance_items e
WHERE public.settlement_guide_owns(e.settlement_id);

CREATE OR REPLACE VIEW public.other_expense_items_guide_read
WITH (security_barrier = true) AS
SELECT o.*
FROM public.other_expense_items o
WHERE public.settlement_guide_owns(o.settlement_id);

CREATE OR REPLACE VIEW public.option_items_guide_read
WITH (security_barrier = true) AS
SELECT o.*
FROM public.option_items o
WHERE public.settlement_guide_owns(o.settlement_id);

CREATE OR REPLACE VIEW public.receipts_guide_read
WITH (security_barrier = true) AS
SELECT r.*
FROM public.receipts r
WHERE public.settlement_guide_owns(r.settlement_id);

CREATE OR REPLACE VIEW public.settlement_snapshots_guide_read
WITH (security_barrier = true) AS
SELECT
  ss.id,
  ss.settlement_id,
  ss.kind,
  public.redact_snapshot_payload_for_guide(ss.payload_json) AS payload_json,
  ss.created_by,
  ss.created_at
FROM public.settlement_snapshots ss
WHERE public.settlement_guide_owns(ss.settlement_id);

CREATE OR REPLACE VIEW public.settlement_confirmations_guide_read
WITH (security_barrier = true) AS
SELECT
  sc.id,
  sc.settlement_id,
  sc.snapshot_before_id,
  sc.snapshot_after_id,
  sc.status,
  sc.sent_by,
  sc.sent_at,
  sc.confirmed_by,
  sc.confirmed_at,
  sc.r85_before,
  sc.r85_after,
  NULL::numeric AS r87_before,
  NULL::numeric AS r87_after,
  sc.change_count,
  sc.created_at
FROM public.settlement_confirmations sc
WHERE public.settlement_guide_owns(sc.settlement_id);

CREATE OR REPLACE VIEW public.settlement_field_changes_guide_read
WITH (security_barrier = true) AS
SELECT fc.*
FROM public.settlement_field_changes fc
WHERE public.settlement_guide_owns(fc.settlement_id)
  AND NOT public.is_guide_hidden_field_change(fc.field_path, fc.excel_ref, fc.label);

GRANT SELECT ON public.settlements_guide_read TO authenticated;
GRANT SELECT ON public.hotel_items_guide_read TO authenticated;
GRANT SELECT ON public.shopping_items_guide_read TO authenticated;
GRANT SELECT ON public.meal_items_guide_read TO authenticated;
GRANT SELECT ON public.entrance_items_guide_read TO authenticated;
GRANT SELECT ON public.other_expense_items_guide_read TO authenticated;
GRANT SELECT ON public.option_items_guide_read TO authenticated;
GRANT SELECT ON public.receipts_guide_read TO authenticated;
GRANT SELECT ON public.settlement_snapshots_guide_read TO authenticated;
GRANT SELECT ON public.settlement_confirmations_guide_read TO authenticated;
GRANT SELECT ON public.settlement_field_changes_guide_read TO authenticated;

-- ── P0-A / P1: Workflow + column preservation triggers ─────────────────────

CREATE OR REPLACE FUNCTION public.enforce_settlement_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.paid_at IS NOT DISTINCT FROM NEW.paid_at
     AND OLD.guide_confirmed_at IS NOT DISTINCT FROM NEW.guide_confirmed_at
     AND OLD.guide_confirmed_by IS NOT DISTINCT FROM NEW.guide_confirmed_by
     AND OLD.reviewed_at IS NOT DISTINCT FROM NEW.reviewed_at
     AND OLD.reviewed_by IS NOT DISTINCT FROM NEW.reviewed_by THEN
    RETURN NEW;
  END IF;

  -- Guide workflow transitions
  IF OLD.guide_id = auth.uid()
     AND public.auth_user_is_guide()
     AND NOT public.auth_user_is_admin_tier() THEN

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status IN ('draft', 'rejected', 'edit_requested') AND NEW.status = 'submitted' THEN
        RETURN NEW;
      END IF;
      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status IN ('approved', 'clarification_requested') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Guide settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'Guide cannot modify paid_at';
    END IF;

    IF NEW.guide_confirmed_at IS DISTINCT FROM OLD.guide_confirmed_at
       AND NOT (OLD.status = 'pending_guide_confirmation' AND NEW.status = 'approved') THEN
      RAISE EXCEPTION 'Guide cannot modify guide_confirmed_at outside confirm flow';
    END IF;

    RETURN NEW;
  END IF;

  -- Plain admin — block post-approval workflow fields (RLS should also block)
  IF public.auth_user_is_plain_admin() AND NOT public.auth_user_is_master_admin() THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status IN ('submitted', 'clarification_requested')
         AND NEW.status IN ('rejected', 'edit_requested', 'pending_guide_confirmation', 'submitted', 'clarification_requested') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Admin settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status IN ('approved', 'paid') OR OLD.status IN ('approved', 'paid') THEN
      IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
         OR NEW.guide_confirmed_at IS DISTINCT FROM OLD.guide_confirmed_at
         OR OLD.status IS DISTINCT FROM NEW.status THEN
        RAISE EXCEPTION 'Admin cannot modify approved/paid settlement workflow fields';
      END IF;
    END IF;

    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'Only master admin can mark settlement paid';
    END IF;

    RETURN NEW;
  END IF;

  -- Master admin — pay / reopen / approve allowed (RLS permits all statuses)
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.preserve_guide_settlement_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.guide_id = auth.uid()
     AND public.auth_user_is_guide()
     AND NOT public.auth_user_is_admin_tier() THEN
    NEW.ground_fee_usd := OLD.ground_fee_usd;
    NEW.vehicle_fee_usd := OLD.vehicle_fee_usd;
    NEW.head_tax_usd := OLD.head_tax_usd;
    NEW.seoul_biz_fee_usd := OLD.seoul_biz_fee_usd;
    NEW.tc_company_usd := OLD.tc_company_usd;
    NEW.settlement_ratio := OLD.settlement_ratio;
    NEW.tour_fee_usd := OLD.tour_fee_usd;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.preserve_guide_hotel_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND public.auth_user_is_guide()
     AND NOT public.auth_user_is_admin_tier()
     AND public.settlement_guide_owns(NEW.settlement_id) THEN
    NEW.unit_price_sgl_usd := OLD.unit_price_sgl_usd;
    NEW.unit_price_trp_usd := OLD.unit_price_trp_usd;
    NEW.company_amount_usd := OLD.company_amount_usd;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.preserve_guide_shopping_kb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND public.auth_user_is_guide()
     AND NOT public.auth_user_is_admin_tier()
     AND public.settlement_guide_owns(NEW.settlement_id) THEN
    NEW.kb_usd := OLD.kb_usd;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'profiles.role cannot be changed via client API';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_settlement_workflow ON public.settlements;
CREATE TRIGGER trg_enforce_settlement_workflow
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_settlement_workflow();

DROP TRIGGER IF EXISTS trg_preserve_guide_settlement_admin_columns ON public.settlements;
CREATE TRIGGER trg_preserve_guide_settlement_admin_columns
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_guide_settlement_admin_columns();

DROP TRIGGER IF EXISTS trg_preserve_guide_hotel_admin_columns ON public.hotel_items;
CREATE TRIGGER trg_preserve_guide_hotel_admin_columns
  BEFORE UPDATE ON public.hotel_items
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_guide_hotel_admin_columns();

DROP TRIGGER IF EXISTS trg_preserve_guide_shopping_kb ON public.shopping_items;
CREATE TRIGGER trg_preserve_guide_shopping_kb
  BEFORE UPDATE ON public.shopping_items
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_guide_shopping_kb();

DROP TRIGGER IF EXISTS trg_prevent_profile_role_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_change();

-- ── settlements: split admin ALL → SELECT + role/status-scoped UPDATE ────────

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'settlements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlements', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY settlements_admin_select
  ON public.settlements
  FOR SELECT
  TO authenticated
  USING (public.auth_user_is_admin_tier());

CREATE POLICY settlements_guide_insert
  ON public.settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    guide_id = auth.uid()
    AND status = 'draft'
  );

CREATE POLICY settlements_guide_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    guide_id = auth.uid()
    AND public.settlement_allows_guide_workflow_mutation(id)
  )
  WITH CHECK (
    guide_id = auth.uid()
    AND status NOT IN ('paid')
  );

CREATE POLICY settlements_admin_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_plain_admin()
    AND status IN ('submitted', 'clarification_requested')
  )
  WITH CHECK (
    public.auth_user_is_plain_admin()
    AND status IN (
      'submitted', 'clarification_requested',
      'rejected', 'edit_requested', 'pending_guide_confirmation'
    )
  );

CREATE POLICY settlements_master_admin_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (public.auth_user_is_master_admin())
  WITH CHECK (public.auth_user_is_master_admin());

-- ── profiles + tours ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY profiles_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.auth_user_is_admin_tier());

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tours'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tours', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY tours_select
  ON public.tours
  FOR SELECT
  TO authenticated
  USING (guide_id = auth.uid() OR public.auth_user_is_admin_tier());

CREATE POLICY tours_admin_insert
  ON public.tours
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_is_admin_tier());

CREATE POLICY tours_admin_update
  ON public.tours
  FOR UPDATE
  TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

-- ── Line items + receipts: admin SELECT on base; status-scoped mutations ───

CREATE OR REPLACE FUNCTION public.apply_hardened_settlement_child_rls(p_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol RECORD;
  v_short_name text := replace(p_table::text, 'public.', '');
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = v_short_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol.policyname, p_table);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR SELECT TO authenticated '
    || 'USING (public.auth_user_is_admin_tier() '
    || 'AND public.auth_user_can_access_settlement(settlement_id))',
    v_short_name || '_admin_select',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR INSERT TO authenticated '
    || 'WITH CHECK (public.settlement_allows_guide_content_mutation(settlement_id))',
    v_short_name || '_guide_insert',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR UPDATE TO authenticated '
    || 'USING (public.settlement_allows_guide_content_mutation(settlement_id)) '
    || 'WITH CHECK (public.settlement_allows_guide_content_mutation(settlement_id))',
    v_short_name || '_guide_update',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR DELETE TO authenticated '
    || 'USING (public.settlement_allows_guide_content_mutation(settlement_id))',
    v_short_name || '_guide_delete',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR INSERT TO authenticated '
    || 'WITH CHECK (public.auth_user_is_plain_admin() '
    || 'AND public.settlement_allows_admin_operational_mutation(settlement_id))',
    v_short_name || '_admin_insert',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR UPDATE TO authenticated '
    || 'USING (public.auth_user_is_plain_admin() '
    || 'AND public.settlement_allows_admin_operational_mutation(settlement_id)) '
    || 'WITH CHECK (public.auth_user_is_plain_admin() '
    || 'AND public.settlement_allows_admin_operational_mutation(settlement_id))',
    v_short_name || '_admin_update',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR DELETE TO authenticated '
    || 'USING (public.auth_user_is_plain_admin() '
    || 'AND public.settlement_allows_admin_operational_mutation(settlement_id))',
    v_short_name || '_admin_delete',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR INSERT TO authenticated '
    || 'WITH CHECK (public.auth_user_is_master_admin() '
    || 'AND public.settlement_allows_master_content_mutation(settlement_id))',
    v_short_name || '_master_insert',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR UPDATE TO authenticated '
    || 'USING (public.auth_user_is_master_admin() '
    || 'AND public.settlement_allows_master_content_mutation(settlement_id)) '
    || 'WITH CHECK (public.auth_user_is_master_admin() '
    || 'AND public.settlement_allows_master_content_mutation(settlement_id))',
    v_short_name || '_master_update',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR DELETE TO authenticated '
    || 'USING (public.auth_user_is_master_admin() '
    || 'AND public.settlement_allows_master_content_mutation(settlement_id))',
    v_short_name || '_master_delete',
    p_table
  );
END;
$$;

SELECT public.apply_hardened_settlement_child_rls('public.hotel_items'::regclass);
SELECT public.apply_hardened_settlement_child_rls('public.meal_items'::regclass);
SELECT public.apply_hardened_settlement_child_rls('public.entrance_items'::regclass);
SELECT public.apply_hardened_settlement_child_rls('public.other_expense_items'::regclass);
SELECT public.apply_hardened_settlement_child_rls('public.shopping_items'::regclass);
SELECT public.apply_hardened_settlement_child_rls('public.option_items'::regclass);
SELECT public.apply_hardened_settlement_child_rls('public.receipts'::regclass);

DROP FUNCTION IF EXISTS public.apply_hardened_settlement_child_rls(regclass);

-- company_expense_items: admin tier only
DO $$
DECLARE pol RECORD;
BEGIN
  ALTER TABLE public.company_expense_items ENABLE ROW LEVEL SECURITY;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_expense_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_expense_items', pol.policyname);
  END LOOP;
  CREATE POLICY company_expense_items_admin_access
    ON public.company_expense_items FOR ALL TO authenticated
    USING (public.auth_user_is_admin_tier())
    WITH CHECK (public.auth_user_is_admin_tier());
END $$;

-- ── Audit / confirm tables: admin on base; guides use redacted views ────────

ALTER TABLE public.settlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_field_changes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'settlement_snapshots'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlement_snapshots', pol.policyname); END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'settlement_confirmations'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlement_confirmations', pol.policyname); END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'settlement_field_changes'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlement_field_changes', pol.policyname); END LOOP;
END $$;

CREATE POLICY settlement_snapshots_admin_select
  ON public.settlement_snapshots FOR SELECT TO authenticated
  USING (public.auth_user_is_admin_tier() AND public.auth_user_can_access_settlement(settlement_id));

CREATE POLICY settlement_snapshots_admin_all
  ON public.settlement_snapshots FOR ALL TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

CREATE POLICY settlement_snapshots_guide_insert
  ON public.settlement_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    public.settlement_guide_owns(settlement_id)
    AND created_by = auth.uid()
  );

CREATE POLICY settlement_confirmations_guide_select
  ON public.settlement_confirmations FOR SELECT TO authenticated
  USING (
    public.settlement_guide_owns(settlement_id)
    AND public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
  );

CREATE POLICY settlement_confirmations_admin_select
  ON public.settlement_confirmations FOR SELECT TO authenticated
  USING (public.auth_user_is_admin_tier() AND public.auth_user_can_access_settlement(settlement_id));

CREATE POLICY settlement_confirmations_admin_all
  ON public.settlement_confirmations FOR ALL TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

CREATE POLICY settlement_confirmations_guide_update
  ON public.settlement_confirmations FOR UPDATE TO authenticated
  USING (
    public.auth_user_can_access_settlement(settlement_id)
    AND status = 'pending'
  )
  WITH CHECK (
    public.auth_user_can_access_settlement(settlement_id)
    AND (confirmed_by IS NULL OR confirmed_by = auth.uid())
  );

CREATE POLICY settlement_field_changes_admin_select
  ON public.settlement_field_changes FOR SELECT TO authenticated
  USING (public.auth_user_is_admin_tier() AND public.auth_user_can_access_settlement(settlement_id));

CREATE POLICY settlement_field_changes_admin_insert
  ON public.settlement_field_changes FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_is_admin_tier()
    AND public.auth_user_can_access_settlement(settlement_id)
  );

CREATE POLICY settlement_field_changes_admin_all
  ON public.settlement_field_changes FOR ALL TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

COMMIT;

-- Verification:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('settlements', 'profiles', 'hotel_items')
-- ORDER BY tablename, policyname;
--
-- SELECT table_name FROM information_schema.views
-- WHERE table_schema = 'public' AND table_name LIKE '%_guide_read';
