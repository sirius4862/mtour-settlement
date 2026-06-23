# Guide Confirm Atomic — Staging Blocker Operator Checklist

**Status:** ACTIVE — atomic SQL blocked until true staging exists  
**Production app SHA (2026-06-23):** `22c7b7a79af492e9a6ca9cb1d299b12e083b2423`  
**Production Supabase ref:** `xqkdsgjwftfaacvppxag` — **never staging**

Phase A bridge app is live on production. Production still uses the **legacy** `guide_confirm_settlement` RPC. Do **not** apply atomic SQL until this checklist is complete on a **separate** Supabase project.

---

## A. Create and verify staging (required before atomic SQL)

| Step | Action | Pass |
|------|--------|------|
| A1 | Create a **new** Supabase project in Dashboard | Ref recorded (not `xqkdsgjwftfaacvppxag`) |
| A2 | Name project clearly (e.g. `mtour-settlement-staging-atomic`) | Visual marker in Dashboard |
| A3 | Enable Email auth (match production providers) | Guide/admin login works |
| A4 | Copy **Project URL** + **anon public key** locally only | Never commit |
| A5 | Populate **`.env.staging`** locally (template in repo root) | See variables below |
| A6 | Create **separate** staging auth users (guide, admin, master_admin) | Not production credentials |
| A7 | Run `node scripts/check-staging-env-ref.mjs --dotenv-path .env.staging` | `ok: true`, ref ≠ production |
| A8 | Bootstrap schema (schema-only dump from production **read-only export**, or ordered migrations — see `docs/guide-confirm-atomic-staging-setup.md`) | Required tables + legacy RPC exist |
| A9 | Seed minimal guide-confirm fixture | See section C |
| A10 | Point **local dev or Vercel Preview only** at staging | Production Vercel env unchanged |
| A11 | Run legacy bridge smoke on staging (before atomic SQL) | Guide confirm succeeds on old RPC |

### `.env.staging` variables (local only — never commit)

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes — `https://<NEW_REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `WORKFLOW_TEST_GUIDE_EMAIL` / `WORKFLOW_TEST_GUIDE_PASSWORD` | Yes for automated smoke |
| `WORKFLOW_TEST_ADMIN_EMAIL` / `WORKFLOW_TEST_ADMIN_PASSWORD` | Yes |
| `WORKFLOW_TEST_MASTER_EMAIL` / `WORKFLOW_TEST_MASTER_PASSWORD` | Optional |
| `POSTGRES_URL` / `DATABASE_URL` | Optional — SQL verify/export scripts only |

**Preflight commands (no secrets printed):**

```bash
node scripts/extract-supabase-ref.mjs .env.staging .env.local
node scripts/check-staging-env-ref.mjs --dotenv-path .env.staging
node scripts/staging-guide-confirm-seed-preview.mjs
```

---

## B. Production RPC baseline export (read-only — before any future production SQL)

Run in **Supabase SQL Editor → project `xqkdsgjwftfaacvppxag`**. **Do not modify production.**

### B1. Export function definition

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'guide_confirm_settlement';
```

Save output locally (gitignored):

- `artifacts/guide-confirm-settlement-rpc-production-pg-get-functiondef.sql`

### B2. Export grants

```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'guide_confirm_settlement'
ORDER BY grantee, privilege_type;
```

### B3. Build rollback artifact

Create `artifacts/rollback-guide-confirm-settlement-rpc-production.sql`:

- `CREATE OR REPLACE FUNCTION public.guide_confirm_settlement(...)` from B1 export
- `GRANT EXECUTE ...` lines from B2

**Do not execute rollback unless an approved maintenance window requires it.**

### B4. Confirm legacy behavioral baseline

- RPC returns `ok`, `status`, `guide_confirmed_at`
- Does **not** return `confirmation_id` / `confirmation_status`
- `settlement_confirmations` stays `pending` until app-side UPDATE (bridge legacy path)

