# Guide Final Confirmation Atomicity — Design Plan

**Status:** Bridge app + atomic SQL migration implemented locally on `feat-guide-confirm-atomic`. **Not applied to production.** Production SQL requires **separate explicit approval**.  
**Date:** 2026-06-12 (updated 2026-06-16 — bridge rollout strategy)  
**Context:** Urgent paid-reopen hotfix (`731be1d`) is deployed. Phase 1.5.x guide correction UX is on production (`19c4f63`). This document plans and records atomic guide-confirm hardening with a **backward/forward-compatible bridge**.

---

## Safe rollout order (bridge strategy) — READ FIRST

Production today uses the **old** `guide_confirm_settlement` RPC (sets settlement flags only; does **not** return `confirmation_id` / `confirmation_status`; app confirms the packet separately). A naive “atomic app + SQL together” deploy is **unsafe**. The approved strategy is a **three-phase bridge rollout**:

### Phase A — Bridge app first (no SQL required)

1. Deploy app code that supports **both** old RPC and new atomic RPC via `resolveGuideConfirmRpcBridge()`.
2. With **old production RPC** (current state):
   - RPC returns `ok` only (no `confirmation_id` / `confirmation_status`).
   - Bridge classifies response as **`legacy`**.
   - App performs existing app-side `settlement_confirmations` UPDATE (`pending` → `confirmed`) with `assertSingleOptimisticUpdate`.
3. **No SQL migration required** for Phase A.
4. **App-first bridge deploy is safe** with the old RPC already in production.

### Phase B — Atomic SQL later (after bridge app is live)

1. Apply `supabase/settlement_workflow_v1_guide_confirm_atomic_rpc.sql` on **staging/dev first**, run `verify_guide_confirm_settlement_atomic.sql`, manual guide-confirm smoke.
2. After staging passes and **separate production SQL approval**, apply the same migration on production.
3. New RPC atomically updates **both** `settlements.guide_confirmed_at/by` and `settlement_confirmations` → `confirmed` in one transaction.
4. New RPC returns `confirmation_id` + `confirmation_status: 'confirmed'`.
5. Bridge app detects atomic shape and **skips** duplicate app-side packet UPDATE.

### Phase C — Optional cleanup later

1. After atomic RPC is stable in production, optionally remove the legacy fallback path in `guideConfirm()` (app-side packet UPDATE).
2. Do not remove legacy path until production has run on atomic RPC without incident.

### Deployment safety rules (explicit)

| Order | Safe? | Why |
|-------|-------|-----|
| **Bridge app first, old RPC** | **Yes** | Legacy path performs app-side packet UPDATE (current production behavior). |
| **Bridge app first, then atomic SQL** | **Yes** | App auto-detects atomic RPC; skips duplicate UPDATE. |
| **SQL first, old app (no bridge)** | **No** | RPC confirms packet; old app UPDATE `WHERE status='pending'` affects 0 rows → confirm fails. |
| **New non-bridge app before SQL** | **No** | App requires `confirmation_id` + `confirmation_status`; old RPC does not return them → confirm fails. |
| **Atomic SQL on production** | **Requires separate approval** | Never apply without explicit sign-off; test staging/dev first. |

**SQL migration file:** `supabase/settlement_workflow_v1_guide_confirm_atomic_rpc.sql` — **unchanged in the bridge step** (same atomic RPC definition; only app bridge logic was added).

---

## Executive summary

Guide final confirmation (`이상없음`) is **not atomic** today. The app performs **three separate writes**:

1. Insert `guide_confirmed` snapshot (app)
2. Call `guide_confirm_settlement` RPC (sets `guide_confirmed_at` / `guide_confirmed_by`)
3. Update `settlement_confirmations` to `confirmed` (app)

If step 2 succeeds and step 3 fails, the settlement is guide-confirmed and admin can pay, but the confirmation packet stays `pending` — a workflow/audit desync.

