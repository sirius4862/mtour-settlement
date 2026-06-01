-- Guide submit transition fix — creates guide_submit_settlement RPC.
-- Apply in Supabase SQL Editor (production confirmed RPC absent).
-- Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.guide_submit_settlement(
  p_settlement_id uuid,
  p_snapshot_id uuid,
  p_submitted_at timestamptz,
  p_calc_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.settlement_status;
  v_guide_id uuid;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.auth_user_is_guide() OR public.auth_user_is_admin_tier() THEN
    RAISE EXCEPTION 'guide role required';
  END IF;

  SELECT s.status, s.guide_id
  INTO v_from, v_guide_id
  FROM public.settlements s
  WHERE s.id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement not found';
  END IF;

  IF v_guide_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'settlement not owned by guide';
  END IF;

  IF v_from NOT IN ('draft', 'rejected', 'edit_requested') THEN
    RAISE EXCEPTION 'cannot submit from status %', v_from;
  END IF;

  UPDATE public.settlements
  SET
    status = 'submitted',
    submitted_at = p_submitted_at,
    guide_submit_snapshot_id = p_snapshot_id,
    active_confirmation_id = NULL,
    clarification_requested_at = NULL,
    clarification_message = NULL,
    calc_summary_json = p_calc_summary
  WHERE id = p_settlement_id
    AND guide_id = auth.uid()
    AND status = v_from;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'submit update affected % rows (expected 1)', v_rows;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_status', v_from,
    'to_status', 'submitted',
    'rows_affected', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guide_submit_settlement(uuid, uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guide_submit_settlement(uuid, uuid, timestamptz, jsonb) TO authenticated;

COMMIT;

-- Verification:
-- SELECT pg_get_functiondef('public.guide_submit_settlement(uuid,uuid,timestamp with time zone,jsonb)'::regprocedure);
