-- =============================================================
-- M투어 정산 — 가이드 테스트용 샘플 투어
-- Supabase Dashboard → SQL Editor 에서 실행
--
-- ⚠️ 실행 전: 아래 STEP 1에서 가이드 계정 UUID를 확인하세요.
-- ⚠️ 같은 tour_code가 이미 있으면 INSERT 를 건너뛰세요.
-- =============================================================

-- ── STEP 1: 테스트 가이드 계정 확인 ─────────────────────────────
-- (로그인에 사용하는 이메일로 바꿔서 실행)
SELECT id AS guide_id, email, full_name, role, branch_id
FROM profiles
WHERE email = 'YOUR_GUIDE_EMAIL@example.com';

-- branch_id 가 NULL 이면 정산 저장이 실패합니다. 지사 UUID 확인:
SELECT id AS branch_id, name, code FROM branches LIMIT 5;

-- 필요 시 가이드에 지사 연결 (guide_id, branch_id 를 실제 값으로 교체):
-- UPDATE profiles SET role = 'guide', branch_id = 'BRANCH-UUID-HERE'
-- WHERE id = 'GUIDE-UUID-HERE';


-- ── STEP 2: 테스트 투어 1건 생성 ────────────────────────────────
-- start_date 는 오늘 기준 90일 이내여야 앱 목록에 표시됩니다.
-- 아래 guide_id, branch_id, created_by 를 STEP 1 결과로 교체하세요.

/*
INSERT INTO tours (
  tour_code,
  pattern,
  agency_name,
  start_date,
  end_date,
  nights,
  pax_count,
  vehicle_type,
  guide_id,
  tc_name,
  branch_id,
  created_by
) VALUES (
  'TEST-GUIDE-001',
  '[테스트] 다낭 3박4일',
  'M투어 테스트',
  '2026-05-01',
  '2026-05-04',
  3,
  18,
  '29인승',
  'GUIDE-UUID-HERE',
  '테스트TC',
  'BRANCH-UUID-HERE',
  'GUIDE-UUID-HERE'
);
*/

-- 생성 확인
SELECT id, tour_code, pattern, start_date, guide_id
FROM tours
WHERE tour_code = 'TEST-GUIDE-001';


-- ── STEP 3: (선택) 이전 테스트 정산 삭제 후 재테스트 ───────────
-- ⚠️ 영수증·항목이 함께 삭제됩니다. 테스트 DB에서만 사용하세요.

/*
DELETE FROM settlements
WHERE tour_id IN (SELECT id FROM tours WHERE tour_code = 'TEST-GUIDE-001');
*/


-- ── STEP 4: 정산 저장 후 검증 쿼리 ─────────────────────────────
-- settlement id 를 아래 '<SETTLEMENT_ID>' 에 붙여넣으세요.

-- 4-1. 헤더
SELECT id, status, tour_id, exchange_rate, advance_vnd, tour_fee_usd,
       charming_other_usd, tip_received_usd, settlement_ratio,
       tc_guide_usd, tc_company_usd, megugi_usd, guide_daily_fee_usd
FROM settlements
WHERE id = '<SETTLEMENT_ID>';

-- 4-2. 항목 개수
SELECT 'hotel_items' AS tbl, count(*) FROM hotel_items WHERE settlement_id = '<SETTLEMENT_ID>'
UNION ALL SELECT 'meal_items', count(*) FROM meal_items WHERE settlement_id = '<SETTLEMENT_ID>'
UNION ALL SELECT 'entrance_items', count(*) FROM entrance_items WHERE settlement_id = '<SETTLEMENT_ID>'
UNION ALL SELECT 'other_expense_items', count(*) FROM other_expense_items WHERE settlement_id = '<SETTLEMENT_ID>'
UNION ALL SELECT 'shopping_items', count(*) FROM shopping_items WHERE settlement_id = '<SETTLEMENT_ID>'
UNION ALL SELECT 'option_items', count(*) FROM option_items WHERE settlement_id = '<SETTLEMENT_ID>';

-- 4-3. 호텔 — company_amount_usd 기대값: 216, 84 (합 300)
SELECT hotel_name, nights, sgl_count, twn_count, trp_count,
       unit_price_sgl_usd, unit_price_trp_usd, company_amount_usd, guide_amount_usd, sort_order
FROM hotel_items
WHERE settlement_id = '<SETTLEMENT_ID>'
ORDER BY sort_order;

-- 4-4. 식사 — amount_vnd 기대값: 1530000, 2160000, 1140000
SELECT restaurant_name, pax, unit_price_vnd, amount_vnd, sort_order
FROM meal_items
WHERE settlement_id = '<SETTLEMENT_ID>'
ORDER BY sort_order;

-- 4-5. 쇼핑
SELECT shop_name, sale_usd, com_usd, kb_usd, sort_order
FROM shopping_items
WHERE settlement_id = '<SETTLEMENT_ID>'
ORDER BY sort_order;

-- 4-6. 옵션 — com_usd 기대값: 160, 80, 0(차량비 행)
SELECT option_name, unit_price_usd, pax, total_sale_usd,
       expense_usd, expense_vnd, com_usd, is_extra_vehicle, sort_order
FROM option_items
WHERE settlement_id = '<SETTLEMENT_ID>'
ORDER BY sort_order;

-- 4-7. tour_code 로 최근 정산 찾기
SELECT s.id, s.status, s.created_at, t.tour_code
FROM settlements s
JOIN tours t ON t.id = s.tour_id
WHERE t.tour_code = 'TEST-GUIDE-001'
ORDER BY s.created_at DESC
LIMIT 3;

-- 4-8. 제출 후 status 확인
SELECT id, status, submitted_at
FROM settlements
WHERE tour_id IN (SELECT id FROM tours WHERE tour_code = 'TEST-GUIDE-001')
ORDER BY created_at DESC;
