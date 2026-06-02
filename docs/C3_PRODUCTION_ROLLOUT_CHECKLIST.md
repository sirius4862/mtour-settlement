# C3 — Production Rollout Checklist

**Purpose:** Apply workflow v1 + C3 master paid lock to **production** after staging closure.  
**Staging reference:** [`C3_STAGING_VERIFICATION.md`](C3_STAGING_VERIFICATION.md) — C3 CLOSED, smoke run `20260602-61w0b6`.  
**Authority:** [`workflow_decision_v1.md`](workflow_decision_v1.md)

> **Do not run against staging again unless re-validating.** This checklist is for production only.

---

## 0. Go / No-Go gate

Proceed only when **all** are true:

- [ ] Staging C3 verification CLOSED (C3a, C3b, C3c, full smoke PASS)
- [ ] Production prerequisite audit complete (Section 1)
- [ ] Release commit tagged; temp diagnostics removed from `settlementActions.ts`
- [ ] Maintenance window agreed (DB before app)
- [ ] Rollback owner identified
- [ ] P2b and status normalization **explicitly deferred** (Section 6)

**No-Go if:** app ships with TEMP DIAG code, DB not verified before deploy, or production missing hardening / confirmation schema.

---

## 1. Production preflight (read-only)

Run in **production** SQL Editor before any DDL.

### 1.1 Prerequisites

Confirm already applied (or plan to apply **before** P0):

- [ ] `settlement_rls_hardening_migration.sql` (or equivalent hardening bundle)
- [ ] Confirmation schema migrations (`settlement_confirmations`, etc.)
- [ ] `settlement_rls_line_items_guide_write_fix.sql`
- [ ] `settlement_status_logs_rls_migration.sql` (if guide submit logs fail without it)
- [ ] Guide workflow fix: `settlement_rls_guide_workflow_fix.sql` (if used in prod today)

### 1.2 Environment sanity

```sql
-- Trigger exists
SELECT proname FROM pg_proc
WHERE proname = 'enforce_settlement_workflow';

-- Current master policy name (pre-C3 may be single settlements_master_admin_update)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'settlements'
  AND policyname LIKE 'settlements_%'
ORDER BY policyname;

-- Legacy row counts (informational — do not normalize yet)
SELECT status, COUNT(*) FROM settlements GROUP BY status ORDER BY status;
```

### 1.3 App readiness

- [ ] `npm test` PASS on release tag
- [ ] `npm run build` PASS
- [ ] App uses `guide_submit_settlement` RPC for submit
- [ ] App calls `guide_confirm_settlement` RPC **before** updating `settlement_confirmations` to `confirmed`
- [ ] Master reopen UI sends full reopen payload (`edit_requested`, clear `paid_at` / confirm flags)

---

## 2. SQL apply order (production SQL Editor, postgres)

Apply **in order**. One file per run; confirm success before next step.

| # | File | Required |
|---|------|----------|
| 1 | `supabase/settlement_workflow_v1_p0_enforce_and_admin_rls.sql` | Yes |
| 2 | `supabase/settlement_workflow_v1_p1_mutation_helpers.sql` | Yes |
| 3 | `supabase/settlement_rls_guide_submit_fix.sql` | Yes |
| 4 | `supabase/settlement_workflow_v1_p2a_public_submit_child_rls.sql` | Yes |
| 5 | `supabase/settlement_workflow_v1_guide_confirm_rpc.sql` | Yes |
| 6 | `supabase/settlement_workflow_v1_c3_master_paid_lock.sql` | Yes |
| 7 | `supabase/settlement_workflow_v1_c3a_paid_inplace_lock.sql` | Yes |
| 8 | `supabase/settlement_workflow_v1_p2b_storage_receipt_policies.sql` | Optional — see Section 6 |

**Do not run:**

- `supabase/settlement_workflow_v1_p2_submit_storage_child_rls.sql` (deprecated combined file; storage permission errors)
- Status normalization migrations (separate phase)
- Staging-only files (`staging_workflow_v1_test_accounts.sql`, etc.)

**Note:** If production already has P0–P5 from a partial v1 rollout, skip steps already applied; **always** apply C3 then C3a in order if not yet present.

---

## 3. Post-apply SQL verification (production)

### 3.1 Workflow v1 baseline

