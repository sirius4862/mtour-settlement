-- ============================================================================
-- 배정회수 (ASSIGNMENT RECALL) v1.1 — tour recall eligibility guard
-- Run in Supabase Dashboard → SQL Editor on PRODUCTION after v1 STEP 1 + STEP 2.
--
-- Closes a gap where tours_admin_update allowed any admin-tier UPDATE, so
-- assignment_status could become 'recalled' even when linked settlements were
-- ineligible (edit_requested, pending_guide_confirmation, paid, guide-confirmed).
--
-- Settlements were already guarded by enforce_settlement_workflow() + RLS;
-- this adds the symmetric BEFORE UPDATE trigger on public.tours.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_tour_assignment_recall()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Only gate the transition into 'recalled'
  IF OLD.assignment_status IS NOT DISTINCT FROM NEW.assignment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.assignment_status = 'recalled' THEN
    IF NOT public.auth_user_is_admin_tier() THEN
      RAISE EXCEPTION 'Tour assignment recall requires admin tier';
    END IF;

    -- Mirror recallTourAssignment: linked settlement for this tour + assigned guide
    IF EXISTS (
      SELECT 1
      FROM public.settlements s
      WHERE s.tour_id = NEW.id
        AND s.guide_id = NEW.guide_id
        AND (
          s.guide_confirmed_at IS NOT NULL
          OR s.status NOT IN (
            'draft'::public.settlement_status,
            'submitted'::public.settlement_status
          )
        )
    ) THEN
      RAISE EXCEPTION 'Tour assignment recall not allowed: linked settlement is not eligible';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tour_assignment_recall ON public.tours;
CREATE TRIGGER trg_enforce_tour_assignment_recall
  BEFORE UPDATE ON public.tours
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tour_assignment_recall();

COMMIT;
