# C3 — Staging Verification Record

**Status:** CLOSED  
**Date:** 2026-06-02  
**Target:** https://xqkdsgjwftfaacvppxag.supabase.co  
**Production:** Not touched  

---

## Summary

Master paid-settlement lock (C3) and the C3a in-place hotfix were applied on staging and verified by SQL sanity checks, dedicated RLS proof scripts, and full workflow v1 smoke automation.

| Finding | Verdict |
|---------|---------|
| **C3a** — paid in-place financial edits | **PASS** |
| **C3b** — illegal paid status transitions | **PASS** |
| **C3c** — master reopen `paid → edit_requested` | **PASS** |
| **Full smoke** — W1–W7 + RLS negatives + cleanup | **PASS** (17/17) |

---

## Migrations applied (staging)

| Step | File | Notes |
|------|------|-------|
| C3 | `supabase/settlement_workflow_v1_c3_master_paid_lock.sql` | Master deny-default transitions; split master RLS policies |
| C3a | `supabase/settlement_workflow_v1_c3a_paid_inplace_lock.sql` | Global paid→paid trigger lock **before** workflow no-op shortcut; no OLD/NEW in RLS |

**Prerequisites on staging (already applied):** P0, P1, P2a, `settlement_rls_guide_submit_fix.sql`, `settlement_workflow_v1_guide_confirm_rpc.sql`, hardening bundle.

**Not applied on staging:** P2b storage policies, status normalization.

---

## C3a — PASS

**Requirement:** No role may mutate financial or other columns on a settlement while `status` stays `paid`.

**Proof:**

| Script | Result | Detail |
|--------|--------|--------|
| `staging-rls-proof-c1-c3.mjs` | PASS | Blocked: `Cannot modify paid settlement` |
| `staging-rls-proof-c3-supplement.mjs` | PASS | Master `ground_fee_usd` mutation blocked; value unchanged (0 → 0) |

**Mechanism:** `enforce_settlement_workflow()` raises `Cannot modify paid settlement` when `OLD.status = paid` and `NEW.status = paid`, evaluated **before** the early `RETURN NEW` shortcut for unchanged workflow columns.

---

## C3b — PASS

**Requirement:** Master cannot transition a paid settlement to any status other than `edit_requested` via the approved reopen path.

**Proof:**

| Script | Result | Detail |
|--------|--------|--------|
| `staging-rls-proof-c1-c3.mjs` | PASS | Blocked: `Master cannot transition paid settlement to draft` |
| `staging-rls-proof-c3-supplement.mjs` | PASS | Blocked: `Master cannot transition paid settlement to submitted`; `status` remained `paid` |

---

## C3c — PASS

**Requirement:** `master_admin` may reopen a paid settlement to `edit_requested` with `paid_at`, `guide_confirmed_at`, and `guide_confirmed_by` cleared.

**Proof:**

| Script | Result | Detail |
|--------|--------|--------|
| `staging-rls-proof-c1-c3.mjs` | PASS | `count=1 status=edit_requested paid_at=null` |
| `staging-rls-proof-c3-supplement.mjs` | PASS | Reopen succeeded; `paid_at=null` |
| `staging-workflow-v1-smoke.mjs` (W6) | PASS | Master admin reopens paid → `edit_requested` |

**Reopen payload (app + smoke):** `status: edit_requested`, `paid_at: null`, `guide_confirmed_at/by: null`, plus `edit_requested_at/by`.

---

## Full smoke — PASS

**Run ID:** `20260602-61w0b6`  
**Settlement:** `6c3feda0-017c-4482-a27e-b0f50c93a956`  
**Command:** `node scripts/staging-workflow-v1-smoke.mjs`

| ID | Result | Scenario |
|----|--------|----------|
| A0 | PASS | Config |
| A1 | PASS | Resolve test accounts |
| A2 | PASS | Create test fixtures |
| W1 | PASS | Guide submits settlement |
| W2 | PASS | Admin sends for final confirmation |
| R4 | PASS | Admin blocked on guide line items (pending) |
| W3a | PASS | Status unchanged after No Issues |
| W3b | PASS | `guide_confirmed_at` set |
| R1 | PASS | Guide cannot mark paid |
| W4 | PASS | Admin marks as paid |
| W5 | PASS | Guide cannot edit after paid |
| R3 | PASS | Guide line-item block after paid |
| R5 | PASS | Admin blocked on guide line items (paid) |
| R2 | PASS | Admin cannot reopen paid |
| W6 | PASS | Master admin reopens paid |
| W7 | PASS | Guide can edit again |
| C1 | PASS | Cleanup (17 delete steps OK) |

---

## SQL verification

Run in staging SQL Editor after C3 + C3a:

```sql
-- supabase/verify_c3_master_paid_lock.sql
```

**PASS when:**

- `trigger_has_c3a_paid_inplace_lock` = true
- `trigger_has_paid_transition_lock` = true
- `trigger_has_master_deny_default` = true
- `c3a_lock_before_noop_shortcut` = true
- `no_paid_inplace_deny_policy` = true
- `settlements_master_admin_update` / `settlements_master_reopen_paid` present with valid expressions (no OLD/NEW)

---

## Runtime proof commands (staging)

```bash
node scripts/staging-rls-proof-c1-c3.mjs
node scripts/staging-rls-proof-c3-supplement.mjs
node scripts/staging-workflow-v1-smoke.mjs
```

All three exited 0 on 2026-06-02.

---

## C3 verdict

**CLOSED on staging.** Safe to proceed to production rollout planning per [`C3_PRODUCTION_ROLLOUT_CHECKLIST.md`](C3_PRODUCTION_ROLLOUT_CHECKLIST.md).

**Related:** [`settlement_workflow_v1_db_migration.md`](settlement_workflow_v1_db_migration.md), [`PRE_PRODUCTION_READINESS_REPORT`](../claude-review-package-final/PRE_PRODUCTION_READINESS_REPORT.md) (pre-C3 baseline).
