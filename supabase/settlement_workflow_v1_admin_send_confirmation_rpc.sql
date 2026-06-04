-- settlement workflow v1 — atomic admin send-for-confirmation (P0 integrity)
-- Apply on staging before app deploy; safe to re-run (CREATE OR REPLACE).
--
-- Ensures settlement cannot reach pending_guide_confirmation without:
--   settlement_confirmations (pending) + active_confirmation_id + optional field_changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_send_for_confirmation(
  p_settlement_id uuid,
  p_from_status public.settlement_status,
  p_actor_id uuid,
  p_actor_role text,
  p_before_snapshot_id uuid,
  p_after_snapshot_id uuid,
  p_after_payload jsonb,
  p_after_calc_summary jsonb,
  p_confirmation_id uuid,
  p_field_changes jsonb,
  p_change_count integer,
  p_admin_note text,
  p_r85_before numeric,
  p_r85_after numeric,
  p_r87_before numeric,
  p_r87_after numeric,
  p_clear_guide_confirmation boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide_submit_snapshot_id uuid;
  v_active_confirmation_id uuid;
  v_rows integer;
  v_now timestamptz := now();
  v_fc jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'actor mismatch';
  END IF;

  IF NOT public.auth_user_is_admin_tier() THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  IF NOT public.auth_user_can_access_settlement(p_settlement_id) THEN
    RAISE EXCEPTION 'settlement access denied';
  END IF;

  IF p_from_status NOT IN (
    'submitted'::public.settlement_status,
    'clarification_requested'::public.settlement_status
  ) THEN
    RAISE EXCEPTION 'invalid from_status %', p_from_status;
  END IF;

  IF p_change_count IS NULL OR p_change_count < 0 THEN
    RAISE EXCEPTION 'invalid change_count';
  END IF;

  IF p_change_count <> COALESCE(jsonb_array_length(p_field_changes), 0) THEN
    RAISE EXCEPTION 'change_count does not match field_changes length';
  END IF;

  SELECT
    s.guide_submit_snapshot_id,
    s.active_confirmation_id
  INTO
    v_guide_submit_snapshot_id,
    v_active_confirmation_id
  FROM public.settlements s
  WHERE s.id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement not found';
  END IF;

  IF v_guide_submit_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'guide_submit_snapshot_id required';
  END IF;

  IF p_before_snapshot_id IS DISTINCT FROM v_guide_submit_snapshot_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.settlement_snapshots snap
       WHERE snap.id = p_before_snapshot_id
         AND snap.settlement_id = p_settlement_id
     ) THEN
    RAISE EXCEPTION 'invalid before snapshot';
  END IF;

  PERFORM 1
  FROM public.settlements s
  WHERE s.id = p_settlement_id
    AND s.status = p_from_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement status is not %', p_from_status;
  END IF;

  IF v_active_confirmation_id IS NOT NULL THEN
    UPDATE public.settlement_confirmations c
    SET status = 'superseded'::public.settlement_confirmation_status
    WHERE c.id = v_active_confirmation_id
      AND c.settlement_id = p_settlement_id
      AND c.status = 'pending'::public.settlement_confirmation_status;
  END IF;

  INSERT INTO public.settlement_snapshots (
    id,
    settlement_id,
    kind,
    payload_json,
    calc_summary_json,
    created_by
  ) VALUES (
    p_after_snapshot_id,
    p_settlement_id,
    'admin_pre_confirm'::public.settlement_snapshot_kind,
    p_after_payload,
    p_after_calc_summary,
    p_actor_id
  );

  INSERT INTO public.settlement_confirmations (
    id,
    settlement_id,
    snapshot_before_id,
    snapshot_after_id,
    status,
    sent_by,
    sent_at,
    r85_before,
    r85_after,
    r87_before,
    r87_after,
    change_count
  ) VALUES (
    p_confirmation_id,
    p_settlement_id,
    p_before_snapshot_id,
    p_after_snapshot_id,
    'pending'::public.settlement_confirmation_status,
    p_actor_id,
    v_now,
    p_r85_before,
    p_r85_after,
    p_r87_before,
    p_r87_after,
    p_change_count
  );

  IF p_change_count > 0 THEN
    FOR v_fc IN SELECT * FROM jsonb_array_elements(p_field_changes)
    LOOP
      INSERT INTO public.settlement_field_changes (
        settlement_id,
        confirmation_id,
        field_path,
        excel_ref,
        label,
        owner,
        old_value_json,
        new_value_json,
        old_display,
        new_display
      ) VALUES (
        p_settlement_id,
        p_confirmation_id,
        v_fc->>'field_path',
        NULLIF(v_fc->>'excel_ref', ''),
        v_fc->>'label',
        (v_fc->>'owner')::public.settlement_field_owner,
        v_fc->'old_value_json',
        v_fc->'new_value_json',
        v_fc->>'old_display',
        v_fc->>'new_display'
      );
    END LOOP;
  END IF;

  UPDATE public.settlements s
  SET
    status = 'pending_guide_confirmation'::public.settlement_status,
    sent_for_confirmation_at = v_now,
    sent_for_confirmation_by = p_actor_id,
    active_confirmation_id = p_confirmation_id,
    admin_note = COALESCE(NULLIF(trim(p_admin_note), ''), s.admin_note),
    reviewed_at = v_now,
    reviewed_by = p_actor_id,
    calc_summary_json = p_after_calc_summary,
    guide_confirmed_at = CASE
      WHEN p_clear_guide_confirmation THEN NULL
      ELSE s.guide_confirmed_at
    END,
    guide_confirmed_by = CASE
      WHEN p_clear_guide_confirmation THEN NULL
      ELSE s.guide_confirmed_by
    END
  WHERE s.id = p_settlement_id
    AND s.status = p_from_status;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'settlement update affected % rows (expected 1)', v_rows;
  END IF;

  INSERT INTO public.settlement_audit_events (
    settlement_id,
    actor_id,
    actor_role,
    action,
    from_status,
    to_status,
    note
  ) VALUES (
    p_settlement_id,
    p_actor_id,
    p_actor_role::public.user_role,
    'send_for_confirmation'::public.settlement_audit_action,
    p_from_status,
    'pending_guide_confirmation'::public.settlement_status,
    CASE
      WHEN p_clear_guide_confirmation THEN 'master_admin_post_confirm_edit'
      ELSE NULLIF(trim(p_admin_note), '')
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'confirmation_id', p_confirmation_id,
    'after_snapshot_id', p_after_snapshot_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_send_for_confirmation(
  uuid,
  public.settlement_status,
  uuid,
  text,
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  jsonb,
  integer,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_send_for_confirmation(
  uuid,
  public.settlement_status,
  uuid,
  text,
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  jsonb,
  integer,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  boolean
) TO authenticated;

COMMIT;