**Recommendation:** **SQL migration** extending `guide_confirm_settlement` (not app-only). Use **phased Option C**: Phase 1 moves settlement + confirmation packet updates into one RPC transaction; keep snapshot insert in the app. Phase 2 optionally folds audit + snapshot into RPC.

**Bridge rollout (approved):** Deploy a **bridge app** first (`resolveGuideConfirmRpcBridge`) so production keeps working on the old RPC; apply atomic SQL later without a coordinated same-window deploy.

## Part A — Production DB inspection results

### Direct SQL access

| Method | Result |
|--------|--------|
| `POSTGRES_URL` / `DATABASE_URL` in `settlement-app/.env.local` | **Not available** |
| Vercel production env pull | No DB URL |
| `pg_get_functiondef` / `pg_policies` queries | **Not executed** |

### Indirect verification (prior read-only behavioral probes, DB `xqkdsgjwftfaacvppxag`)

| RPC | Exists? | Observed behavior |
|-----|---------|-------------------|
| `guide_confirm_settlement` | Yes | Returns `{"ok":true,"status":"pending_guide_confirmation","guide_confirmed_at":"<iso>"}` |
| `guide_submit_settlement` | Yes | Rejects non-guide callers |
| `admin_send_for_confirmation` | Yes | Rejects actor mismatch (expected) |

**Critical behavioral finding:** After successful `guide_confirm_settlement`, `settlement_confirmations.status` remained **`pending`** until the app performed a separate UPDATE. The RPC does **not** currently confirm the packet atomically.

### Repo SQL gap

Checklist references `supabase/settlement_workflow_v1_guide_confirm_rpc.sql` and `verify_guide_confirm_settlement_rpc.sql`, but **neither file exists in the repository**. Production RPC body must be exported via Supabase SQL Editor before migration authoring:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'guide_confirm_settlement';
```

### RLS policies (from repo `settlement_rls_hardening_migration.sql`)

Relevant `settlement_confirmations` policies:

| Policy | Role | Effect |
|--------|------|--------|
| `settlement_confirmations_guide_select` | Guide (non-admin) | SELECT own settlement confirmations |
| `settlement_confirmations_admin_select` | Admin tier | SELECT via `auth_user_can_access_settlement` |
| `settlement_confirmations_admin_all` | Admin tier | ALL |
| `settlement_confirmations_guide_update` | Any caller passing `auth_user_can_access_settlement` + `status = 'pending'` | UPDATE pending rows |

**Note:** `settlement_confirmations_guide_update` does **not** require `auth_user_is_guide()` — admin tier can satisfy `auth_user_can_access_settlement`. SECURITY DEFINER RPC is the correct place to enforce guide-only confirm.

`settlements` guide update policy allows workflow mutation in `pending_guide_confirmation`; `guide_confirmed_at` changes are constrained by `enforce_settlement_workflow()` trigger.

---

## Part B — Current app code analysis

### Files inspected

| File | Purpose |
|------|---------|
| `src/lib/actions/settlementActions.ts` | `guideConfirm()`, `getGuideConfirmationPacket()`, `insertSnapshot()`, `insertAuditEvent()` |
| `src/app/guide/settlements/[id]/confirm/ConfirmPanel.tsx` | UI calls `guideConfirm()` |
| `src/app/guide/settlements/[id]/confirm/page.tsx` | Packet load + `ConfirmUnavailable` stuck UX |
| `src/lib/settlement/guide-confirm-admin-pay.test.ts` | Source-level wiring tests |
| `src/lib/settlement/guide-confirm-packet.test.ts` | Snapshot/diff helpers |
| `src/lib/settlement/settlement-audit-fixes.test.ts` | RPC-before-packet-update ordering |
| `src/lib/settlement/status-guards.ts` | `isStuckGuideConfirmation()` |
| `supabase/settlement_workflow_v1_admin_send_confirmation_rpc.sql` | Reference atomic RPC |
| `supabase/settlement_rls_guide_submit_transition_fix.sql` | Reference guide RPC pattern |
| `supabase/settlement_rls_hardening_migration.sql` | RLS + workflow trigger context |

### Answers

#### 1. Where is `guide_confirm_settlement` called?

Only in `guideConfirm()`:

```ts
await supabase.rpc('guide_confirm_settlement', {
  p_settlement_id: id,
  p_confirmed_at: now,
})
```

Also referenced in E2E (`e2e/prod-smoke.spec.ts`) and production smoke scripts for paid-lock verification.

#### 2. What fields does the app expect the RPC to set?

| Field | Expected by app |
|-------|-----------------|
| `settlements.guide_confirmed_at` | **Yes** — post-RPC re-read; fails if null |
| `settlements.guide_confirmed_by` | Selected in verify read (not explicitly checked) |
| `settlements.status` | Unchanged (`pending_guide_confirmation`) |
| `settlement_confirmations.status` | **Expected `confirmed` from app**, not RPC today |

RPC response must include `{ ok: true }` or app returns generic failure.

#### 3. Where does the app update `settlement_confirmations` after RPC?

```ts
await supabase.from('settlement_confirmations').update({
  status: 'confirmed',
  confirmed_by: profile.id,
  confirmed_at: now,
})
  .eq('id', current.active_confirmation_id)
  .eq('status', 'pending')
