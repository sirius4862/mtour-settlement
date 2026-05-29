/** Excel sheet "정산서양식" — section metadata for guide UX. */
export const EXCEL_SECTIONS = {
  basic: {
    rows: 'R1–4, Q2, A76, D79',
    hint: '투어 정보·환율(Q2)·전도금(A76)·투어피(D79, 회사 선지급·Q75 차감)를 입력합니다.',
  },
  hotels: {
    rows: 'R6–12',
    hint: '호텔별 SGL(F)·TWN(H)·TRP(J), 박수(E), 단가(M/O), 회사결재(P), 가이드결재(R)를 입력합니다.',
  },
  meals: {
    rows: 'R14–25',
    hint: '식사비 = 인원(E) × 단가(F). 합계는 J24(₫) → J25($)로 환산됩니다.',
  },
  entrances: {
    rows: 'R27–38',
    hint: '입장료 = 인원 × 단가(₫). 합계 J37 → J38($).',
  },
  others: {
    rows: 'R40–53',
    hint: '기타지출: $는 D×E×F 또는 E×F, ₫는 O×P. 합계 J53 = H52 + R52/Q2.',
  },
  shopping: {
    rows: 'R55–72 (B–H)',
    hint: '쇼핑 SALE(D)는 참고, 정산수익 D80은 COM(F)만 반영. KB(H)는 회사수익(R87)에 가산.',
  },
  options: {
    rows: 'R55–73 (J–S)',
    hint: '옵션 판매(O=M×N), 지출(P/Q), COM(S72=O72−Q72−P72). 추가차량비는 R71.',
  },
  cash: {
    rows: 'R74–76',
    hint: '입금 정리: D75/F75/P75 입력 → J75/N75/Q75 자동 계산.',
  },
  tc: {
    rows: 'H83, J83',
    hint: 'T/C 정산 가이드분(H83)·회사분(J83).',
  },
  adjustments: {
    rows: 'O79–81, R77, R80, R82, ground_fee',
    hint: '지상비(회사 수익), 차량비·인두세·서울영업비(회사 지출), 메꾸기(R80), 가이드일비(R82). R77은 참고 전용.',
  },
  summary: {
    rows: 'R77–R87',
    hint: '정산내역 매트릭스 — D79(투어피)는 회사 선지급·Q75 차감 표시, R87 미포함.',
  },
  receipts: {
    rows: '—',
    hint: '항목별 영수증 첨부 (웹 전용).',
  },
} as const

export type ExcelSectionId = keyof typeof EXCEL_SECTIONS
