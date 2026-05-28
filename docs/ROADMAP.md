# Product roadmap

This document separates **what we are doing now** from **approved future work**.  
Do not start Phase 2 or Phase 3 until Phase 1 exit criteria are met.

**Guide-centric workflow (approved):** see [`PRODUCT_WORKFLOW.md`](PRODUCT_WORKFLOW.md) for screens, permissions, status transitions, and page-level change plan.

---

## Phase 1 — Current priority (NOW)

**Goal:** Production-stable Excel-based settlement for guides and admins.

### Focus areas

| # | Area | What “done” looks like |
|---|------|-------------------------|
| 1 | Excel settlement workflow | Form matches template; R85/R87 match `calc.ts` golden test |
| 2 | Real guide testing | Follow [`GUIDE_TESTING_GUIDE.md`](GUIDE_TESTING_GUIDE.md) end-to-end on Supabase |
| 3 | Admin review testing | Submit → review → approve/reject/request edit via `/admin/settlements` |
| 4 | Save/reload consistency | Draft save → edit reload → values and calc unchanged |
| 5 | Production stability | `npm test` + `npm run build` pass; no auth/middleware regressions |

### Active test assets

- [`PHASE1_TEST_SCENARIO.md`](PHASE1_TEST_SCENARIO.md) — Phase 1 manual E2E script (guide + admin)
- [`PHASE1_SIGNOFF_REPORT.md`](PHASE1_SIGNOFF_REPORT.md) — Stabilization sign-off (passed/failed/fixed/risks)
- [`GUIDE_TESTING_GUIDE.md`](GUIDE_TESTING_GUIDE.md) — non-developer guide test (exact inputs, R85/R87)
- [`DB_WORKFLOW_CHECKLIST.md`](DB_WORKFLOW_CHECKLIST.md) — developer DB verification
- [`supabase/test_seed.sql`](../supabase/test_seed.sql) — sample tour seed + SQL checks

### Explicitly out of scope (Phase 1)

- Vehicle company role, routes, or claims
- Tour assignment junction tables / admin tour UI
- Changes to `src/lib/settlement/calc.ts` or Excel formulas
- New settlement fields that alter R85/R87 semantics
- Auth/middleware redesign

### Phase 1 exit criteria (before Phase 2)

- [ ] At least one real guide completes: create → draft save → reload → submit
- [ ] At least one admin completes: review → approve or reject with reason
- [ ] Save/reload checklist in `DB_WORKFLOW_CHECKLIST.md` passes on production Supabase
- [ ] Known issues from guide/admin testing documented and triaged
- [ ] No open P0 bugs in settlement save, reload, or submit

---

## Phase 2 — Tour assignment (APPROVED, DEFERRED)

**Status:** Architecture approved. **Do not implement until Phase 1 exit criteria are met.**

See [`PRODUCT_WORKFLOW.md`](PRODUCT_WORKFLOW.md) §1 (guide screens), §4 (permissions), §7 (page changes).

### Business workflow (target)

1. Admin creates tours
2. Admin assigns guide(s) to tours
3. Guides only see assigned tours
4. Guides create settlements only for assigned tours

### Minimal DB plan (additive, non-breaking)

```text
tour_guide_assignments
  tour_id, guide_id, assigned_by, assigned_at
  UNIQUE (tour_id, guide_id)
```

- Keep `tours.guide_id` for legacy data; backfill junction table from existing rows
- Add server-side assignment check in `upsertSettlement()` (today: tour exists only)
- RLS: guides SELECT tours via assignment join

### App plan (summary)

| Layer | Change |
|-------|--------|
| Admin | `/admin/tours` — create tour, assign guides |
| Guide | `getAvailableTours()` joins assignments |
| Settlement | Assignment guard on save; settlement tables unchanged |
| Calc | **No changes** |

### Phase 2 prerequisites