```

Uses **base table** (not `GUIDE_READ` view), with `assertSingleOptimisticUpdate`.

#### 4. Where does the app insert the guide confirmed snapshot?

**Before** the RPC, via `insertSnapshot()`:

- Kind: `guide_confirmed`
- Payload: copied from active packet's `snapshot_after_id` payload
- Table: `settlement_snapshots` (guide INSERT policy)

If snapshot insert fails, RPC is never called (safe). If snapshot succeeds and RPC fails, **orphan `guide_confirmed` snapshot** remains.

#### 5. What post-RPC verification exists now?

| Check | Location |
|-------|----------|
| RPC error / `ok !== true` | Immediate return |
| Re-read `guide_confirmed_at` from `GUIDE_READ.settlements` | Fail if missing |
| `assertSingleOptimisticUpdate` on confirmation row | Fail if ≠ 1 row |
| Pre-RPC: `guide_confirmed_at` already set | Block double confirm |
| Pre-RPC: `active_confirmation_id` + pending packet + `snapshot_after_id` | Block missing packet |

#### 6. What desync cases still remain?

| Scenario | Settlement state | Packet state | User impact |
|----------|------------------|--------------|-------------|
| **A: RPC OK, packet update fails** | `guide_confirmed_at` set | `pending` | Admin can pay; packet history wrong; guide detail shows "확인 완료" |
| **B: Snapshot OK, RPC fails** | unchanged | `pending` | Orphan `guide_confirmed` snapshot |
| **C: Packet confirmed without RPC (inverse, historical)** | `guide_confirmed_at` null | `confirmed` | `ConfirmUnavailable` / stuck (mitigated by confirm page) |
| **D: Audit insert fails after A succeeds** | confirmed + packet confirmed | Minor — pay still works |

`isStuckGuideConfirmation()` detects **scenario C**, not A.

#### 7. Which parts are already safe after recent hardening?

| Area | Status |
|------|--------|
| Pre-RPC guards (role, owner, status, packet) | Safe |
| Lighter packet load (no `getSettlementFull` in confirm path) | Safe |
| Post-RPC `guide_confirmed_at` verification | Safe — prevents false success to UI |
| Optimistic packet update (`status = pending`) | Safe — detects stale concurrent updates |
| `ConfirmPanel` try/catch + error display | Safe — no silent "처리 중…" hang |
| Admin `canPay` requires `guide_confirmed_at` | Safe — pay gated correctly even in desync A |
| Confirm page `ConfirmUnavailable` | Safe — avoids redirect loop for scenario C |

---

## Part C — Proposed atomic RPC design

### 1. Current flow summary

```
Guide clicks "확인하고 승인"
  → guideConfirm()
    → [read] settlement + pending packet + after snapshot payload
    → [write 1] INSERT settlement_snapshots (guide_confirmed)
    → [write 2] RPC guide_confirm_settlement (guide_confirmed_at/by)
    → [verify] re-read guide_confirmed_at
    → [write 3] UPDATE settlement_confirmations → confirmed
    → [write 4] INSERT settlement_audit_events (guide_confirm)
    → revalidate paths