- [ ] `supabase/verify_guide_submit_rpc.sql`
- [ ] `supabase/verify_guide_confirm_settlement_rpc.sql`
- [ ] `supabase/verify_settlements_guide_update_rls.sql`

### 3.2 C3 + C3a

Run `supabase/verify_c3_master_paid_lock.sql`.

| Check | Expected |
|-------|----------|
| `trigger_has_c3a_paid_inplace_lock` | `true` |
| `trigger_has_paid_transition_lock` | `true` |
| `trigger_has_master_deny_default` | `true` |
| `c3a_lock_before_noop_shortcut` | `true` |
| `no_paid_inplace_deny_policy` | `true` |
| `settlements_master_admin_update` | Present; USING excludes `status = paid` |
| `settlements_master_reopen_paid` | Present; WITH CHECK requires `edit_requested` + cleared pay/confirm |

**C3a regression guard:** No RLS policy named `settlements_paid_inplace_deny` with OLD/NEW references (invalid; caused `42P01` on staging).

---

## 4. App deploy (after DB verified)

| Step | Action |
|------|--------|
| 1 | Complete Section 2 + 3 on production DB |
| 2 | Deploy app release tag to production |
| 3 | Smoke one non-customer test settlement through full path (Section 5) |
| 4 | Monitor errors for 24h (submit, confirm, pay, reopen) |

**Order:** DB first, then app. Never deploy app v1 before DB migrations succeed.

---

## 5. Manual production smoke (no automated script)

Staging proof scripts **refuse non-staging URLs**. On production, run manual checks with test accounts or a controlled internal settlement:

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| M1 | Guide | Submit draft | → `submitted` |
| M2 | Admin | Send for final confirmation | → `pending_guide_confirmation` |
| M3 | Guide | Confirm (No Issues) | `guide_confirmed_at` set; status unchanged |
| M4 | Admin | Mark paid | → `paid` |
| M5 | Master | Try in-place edit (e.g. `ground_fee_usd`) on paid row | **Blocked** — `Cannot modify paid settlement` |
| M6 | Master | Try `paid → draft` or `paid → submitted` | **Blocked** |
| M7 | Master | Reopen paid | → `edit_requested`; `paid_at` null |
| M8 | Guide | Edit line item on `edit_requested` | Allowed |
| M9 | Admin | Try reopen on paid | **Blocked** (R2 regression) |

Document settlement ID, timestamps, and operator for audit.

---

## 6. Explicitly deferred (do not run in this rollout)

| Item | Reason |
|------|--------|
| **P2b** storage policies | Optional; staging green without it; decide separately if receipt upload RLS needs refresh |
| **Status normalization** | Separate phase; legacy `approved` / `rejected` rows remain with compatibility branches |
| **C3 re-proof on staging** | Already closed — see verification doc |

---

## 7. Rollback

If production verification fails **before** app deploy:

1. Run `supabase/settlement_workflow_v1_rollback.sql` — restores **pre-v1** trigger and admin policy (does **not** include C3-specific split policies; re-apply full migration chain when retrying).
2. Drop `guide_confirm_settlement` only if app also reverted.
3. Re-run hardening / line-item fix SQL if child RLS was affected.

**Warning:** Rollback does not revert data (rows already `paid` stay paid). C3a trigger revert requires re-running rollback or replacing `enforce_settlement_workflow()` — rollback file predates C3 hardened master branch.

If failure **after** app deploy: rollback DB per above, then redeploy previous app tag.

---

## 8. Sign-off

| Role | Check | Sign-off |
|------|-------|----------|
| DBA / backend | Sections 1–3 complete | |
| App owner | Section 4 deploy + Section 5 smoke | |
| Product / ops | Legacy row impact acknowledged; P2b decision documented | |

**C3 production verdict:** _____________  
**Date:** _____________  
**Production project ref:** _____________  

---

## Related docs

- [`C3_STAGING_VERIFICATION.md`](C3_STAGING_VERIFICATION.md)
- [`settlement_workflow_v1_db_migration.md`](settlement_workflow_v1_db_migration.md)
- [`claude-review-package-final/PRE_PRODUCTION_READINESS_REPORT.md`](../claude-review-package-final/PRE_PRODUCTION_READINESS_REPORT.md)
