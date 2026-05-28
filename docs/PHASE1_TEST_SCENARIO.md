# Phase 1 — Real test scenario (existing Supabase)

Use this script for **manual browser testing** against your live Supabase project.  
No Phase 2/3 features — uses current `tours.guide_id` assignment model.

**Companion docs:** [`GUIDE_TESTING_GUIDE.md`](GUIDE_TESTING_GUIDE.md) (exact form values) · [`DB_WORKFLOW_CHECKLIST.md`](DB_WORKFLOW_CHECKLIST.md)

---

## A. Prepare data (SQL Editor)

Run in order. Replace email placeholders with your real accounts.

### A1. Verify guide account

```sql
SELECT id, email, full_name, role, branch_id
FROM profiles
WHERE email = 'YOUR_GUIDE_EMAIL@example.com';
```

**Pass criteria:** `role = guide`, `branch_id` IS NOT NULL.

If `branch_id` is null:

```sql
SELECT id, name FROM branches LIMIT 5;

UPDATE profiles SET branch_id = 'BRANCH-UUID-HERE'
WHERE email = 'YOUR_GUIDE_EMAIL@example.com';
```

### A2. Verify admin account

```sql
SELECT id, email, role FROM profiles
WHERE email = 'YOUR_ADMIN_EMAIL@example.com';
```

**Pass criteria:** `role IN ('admin', 'staff')`.

### A3. Ensure test tour exists (90-day window)

**Preferred:** Admin UI → [`/admin/tours/new`](/admin/tours/new) — fill all fields, select guide + branch, save.

**Or SQL** if UI insert fails (RLS):

```sql
SELECT id, tour_code, start_date, guide_id
FROM tours
WHERE guide_id = 'GUIDE-UUID-FROM-A1'
  AND start_date >= (CURRENT_DATE - INTERVAL '90 days')::date
ORDER BY start_date DESC;
```

If none, use [`supabase/test_seed.sql`](../supabase/test_seed.sql) STEP 2 (set `guide_id` to guide UUID).

### A4. Clean previous test run (optional)

```sql
-- Only if retesting same tour_code
DELETE FROM settlements
WHERE tour_id IN (SELECT id FROM tours WHERE tour_code = 'TEST-GUIDE-001');
```

---

## B. Guide workflow (Browser — guide session)

| # | Step | Route | Pass criteria |
|---|------|-------|---------------|
| B1 | Log in as guide | `/login` | Lands on `/guide` |
| B2 | Start new settlement | `/guide/settlements/new` | Tour list shows assigned tour(s) only |
| B3 | Select tour + enter values | Form | Use [`GUIDE_TESTING_GUIDE.md`](GUIDE_TESTING_GUIDE.md) Part B |
| B4 | Check live calc | Footer | R85 = **$258.50**, R87 = **-$328.88** |
| B5 | 임시저장 | Footer | “저장됨” appears |
| B6 | Copy settlement ID | SQL below | Row exists `status = draft` |

```sql
SELECT id, status, tour_id, exchange_rate, tour_fee_usd
FROM settlements
WHERE guide_id = 'GUIDE-UUID'
ORDER BY created_at DESC LIMIT 1;
```

| # | Step | Route | Pass criteria |
|---|------|-------|---------------|
| B7 | Reopen draft | `/guide/settlements/[id]/edit` | All fields match saved values |
| B8 | Reload page (F5) | Same URL | Values unchanged; R85/R87 unchanged |
| B9 | Change one field → save → F5 | Same URL | Change persisted |
| B10 | Submit | **제출하기** on form OR detail | Redirect to `/guide/settlements/[id]` |
| B11 | Verify read-only | Detail page | No “수정하기” / “정산서 제출” buttons |
| B12 | Block edit URL | `/guide/settlements/[id]/edit` | Redirects to detail (read-only) |

---

## C. Admin review (Browser — admin session, incognito)

| # | Step | Route | Pass criteria |
|---|------|-------|---------------|
| C1 | Open queue | `/admin/settlements?status=submitted` | Test settlement visible |
| C2 | Open detail | `/admin/settlements/[id]` | Line items + summary visible |
| C3 | Request edit | **수정 허용** | Status → `edit_requested` |
| C4 | Guide reopens edit | `/guide/settlements/[id]/edit` | Form editable again |
| C5 | Guide resubmits | Submit | Status → `submitted` |
| C6 | Admin rejects | **반려** + reason | Status → `rejected`; guide sees reason |
| C7 | Guide edits + resubmits | Edit → submit | Status → `submitted` |
| C8 | Admin approves | **승인** | Status → `approved` |
| C9 | Guide view only | `/guide/settlements/[id]` | No edit/submit buttons |
| C10 | Guide edit URL blocked | `/edit` | Redirects to detail |
| C11 | Admin marks paid | **지급 완료** | Status → `paid` |
| C12 | Past settlement list | `/guide/settlements` | All statuses visible; old rows open read-only |

### SQL status checks

```sql
SELECT id, status, submitted_at, reviewed_at, paid_at, reject_reason
FROM settlements
WHERE id = 'SETTLEMENT-UUID';
```

---

## D. Automated regression (developer)

```bash
npm test
npm run build
```

Expected: all tests pass, build succeeds.

---

## E. Quick pass/fail checklist

Copy and mark during test session:

```
[ ] B1–B6  New settlement + draft save
[ ] B7–B9  Save → reload consistency
[ ] B10–B12 Submit lock (no guide edit)
[ ] C3–C4  edit_requested → guide can edit
[ ] C6–C7  rejected → guide can edit + resubmit
[ ] C8–C10 approved → guide read-only
[ ] C11–C12 paid → guide read-only; history viewable
[ ] npm test + build pass
```

---

## F. Known Phase 1 limitations (not bugs)

- Tours filtered by `tours.guide_id` (Phase 2 will add assignment table)
- No vehicle route / claim workflow yet
- Live E2E requires real Supabase auth sessions (cannot fully automate without test credentials)