```

### 2. Current risk / desync cases

See Part B §6. **Highest production risk:** Scenario A (RPC success, app packet update failure).

### 3. Proposed target flow (Phase 1 — Option C + bridge)

**After bridge app is deployed (works with old or new RPC):**

```
Guide clicks "확인하고 승인"
  → guideConfirm()
    → [read] settlement + pending packet (unchanged pre-checks)
    → [write 1] INSERT guide_confirmed snapshot (app — unchanged)
    → [write 2] RPC guide_confirm_settlement
    → [bridge] resolveGuideConfirmRpcBridge(rpcRes, active_confirmation_id)
         ├─ legacy (old RPC): app UPDATE settlement_confirmations → confirmed
         └─ atomic (new RPC): skip app UPDATE; RPC already confirmed packet
    → [verify] read-back guide_confirmed_at/by + packet status=confirmed
    → [write 3] INSERT audit event (app — Phase 1)
    → revalidate paths
```

**After atomic SQL is live:** legacy branch is unused in normal operation; bridge skips duplicate UPDATE when RPC returns `confirmation_id` + `confirmation_status='confirmed'`.

### 4. Proposed RPC signature (Phase 1)

```sql
CREATE OR REPLACE FUNCTION public.guide_confirm_settlement(
  p_settlement_id uuid,
  p_confirmed_at timestamptz DEFAULT now(),
  p_confirmation_id uuid DEFAULT NULL  -- optional: must match active_confirmation_id
)
RETURNS jsonb
```

Keep existing name/signature where possible for backward compatibility; add optional `p_confirmation_id` only if needed for optimistic locking.

### 5. Required validation inside RPC

Mirror `guide_submit_settlement` + `admin_send_for_confirmation` style:

| # | Validation |
|---|------------|
| 1 | `auth.uid() IS NOT NULL` |
| 2 | `auth_user_is_guide()` AND NOT `auth_user_is_admin_tier()` |
| 3 | Settlement exists (`FOR UPDATE`) |
| 4 | `settlements.guide_id = auth.uid()` |
| 5 | `status = 'pending_guide_confirmation'` |
| 6 | `guide_confirmed_at IS NULL` |
| 7 | `active_confirmation_id IS NOT NULL` |
| 8 | Linked `settlement_confirmations` row exists with `id = active_confirmation_id` AND `status = 'pending'` |
| 9 | Optional: `p_confirmation_id` matches `active_confirmation_id` when provided |
| 10 | Optional: `snapshot_after_id` not null (packet integrity) |

**Do not use** `auth_user_can_access_settlement` alone — it grants admin tier. Use explicit guide ownership.

**Branch/region:** Not required for guide confirm (guide owns settlement by `guide_id = auth.uid()`). No admin region gate.

### 6. Required database writes (single transaction)

```sql
-- 1. Lock rows
SELECT ... FROM settlements WHERE id = p_settlement_id FOR UPDATE;
SELECT ... FROM settlement_confirmations WHERE id = v_active_confirmation_id FOR UPDATE;

-- 2. Update settlement flags (status unchanged)
UPDATE settlements SET
  guide_confirmed_at = p_confirmed_at,
  guide_confirmed_by = auth.uid()
WHERE id = p_settlement_id
  AND status = 'pending_guide_confirmation'
  AND guide_confirmed_at IS NULL
  AND guide_id = auth.uid();

-- 3. Confirm packet
UPDATE settlement_confirmations SET
  status = 'confirmed',
  confirmed_by = auth.uid(),
  confirmed_at = p_confirmed_at
WHERE id = v_active_confirmation_id
  AND settlement_id = p_settlement_id
  AND status = 'pending';

