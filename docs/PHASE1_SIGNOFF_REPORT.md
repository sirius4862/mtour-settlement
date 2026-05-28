# Phase 1 sign-off report

**Date:** 2026-05-27  
**Scope:** Excel-based settlement stabilization only (no Phase 2/3)  
**Test plan:** [`PHASE1_TEST_SCENARIO.md`](PHASE1_TEST_SCENARIO.md)

---

## Executive summary

Phase 1 **code stabilization and automated verification are complete**. Two UI/security bugs were fixed. Full browser E2E against live Supabase requires manual execution by guide + admin test accounts (steps documented in test scenario).

**Recommendation:** Run [`PHASE1_TEST_SCENARIO.md`](PHASE1_TEST_SCENARIO.md) sections B–C once with real accounts, then mark Phase 1 exit criteria in [`ROADMAP.md`](ROADMAP.md).

---

## Passed

| Area | Verification method | Result |
|------|---------------------|--------|
| **Unit tests** | `npm test` (31 tests) | ✅ Pass |
| **Production build** | `npm run build` | ✅ Pass |
| **Calc golden values** | `calc.test.ts` MOCK input | ✅ R85 = 258.5, R87 ≈ -328.88 |
| **Mapper round-trip** | `mappers.test.ts` | ✅ Form ↔ DB ↔ calc consistent |
| **Edit permission logic** | `permissions.test.ts` (new) | ✅ Owner + status rules |
| **Edit page guard** | Code audit `edit/page.tsx` | ✅ Non-editable statuses redirect to detail |
| **Server save guard** | `upsertSettlement` / `saveSettlementItems` | ✅ Only `draft`, `rejected`, `edit_requested` |
| **Server submit guard** | `submitSettlement` | ✅ Same editable statuses only |
| **Receipt upload guard** | `receiptActions.ts` | ✅ Uses `GUIDE_EDITABLE` |
| **Admin review actions** | `reviewSettlement` + `ReviewPanel` | ✅ Approve / reject / request edit / pay |
| **Admin review visibility** | `canReview` / `canReqEdit` / `canPay` | ✅ Submitted → approve/reject; approved → pay |
| **Past settlement list** | `/guide/settlements` | ✅ All guide settlements listed with status badges |
| **Test documentation** | `GUIDE_TESTING_GUIDE`, `test_seed.sql`, `PHASE1_TEST_SCENARIO` | ✅ Ready for manual run |

---

## Failed

| Item | Notes |
|------|-------|
| **Live browser E2E (guide + admin)** | Not executed in this session — requires logged-in Supabase sessions and real test accounts. Anon key cannot bypass RLS for automated DB writes. |

No automated test failures. No build failures.

---

## Fixed (this session)

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 1 | **Submit lock UI bug:** After guide submits from detail page, edit/submit buttons remained visible until manual full page reload | Call `router.refresh()` after successful `submitSettlement` | `src/app/guide/settlements/[id]/SubmitButton.tsx` |
| 2 | **Guide settlement isolation:** Guide could open another guide’s settlement detail if UUID was known | `notFound()` when `session.role === 'guide'` and `guide_id !== session.id` | `src/app/guide/settlements/[id]/page.tsx` |
| 3 | **Submit confirm copy mismatch:** Form said edits “may be restricted” after submit | Align message: “제출 후에는 수정할 수 없습니다” | `src/components/settlement/SettlementForm.tsx` |

---

## Remaining risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Manual E2E not yet run** on production Supabase | Medium | Run [`PHASE1_TEST_SCENARIO.md`](PHASE1_TEST_SCENARIO.md) B–C before Phase 2 |
| **Tour assignment** still uses `tours.guide_id` only; no server-side assignment table | Low (Phase 1 scope) | Phase 2 `tour_guide_assignments` |
| **`upsertSettlement` does not verify** guide owns tour beyond `guide_id` on tour row | Low | Phase 2 assignment guard |
| **Guide detail summary** uses inline arithmetic, not `calcSettlement()` | Low | Display-only; form/footer use `calc.ts` |
| **sessionStorage persist** on `/new` if user refreshes before navigating to `/edit` | Low | Test scenario uses `/edit` URL after save |
| **Admin/staff can view any settlement** via guide routes (by design) | Info | Acceptable for support; pure guides now isolated |

---

## Status transition verification (code-level)

| Transition | Guide edit? | Verified by |
|------------|:-----------:|-------------|
| `draft` → `submitted` | ❌ after submit | `submitSettlement`, edit redirect, SubmitButton refresh |
| `submitted` → `rejected` | ✅ | `GUIDE_EDITABLE`, `upsertSettlement` |
| `submitted` → `edit_requested` | ✅ | `reviewSettlement`, `GUIDE_EDITABLE` |
| `submitted` → `approved` | ❌ | edit redirect, `canGuideEdit` |
| `approved` → `paid` | ❌ | edit redirect, `canGuideEdit` |
| `rejected` → `submitted` | ❌ after resubmit | same as draft → submitted |

---

## Phase 1 exit criteria (ROADMAP)

| Criterion | Status |
|-----------|--------|
| Real guide: create → save → reload → submit | ⏳ Manual test pending |
| Real admin: review → approve/reject | ⏳ Manual test pending |
| DB workflow checklist on production | ⏳ Manual test pending |
| No open P0 save/reload/submit bugs | ✅ Code fixes applied; manual confirm pending |
| `npm test` + `npm run build` | ✅ Pass |

---

## Next steps

1. Run manual test: [`PHASE1_TEST_SCENARIO.md`](PHASE1_TEST_SCENARIO.md) (≈30 min, guide + admin browsers)
2. Mark ROADMAP Phase 1 exit criteria complete
3. **Do not start** Phase 2 (tour assignment) until sign-off confirmed

---

## Commands run

```bash
npm test    # 31 passed
npm run build    # success
```