- Phase 1 exit criteria complete
- Real operational feedback: “guides picking wrong tours” confirmed as blocker
- Migration SQL reviewed (`tour_guide_assignments` + backfill + RLS)

---

## Phase 3 — Vehicle company workflow (APPROVED, DEFERRED)

**Status:** Architecture approved. **Do not implement until Phase 2 is live and verified.**

See [`PRODUCT_WORKFLOW.md`](PRODUCT_WORKFLOW.md) §2–§5 (admin/vehicle screens, status machines).

### Business workflow (target)

1. Admin creates tour
2. Admin assigns guide **and** vehicle company
3. Vehicle company enters route / itinerary / planned cost
4. Guide approves route after operation
5. Vehicle company submits cost claim (only after route approval)
6. Admin approves or rejects claim
7. Approved claim syncs into **existing** settlement fields (not new formulas)

### Role addition

- New role: `vehicle_company`
- New app area: `/vehicle/*` (separate from guide settlement UI)
- `staff` continues to act like admin for claim review (MVP)

### Minimal DB plan (additive)

```text
vehicle_companies
profiles.vehicle_company_id          (nullable FK)

tour_vehicle_assignments
  tour_id, vehicle_company_id, assigned_by, assigned_at

vehicle_routes
  tour_id, vehicle_company_id, itinerary_json, status
  status: draft → pending_guide_approval → guide_approved | guide_rejected

vehicle_claims
  tour_id, vehicle_route_id, base_cost_usd/vnd, extra_cost_usd/vnd, status
  status: draft → submitted → approved | rejected

settlements (optional link columns, Phase 3 only)
  vehicle_route_id, vehicle_claim_id, vehicle_cost_locked
```

### Settlement integration (no calc.ts changes)

Approved claim amounts sync via **mapper / server layer** into fields that already exist:

| Approved claim | Existing settlement field | Excel ref | Calc impact |
|----------------|---------------------------|-----------|-------------|
| `base_cost_usd` | `settlements.vehicle_fee_usd` | O79 | O84 → H85 → R85/R86 |
| `extra_cost_usd` + `extra_cost_vnd` | `option_items` row (`is_extra_vehicle=true`) | S75 | R87 |

`calcSettlement()` remains the single calculation source. No new formulas.

### Phase 3 prerequisites

- Phase 2 tour assignment live and verified in production
- Settlement save/reload stable under real guide usage
- Vehicle cost mapping rules confirmed with operations (base vs extra split)
- Migration SQL reviewed before any app code

---

## Cross-phase constraints (always)

| Rule | Reason |
|------|--------|
| Do not change `calc.ts` without explicit approval | Excel is source of truth |
| Do not break existing `settlements` rows | Production data |
| Do not change auth/middleware patterns casually | Edge-safe JWT-only middleware |
| Additive DB migrations only | Backfill + rollback path |
| New roles get layout guards, not middleware DB calls | Match current architecture |

---

## Implementation order (when ready)

```text
Phase 1  ──►  stabilize + test (NOW)
    │
    ▼
Phase 2  ──►  tour assignment SQL + admin UI + guide filter + save guard
    │
    ▼
Phase 3  ──►  vehicle companies + routes + claims + settlement sync
```

**Next artifact when Phase 2 starts:** `supabase/tour_assignments_migration.sql`  
**Next artifact when Phase 3 starts:** `supabase/vehicle_workflow_migration.sql`

Neither file should be applied to production until Phase 1 exit criteria are signed off.

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [`PRODUCT_WORKFLOW.md`](PRODUCT_WORKFLOW.md) | Guide-centric screens, permissions, statuses, page plan |
| [`GUIDE_TESTING_GUIDE.md`](GUIDE_TESTING_GUIDE.md) | Phase 1 guide E2E test |
| [`DB_WORKFLOW_CHECKLIST.md`](DB_WORKFLOW_CHECKLIST.md) | Phase 1 DB verification |
| This file | Priorities + deferred architecture |