-- 4. Row count checks (both must be 1)
```

### 7. App code changes (bridge — implemented locally)

| Change | File |
|--------|------|
| `resolveGuideConfirmRpcBridge()` — classify old vs atomic RPC response | `src/lib/settlement/guide-confirm-rpc-bridge.ts` |
| Legacy path: app-side `settlement_confirmations` UPDATE when RPC lacks atomic fields | `settlementActions.ts` `guideConfirm()` |
| Atomic path: skip app UPDATE when RPC returns matching `confirmation_id` + `confirmation_status='confirmed'` | same |
| Fail on mismatched `confirmation_id` or non-`confirmed` `confirmation_status` | same |
| Read-back verify settlement flags + packet state (both paths) | same |
| Keep pre-RPC snapshot insert + `insertAuditEvent` app-side | same |
| Update bridge tests | `guide-confirm-atomic.test.ts`, `guide-confirm-admin-pay.test.ts`, `settlement-audit-fixes.test.ts` |

**Do not change:** `ConfirmPanel.tsx` flow. `getGuideConfirmationPacket()` unchanged. Phase 1.5.x correction / `request_edit` logic unchanged.

### 8. Test plan (design — implement later)

See Part E.

### 9. Rollout plan (bridge — approved)

| Step | Action | Environment |
|------|--------|-------------|
| **A1** | Deploy **bridge app** (`feat-guide-confirm-atomic`) | Production Vercel |
| **A2** | Verify guide confirm on production (legacy path; no SQL change) | Production smoke |
| **B1** | Export production RPC via `pg_get_functiondef` (baseline) | Production SQL Editor |
| **B2** | Apply `settlement_workflow_v1_guide_confirm_atomic_rpc.sql` | **Staging/dev first** |
| **B3** | Run `verify_guide_confirm_settlement_atomic.sql` | Staging |
| **B4** | Manual guide confirm + admin pay smoke | Staging |
| **B5** | Apply atomic SQL on production (**separate approval required**) | Production SQL Editor |
| **B6** | Verify guide confirm (atomic path; no duplicate app UPDATE) | Production smoke |
| **C1** | (Optional) Remove legacy fallback after atomic RPC stable | Future app deploy |

**Order:** **Bridge app first (Phase A)** → staging SQL + verify (Phase B) → production SQL approval + apply → optional legacy cleanup (Phase C).

**Do not:** Apply production SQL before bridge app is live. Do not deploy non-bridge atomic-only app before SQL.

### 10. Rollback plan

| Layer | Rollback |
|-------|----------|
| App | Revert to prior commit — bridge or pre-bridge app restores legacy packet UPDATE |
| SQL | `CREATE OR REPLACE` previous `guide_confirm_settlement` body from exported definition |
| Data | No migration of historical rows required — desync repair is separate ops task |

| State | Behavior |
|-------|----------|
| Bridge app + old RPC | **Works** — legacy path |
| Bridge app + atomic RPC | **Works** — atomic path |
| Bridge app + reverted SQL (old RPC) | **Works** — legacy path |
| Non-bridge atomic app + old RPC | **Breaks** — do not deploy |
| Old app + atomic SQL (no bridge) | **Breaks** — packet UPDATE sees 0 rows |

### 11. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| RPC SQL not in repo | Export from production before writing migration |
| `enforce_settlement_workflow` blocks RPC writes | RPC runs as SECURITY DEFINER; verify trigger allows guide `guide_confirmed_at` on `pending_guide_confirmation` (existing path) |
| Double-write during rollout | Bridge app skips duplicate UPDATE when RPC is atomic; legacy path safe on old RPC |
| Orphan snapshots (pre-RPC) | Accept in Phase 1; optional cleanup job later |
| Audit gap if audit stays in app | Phase 2 move audit into RPC; Phase 1 accept rare audit-only failure |
| Admin calling RPC | Reject via `auth_user_is_guide()` + ownership |

---

## Snapshot placement — Options A / B / C

| Option | Description | Pros | Cons | Risk |
|--------|-------------|------|------|------|
| **A** | App creates snapshot, passes `p_snapshot_id` to RPC | App keeps payload assembly; RPC verifies snapshot exists | Still 2 round-trips; snapshot orphan if RPC fails | Medium |
| **B** | RPC creates snapshot internally | Fully atomic including audit trail | Large RPC; duplicates app payload logic; harder to test | High |
| **C (recommended Phase 1)** | App creates snapshot; RPC atomizes settlement + packet only | Smallest diff; fixes main desync; mirrors current app split | Snapshot still outside transaction | **Low** |

**Phased recommendation:**

- **Phase 1 (Option C):** Atomic settlement + confirmation packet in RPC.
- **Phase 2 (optional):** Move `settlement_audit_events` insert into RPC (like `admin_send_for_confirmation`).
- **Phase 3 (optional):** Pass `p_snapshot_id` into RPC for referential validation; consider NOT creating snapshot inside RPC unless audit requires it.

---

## Part D — Comparison with `admin_send_for_confirmation`

### What to copy

| Pattern | Apply to guide confirm |
|---------|------------------------|
| `SECURITY DEFINER` + `SET search_path = public` | Yes |
| `auth.uid()` authentication check | Yes |
| `FOR UPDATE` on settlement before writes | Yes |
| `GET DIAGNOSTICS` row count = 1 enforcement | Yes |
| JSONB return `{ ok: true, ... }` | Yes |
| Single transaction for related workflow rows | Yes |
| `REVOKE ALL` + `GRANT EXECUTE TO authenticated` | Yes |

### What not to copy

| Pattern | Reason |
|---------|--------|
| `p_actor_id` + actor mismatch check | Guide RPC uses `auth.uid()` directly (no impersonation) |
| `auth_user_can_access_settlement` | Too broad — includes admin tier |
| Admin tier role check | Guide-only operation |
| Multi-table field_changes insert | Not part of guide confirm |
| Status transition on settlement | Guide confirm leaves status unchanged |
| `p_from_status` parameter | Guide confirm has single valid state |

### Guide ownership vs admin access

| | Admin send-for-confirmation | Guide confirm |
|--|---------------------------|---------------|
| Caller | Admin tier | Guide only |
| Access check | `auth_user_is_admin_tier()` + `auth_user_can_access_settlement` | `guide_id = auth.uid()` |
| Region | App-layer `requireAdminSettlementRegionAccess` | Not needed |
| Writes | settlement status → `pending_guide_confirmation`, new packet | settlement flags only, confirm existing packet |

### Branch/region checks

**Not required in RPC** for guide confirm. Guide can only confirm own settlements (`guide_id = auth.uid()`). RLS on reads already scopes guide views.

---

## Part E — Proposed test plan (design only)

### Unit / source-level tests

1. Assigned guide can confirm active pending confirmation.
2. Non-assigned guide cannot confirm (`assertGuideConfirmAction`).
3. Admin cannot call guide confirm (RPC rejects `auth_user_is_guide()`).
4. Settlement not in `pending_guide_confirmation` cannot be confirmed.
5. Already confirmed settlement cannot be confirmed twice (`guide_confirmed_at` guard + RPC).
6. Missing `active_confirmation_id` fails (app pre-check + RPC).
7. Missing pending confirmation packet fails.
8. RPC success updates **both** settlement and confirmation packet (integration/behavioral).
9. RPC failure updates **neither** (transaction rollback).
10. App **no longer** performs `settlement_confirmations` UPDATE outside RPC.
11. Admin detail shows 지급완료 처리 after successful guide confirm (`canAdminPaySettlement`).
12. `isStuckGuideConfirmation` becomes fallback-only / monitoring — not primary path.

### E2E tests (extend existing)

- `e2e/guide-confirmation-integrity.spec.ts` — assert packet `confirmed` in same request flow
- `e2e/prod-smoke.spec.ts` — post-confirm admin pay visibility

### SQL verification script (to add)

`supabase/verify_guide_confirm_settlement_atomic.sql`:

- Function exists, SECURITY DEFINER
- Body contains `UPDATE settlement_confirmations` + `guide_confirmed_at`
- Body contains guide ownership check
- No admin-tier bypass without ownership

---

## Part F — Implementation recommendation

| Question | Answer |
|----------|--------|
| App-only change sufficient? | **No** — root cause is split transaction across RPC + app UPDATE |
| SQL migration required? | **Yes** — extend `guide_confirm_settlement` |
| Lowest-risk phased approach | **Option C Phase 1** → optional audit/snapshot phases later |
| Production RPC definition obtained? | **No** (no DB URL); behavioral inference only |
| DB policies obtained? | **Partial** — from repo SQL, not live `pg_policies` |
| Code changed besides this doc? | **Only** `docs/guide-confirmation-atomicity-plan.md` (at design time) |
| Commit / push / deploy? | **No** (at design time) |
| Destructive SQL run? | **No** |

---

## Implementation notes (bridge + Phase 1 — local, not deployed)

| Artifact | Path |
|----------|------|
| Bridge classifier | `src/lib/settlement/guide-confirm-rpc-bridge.ts` |
| Atomic RPC migration (**unchanged in bridge step**) | `supabase/settlement_workflow_v1_guide_confirm_atomic_rpc.sql` |
| Read-only verify script | `supabase/verify_guide_confirm_settlement_atomic.sql` |
| App change | `guideConfirm()` — bridge legacy/atomic paths; read-back verify; audit app-side |
| Tests | `guide-confirm-atomic.test.ts`, `guide-confirm-admin-pay.test.ts`, `settlement-audit-fixes.test.ts` |

**Rollout order:** Phase A bridge app → Phase B staging SQL + verify → production SQL (separate approval) → Phase C optional legacy cleanup.

**RLS policy hardening** (`settlement_confirmations_guide_update` is not strictly guide-only) deferred to a separate migration; SECURITY DEFINER RPC owns packet confirm writes when atomic SQL is applied.

### Recommended implementation order

1. Export production `guide_confirm_settlement` → commit SQL baseline to `supabase/` (if not already)
2. Deploy **bridge app** to production (Phase A — no SQL)
3. Apply atomic RPC on staging + verify script + manual smoke (Phase B)
4. Apply atomic RPC on production after explicit approval (Phase B)
5. Monitor; optionally remove legacy fallback (Phase C)
6. (Later) Payment ledger, guide confirm Phase 2 audit-in-RPC

## Appendix — Bridge `guideConfirm()` write sequence (implemented)

```
READ  settlements_guide_read          (status, guide_id, active_confirmation_id, guide_confirmed_at)
READ  settlement_confirmations_guide_read (snapshot_after_id, status=pending)
READ  settlement_snapshots_guide_read (payload_json)
WRITE settlement_snapshots INSERT     (kind=guide_confirmed)     ← outside RPC txn
RPC   guide_confirm_settlement        (p_settlement_id, p_confirmed_at)
BRIDGE resolveGuideConfirmRpcBridge
  legacy: WRITE settlement_confirmations UPDATE (status=confirmed, pending guard)
  atomic: (skip — RPC already confirmed packet)
READ  settlements_guide_read          (verify guide_confirmed_at/by)
READ  settlement_confirmations        (verify status=confirmed, confirmed_by)
WRITE settlement_audit_events INSERT  (guide_confirm)
```

---

## Appendix — Target RPC return shape

```json
{
  "ok": true,
  "settlement_id": "uuid",
  "status": "pending_guide_confirmation",
  "guide_confirmed_at": "2026-06-12T08:28:51.437+00:00",
  "confirmation_id": "uuid",
  "confirmation_status": "confirmed"
}
```

When `confirmation_id` and `confirmation_status` are present and match the active packet, the bridge app treats the RPC as **atomic** and skips the legacy app-side packet UPDATE.
