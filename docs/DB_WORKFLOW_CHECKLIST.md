# DB Workflow Test Checklist

Manual verification for the Excel-based settlement flow against Supabase.
Run after each deployment or major save/load change.

## Prerequisites

- [ ] `.env.local` has valid `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] **RLS migration applied:** run [`supabase/settlement_status_logs_rls_migration.sql`](../supabase/settlement_status_logs_rls_migration.sql) in Supabase SQL Editor (fixes guide save/submit `settlement_status_logs` policy error)
- [ ] Logged in as a **guide** user with `branch_id` set in `profiles`
- [ ] At least one **tour** assigned to the guide (start_date within last 90 days, no existing settlement)
- [ ] Logged in as **admin/staff** in a separate session for review steps

---

## 1. New settlement + draft save

Route: `/guide/settlements/new`

| Step | Action | Expected DB / UI |
|------|--------|------------------|
| 1.1 | Select tour, set Q2, A76, D79 | Form shows tour metadata |
| 1.2 | Add rows in hotels, meals, shopping, options | Row calcs update live |
| 1.3 | Click **임시저장** | No validation errors |
| 1.4 | Check Supabase `settlements` | New row: `status=draft`, header fields match form |
| 1.5 | Check `hotel_items` … `option_items` | Rows for `settlement_id`; soft-deleted rows absent |
| 1.6 | Verify computed columns | `company_amount_usd`, `amount_vnd`, `com_usd` match `calc.ts` |
| 1.7 | Footer shows **저장됨** | `settlementId` set in store |

### SQL spot-check

```sql
SELECT id, status, tour_id, exchange_rate, tour_fee_usd, advance_vnd
FROM settlements ORDER BY created_at DESC LIMIT 1;
```

---

## 2. Reopen draft (edit reload)

Route: `/guide/settlements/[id]/edit`

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open edit URL for saved draft | Form loads from DB (not stale session draft) |
| 2.2 | Header fields | Match `settlements` row |
| 2.3 | Line item rows | Count and values match DB (`sort_order` order) |
| 2.4 | Other expense D×E×F checkbox | Matches `other_expense_items.is_tip` |
| 2.5 | Final summary R85 / R87 | Same as before save |
| 2.6 | Change field → save → reload edit | Change persisted |

---

## 3. calcSettlement consistency after reload

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Note R85 and R87 before save | Record values |
| 3.2 | Save draft | Success |
| 3.3 | Reload edit page | R85 and R87 unchanged (within $0.01) |

Automated: `npm test` → `mappers.test.ts` round-trip test.

---

## 4. Submit

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Fill tour fee + ≥1 line item | Validation passes |
| 4.2 | Click **제출하기** | Redirect to detail |
| 4.3 | `settlements.status` | `submitted` |
| 4.4 | `/edit` route | Redirects to read-only detail |

---

## 5. Admin review

Route: `/admin/settlements` → `/admin/settlements/[id]`

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Submitted settlement in list | Status **제출됨** |
| 5.2 | Open detail | Line items + summary visible |
| 5.3 | Review panel | Approve / Reject / Request edit |
| 5.4 | Approve | `status=approved` |

---

## Write paths (reference)

```
saveSettlementDraft
  ├─ upsertSettlement → settlements
  └─ saveSettlementItems → hotel_items, meal_items, entrance_items,
                           other_expense_items, shopping_items, option_items

submitSettlement
  └─ UPDATE settlements SET status='submitted'
```

---

## Related docs

- **Current priorities & future roadmap:** [`ROADMAP.md`](ROADMAP.md)
- **Non-developer test guide (sample tour + exact inputs):** [`GUIDE_TESTING_GUIDE.md`](GUIDE_TESTING_GUIDE.md)
- **Supabase seed + verify SQL:** [`supabase/test_seed.sql`](../supabase/test_seed.sql)

> **Scope note:** Tour assignment and vehicle company workflows are approved for a later phase. Do not implement them during Phase 1 stabilization. See [`ROADMAP.md`](ROADMAP.md).

## Regression

```bash
npm test
npm run build
```
