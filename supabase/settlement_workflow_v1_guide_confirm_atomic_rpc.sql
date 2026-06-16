-- Guide final confirmation — atomic settlement flags + confirmation packet (Option C Phase 1)
-- Apply on staging before app deploy; safe to re-run (CREATE OR REPLACE).
--
-- Extends guide_confirm_settlement so guide_confirmed_at/by and
-- settlement_confirmations.status = 'confirmed' commit in one transaction.
-- Guide_confirmed snapshot + audit event remain app-side for this phase.

BEGIN;

CREATE OR REPLACE FUNCTION public.guide_confirm_settlement(
  p_settlement_id uuid,
  p_confirmed_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide_id uuid;
  v_status public.settlement_status;
  v_paid_at timestamptz;
  v_active_confirmation_id uuid;
  v_guide_confirmed_at timestamptz;
  v_confirmation_status public.settlement_confirmation_status;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.auth_user_is_guide() OR public.auth_user_is_admin_tier() THEN
    RAISE EXCEPTION 'guide role required';
  END IF;

  SELECT
    s.guide_id,
    s.status,
    s.paid_at,
    s.active_confirmation_id,
    s.guide_confirmed_at
  INTO
    v_guide_id,
    v_status,
    v_paid_at,
    v_active_confirmation_id,
    v_guide_confirmed_at
  FROM public.settlements s
  WHERE s.id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement not found';
  END IF;

  IF v_guide_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'settlement not owned by guide';
  END IF;

  IF v_status <> 'pending_guide_confirmation'::public.settlement_status THEN
    RAISE EXCEPTION 'cannot confirm from status %', v_status;
  END IF;

  IF v_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'cannot confirm paid settlement';
  END IF;

  IF v_active_confirmation_id IS NULL THEN
    RAISE EXCEPTION 'active_confirmation_id required';
  END IF;

  IF v_guide_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'guide confirmation already recorded';
  END IF;

  SELECT c.status
  INTO v_confirmation_status
  FROM public.settlement_confirmations c
  WHERE c.id = v_active_confirmation_id
    AND c.settlement_id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active confirmation packet not found';
  END IF;

  IF v_confirmation_status <> 'pending'::public.settlement_confirmation_status THEN
    RAISE EXCEPTION 'confirmation packet is not pending';
  END IF;

  UPDATE public.settlements
  SET
    guide_confirmed_at = p_confirmed_at,
    guide_confirmed_by = auth.uid()
  WHERE id = p_settlement_id
    AND guide_id = auth.uid()
    AND status = 'pending_guide_confirmation'::public.settlement_status
    AND guide_confirmed_at IS NULL
    AND paid_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'settlement confirm update affected % rows (expected 1)', v_rows;
  END IF;

  UPDATE public.settlement_confirmations
  SET
    status = 'confirmed'::public.settlement_confirmation_status,
    confirmed_by = auth.uid(),
    confirmed_at = p_confirmed_at
  WHERE id = v_active_confirmation_id
    AND settlement_id = p_settlement_id
    AND status = 'pending'::public.settlement_confirmation_status;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'confirmation packet update affected % rows (expected 1)', v_rows;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'settlement_id', p_settlement_id,
    'status', 'pending_guide_confirmation',
    'guide_confirmed_at', p_confirmed_at,
    'confirmation_id', v_active_confirmation_id,
    'confirmation_status', 'confirmed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guide_confirm_settlement(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guide_confirm_settlement(uuid, timestamptz) TO authenticated;

COMMIT;

-- Verification (read-only):
-- SELECT pg_get_functiondef('public.guide_confirm_settlement(uuid,timestamp with time zone)'::regprocedure);