Optional: `node scripts/export-production-guide-confirm-rpc.mjs` if `DATABASE_URL` is available locally (never commit URL).

---

## C. Minimal staging seed (guide confirm smoke)

| Entity | Requirement |
|--------|-------------|
| Branch | 1 row in `branches` |
| Profiles | guide (+ `branch_id`), admin, optional master_admin |
| Tour | Assigned to guide, not recalled, recent `start_date` |
| Settlement | `status = pending_guide_confirmation`, `guide_confirmed_at` NULL, `active_confirmation_id` set |
| Confirmation | `settlement_confirmations.status = pending`, id matches `active_confirmation_id` |
| Snapshots | `guide_submit` + `admin_pre_confirm` linked; valid payload (`header`, `calc_summary`) |

Automation pattern: `e2e/helpers/supabase-workflow.ts` → `createWorkflowFixture()` → `guideSubmit()` → `sendForConfirmation()`.

Preview checklist (no DB writes):

```bash
node scripts/staging-guide-confirm-seed-preview.mjs
```

---

## D. Atomic SQL on staging only (after A + legacy smoke pass)

| Step | Action |
|------|--------|
| D1 | Re-run `check-staging-env-ref.mjs` | 
| D2 | SQL Editor on **staging project only** | 
| D3 | Run `supabase/settlement_workflow_v1_guide_confirm_atomic_rpc.sql` | 
| D4 | Run `supabase/verify_guide_confirm_settlement_atomic.sql` | 
| D5 | `node scripts/probe-guide-confirm-rpc-shape.mjs --dotenv-path .env.staging` | Expect `atomicRpcLikely` after real confirm |
| D6 | Manual guide confirm on fresh pending fixture | Flags + packet confirmed atomically; bridge skips app packet UPDATE |

**Never run D3 on `xqkdsgjwftfaacvppxag`.**

---

## E. Staging verification matrix

| Check | Pass criteria |
|-------|---------------|
| Guide confirm | Success message; no hydration error |
| `settlements.guide_confirmed_at/by` | Set |
| `settlement_confirmations` | `status = confirmed`, `confirmed_by` = guide |
| Wrong guide | Blocked |
| Double confirm | Safe failure / idempotent contract |
| Paid / wrong status | RPC rejects |
| Admin detail | 지급완료 처리 visible after confirm |
| App errors | Clear Korean message in ConfirmPanel |

---

## F. Misleading references cleanup (repo hygiene)

Historical docs/scripts labeled `xqkdsgjwftfaacvppxag` as “staging.” That project is **production**.

- E2E specs: renamed to `assertLegacyProductionWorkflowSupabase` until migrated to true staging
- `scripts/apply-admin-send-confirmation-rpc.mjs`: refuses production DB URL
- `scripts/probe-guide-confirm-rpc-shape.mjs`: refuses production env
- `docs/C3_STAGING_VERIFICATION.md`: historical record only — target was production DB

When true staging exists, set `E2E_STAGING_SUPABASE_REF` or point specs at `.env.staging` and use `assertStagingSupabaseNotProduction`.

---

## G. Related docs

- [`guide-confirm-atomic-staging-setup.md`](guide-confirm-atomic-staging-setup.md) — detailed Phase B playbook
- [`guide-confirm-atomic-phase-b-production-maintenance-plan.md`](guide-confirm-atomic-phase-b-production-maintenance-plan.md) — production window (blocked until staging passes)
- [`guide-confirmation-atomicity-plan.md`](guide-confirmation-atomicity-plan.md) — Phases A/B/C bridge strategy

---

## H. Current blocker summary

| Item | Status |
|------|--------|
| True non-production Supabase project | **Not configured** |
| `.env.staging` | Template only (URL empty) |
| Atomic SQL applied anywhere | **No** |
| Production RPC replaced | **No** |

**Next operator action:** Complete section **A** (create staging project + configure `.env.staging`).
