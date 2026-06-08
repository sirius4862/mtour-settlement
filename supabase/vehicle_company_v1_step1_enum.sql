-- ============================================================================
-- VEHICLE COMPANY REPORT v1 — STEP 1 (enum value only, run ALONE first)
-- Run in Supabase Dashboard → SQL Editor on PRODUCTION.
--
-- Adds the `vehicle_company` role to public.user_role.
--
-- ⚠ ENUM ORDERING / IRREVERSIBILITY
--   PostgreSQL cannot use a newly added enum value in the SAME transaction that
--   adds it, and enum values can NEVER be dropped. Therefore this file is split:
--     STEP 1 — run ALONE first (adds the enum value, commits).
--     STEP 2 — run AFTER step 1 (uses 'vehicle_company' in helpers/policies).
--   Run STEP 1, confirm success, THEN run STEP 2 as a separate execution.
--
-- This statement does NOT touch settlements, calculation, payout, paid-lock,
-- settlement status flow, or the guide confirmation flow.
-- ============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'vehicle_company';
