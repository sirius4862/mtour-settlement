-- =============================================================
-- Settlement confirmation workflow — Phase A (additive only)
-- Run in Supabase Dashboard → SQL Editor
--
-- Safe to re-run: uses IF NOT EXISTS / guarded enum adds where supported.
-- Does NOT modify calc.ts or existing settlement columns (nullable adds only).
-- =============================================================

BEGIN;

-- ── 1. Extend settlement_status enum ───────────────────────────

ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'pending_guide_confirmation';
ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'clarification_requested';

-- ── 2. Supporting enum types ──────────────────────────────────

DO $$ BEGIN
  CREATE TYPE settlement_snapshot_kind AS ENUM (
    'guide_submit',
    'admin_pre_confirm',
    'guide_confirmed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_confirmation_status AS ENUM (
    'pending',
    'confirmed',
    'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_audit_action AS ENUM (
    'guide_submit',
    'admin_save',
    'send_for_confirmation',
    'guide_confirm',
    'guide_clarification',
    'admin_reject',
    'admin_request_edit',
    'admin_pay',
    'status_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_field_owner AS ENUM (
    'guide',
    'admin',
    'calculated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. settlement_snapshots ───────────────────────────────────

CREATE TABLE IF NOT EXISTS settlement_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id       uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  kind                settlement_snapshot_kind NOT NULL,
  payload_json        jsonb NOT NULL DEFAULT '{}',
  calc_summary_json   jsonb,
  created_by          uuid NOT NULL REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_snapshots_settlement_id
  ON settlement_snapshots(settlement_id);

CREATE INDEX IF NOT EXISTS idx_settlement_snapshots_kind
  ON settlement_snapshots(settlement_id, kind);

-- ── 4. settlement_audit_events ──────────────────────────────────

CREATE TABLE IF NOT EXISTS settlement_audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id   uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES profiles(id),
  actor_role      user_role NOT NULL,
  action          settlement_audit_action NOT NULL,
  from_status     settlement_status,
  to_status       settlement_status,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_audit_events_settlement_id
  ON settlement_audit_events(settlement_id, created_at DESC);

-- ── 5. settlement_confirmations ─────────────────────────────────

CREATE TABLE IF NOT EXISTS settlement_confirmations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id       uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  snapshot_before_id  uuid NOT NULL REFERENCES settlement_snapshots(id),
  snapshot_after_id   uuid NOT NULL REFERENCES settlement_snapshots(id),
  status              settlement_confirmation_status NOT NULL DEFAULT 'pending',
  sent_by             uuid NOT NULL REFERENCES profiles(id),
  sent_at             timestamptz NOT NULL DEFAULT now(),
  confirmed_by        uuid REFERENCES profiles(id),
  confirmed_at        timestamptz,
  r85_before          numeric(12, 2),
  r85_after           numeric(12, 2),
  r87_before          numeric(12, 2),
  r87_after           numeric(12, 2),
  change_count        integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_confirmations_settlement_id
  ON settlement_confirmations(settlement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_confirmations_status
  ON settlement_confirmations(settlement_id, status);

-- ── 6. settlement_field_changes ───────────────────────────────

CREATE TABLE IF NOT EXISTS settlement_field_changes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id     uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  confirmation_id   uuid REFERENCES settlement_confirmations(id) ON DELETE SET NULL,
  audit_event_id    uuid REFERENCES settlement_audit_events(id) ON DELETE SET NULL,
  field_path        text NOT NULL,
  excel_ref         text,
  label             text NOT NULL,
  owner             settlement_field_owner NOT NULL,
  old_value_json    jsonb,
  new_value_json    jsonb,
  old_display       text,
  new_display       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_field_changes_settlement_id
  ON settlement_field_changes(settlement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_field_changes_confirmation_id
  ON settlement_field_changes(confirmation_id);

-- ── 7. Additive columns on settlements ────────────────────────

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS sent_for_confirmation_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_for_confirmation_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS guide_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS guide_confirmed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS clarification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS clarification_message text,
  ADD COLUMN IF NOT EXISTS active_confirmation_id uuid REFERENCES settlement_confirmations(id),
  ADD COLUMN IF NOT EXISTS guide_submit_snapshot_id uuid REFERENCES settlement_snapshots(id);

COMMIT;

-- ── Verification (optional) ───────────────────────────────────
-- SELECT unnest(enum_range(NULL::settlement_status))::text AS status;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'settlements'
--     AND column_name IN (
--       'sent_for_confirmation_at', 'guide_confirmed_at',
--       'active_confirmation_id', 'guide_submit_snapshot_id'
--     );
