# Settlement save — header upsert investigation (report-only)

**Phase:** Low-risk fixes only — **no skip implemented.**

## Question

On a no-change guide draft re-save (edit path), does `upsertSettlement` still run every time?

## Finding: **Yes — confirmed**

On every `saveSettlementDraft` call with `payload.settlementId`:

1. `loadSettlementCore` loads the settlement header (for editability + admin field preservation).
2. `buildGuideHeaderUpsertFromDraft` builds the header patch from the draft payload.
3. `upsertSettlement(headerUpsertInput)` runs **in parallel** with `loadSettlementLineItemRows` via `Promise.all`.
4. `upsertSettlement` always executes `.update(row)` when `payload.id` is set — there is **no** unchanged-header diff or skip.

Relevant code: `src/lib/actions/settlementActions.ts` (`saveSettlementDraft` edit branch, `upsertSettlement`).

## Cost on no-change save

- One Supabase `settlements` UPDATE per save (plus internal `tours` SELECT for branch/year_month validation inside `upsertSettlement`).
- Timed as `upsert_settlement_header` (~headerMs). On the edit path this step overlaps `load_existing_settlement` and is now marked `overlappedWith: 'load_existing_settlement'` in debug timings.

## Recommendation (report-only — do not implement yet)

**Candidate:** Skip header UPDATE when normalized draft header fields match pre-loaded `coreLoad.settlement`.

**Before enabling skip, prove:**

| Concern | Requirement |
|--------|-------------|
| `updated_at` | Product expects touch on every save, or UI relies on fresh timestamp |
| Save status UI | `markSaved` / footer “저장됨” still updates correctly without header write |
| Duplicate guard | Create path `findExistingSettlementForTour` unchanged |
| Admin/guide behavior | `buildGuideHeaderUpsertFromDraft` + `pickAdminHeaderFields` preserved fields not accidentally frozen |
| Status gates | `.in('status', ['draft', 'rejected', 'edit_requested'])` still enforced when real changes exist |

**Suggested approach when ready:**

1. Compare only guide-writable header fields + `exchange_rate` (not admin-strict fields from DB).
2. If equal, skip `upsertSettlement` on edit path; still run parallel line-item pre-load.
3. Add tests for: unchanged skip, changed header still updates, create path unchanged, rejected/edit_requested paths.

## Risk if skipped prematurely

- Stale `updated_at` in admin lists.
- Missing write when subtle normalization differs (null vs 0).
- Regression in duplicate-tour protection on create path if logic is merged incorrectly.
