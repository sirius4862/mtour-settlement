-- ============================================================================
-- 배정회수 (ASSIGNMENT RECALL) v1 — READ-ONLY schema spot-checks
-- Run in Supabase Production SQL Editor AFTER STEP 1 + STEP 2 migration,
-- and BEFORE deploying app code that references the new columns/enum value.
--
-- Every query below is read-only. Expect the noted PASS criteria before deploy.
-- ============================================================================

-- ── 1. settlement_status enum contains 'recalled' ───────────────────────────
SELECT unnest(enum_range(NULL::public.settlement_status))::text AS status
ORDER BY 1;
-- PASS: a row with status = 'recalled' appears in the list.


-- ── 2. tours.assignment_status / recalled_at / recalled_by columns exist ─────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tours'
  AND column_name IN ('assignment_status', 'recalled_at', 'recalled_by')
ORDER BY column_name;
-- PASS: exactly 3 rows returned.


-- ── 3. tours_select policy excludes recalled tours from guide read ──────────
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tours'
  AND policyname = 'tours_select';
-- PASS: qual contains "assignment_status IS DISTINCT FROM 'recalled'"
--       (guide branch hides recalled; admin tier still sees all).


-- ── 4. settlements_guide_read excludes recalled settlements + recalled tours ─
SELECT pg_get_viewdef('public.settlements_guide_read'::regclass, true) AS view_def;
-- PASS: view_def contains:
--   s.status <> 'recalled'::public.settlement_status
--   AND t.assignment_status = 'recalled'  (inside NOT EXISTS subquery)


-- ── 5. enforce_settlement_workflow() contains draft/submitted → recalled ──────
SELECT pg_get_functiondef('public.enforce_settlement_workflow()'::regprocedure) AS fn_def;
-- PASS: fn_def contains BOTH:
--   OLD.status IN ('draft', 'submitted')
--   AND NEW.status = 'recalled'
--   AND OLD.guide_confirmed_at IS NULL
-- (appears in plain-admin AND master-admin branches)


-- ── 6. C3 paid-lock text/behavior remains present ───────────────────────────
-- Re-use the function definition from query 5:
-- PASS: fn_def still contains:
--   'Cannot modify paid settlement'
--   OLD.status = 'paid'::public.settlement_status
--   AND NEW.status = 'paid'::public.settlement_status
-- PASS: fn_def still contains the two existing 회수 transitions:
--   pending_guide_confirmation ... guide_confirmed_at IS NULL ... submitted
--   edit_requested ... submitted


-- ── 7. settlements_assignment_recall_update policy exists ───────────────────
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'settlements'
  AND policyname = 'settlements_assignment_recall_update';
-- PASS: one row; cmd = UPDATE;
--   qual includes status IN ('draft', 'submitted') and guide_confirmed_at IS NULL
--   with_check includes status = 'recalled'


-- ── 8. Optional: existing settlements_admin_recall policy still present ───────
-- (the prior 회수 feature — must not have been removed by this migration)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'settlements'
  AND policyname IN (
    'settlements_admin_recall',
    'settlements_master_admin_update',
    'settlements_master_reopen_paid'
  )
ORDER BY policyname;
-- PASS: all three policies still exist (assignment recall is additive).
