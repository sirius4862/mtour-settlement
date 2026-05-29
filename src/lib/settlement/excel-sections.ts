/** Excel sheet "정산서양식" — section metadata for guide UX. */
export const EXCEL_SECTIONS = {
  basic: {
    rows: 'R1–4, Q2, A76',
    hint: '투어 정보·환율(Q2)·전도금(A76)을 입력합니다.',
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
    hint: '현장에서 발생한 기타 비용 — 항목명과 USD/₫ 금액을 직접 입력합니다. (주차, 통행료, 팁, 포터 등)',
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
    rows: 'O79–81, O82+, R77, R80, R82, ground_fee',
    hint: '투어피/지상비(회사 수익), 고정 회사 지출(O79–81), 회사 비용(자유 입력), 메꾸기(R80), 가이드일비(R82). R77은 참고 전용.',
  },
  summary: {
    rows: 'R77–R87',
    hint: '정산 요약 — COM 기준 분배·밸런스·최종 금액. 감사용 Excel 매트릭스는 admin 화면에서 펼쳐 확인.',
  },
  receipts: {
    rows: '—',
    hint: '항목별 영수증 첨부 (웹 전용).',
  },
} as const

export type ExcelSectionId = keyof typeof EXCEL_SECTIONS
