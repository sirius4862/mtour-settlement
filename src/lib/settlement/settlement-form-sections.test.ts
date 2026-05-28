import { describe, expect, it } from 'vitest'
import {
  GUIDE_HIDDEN_ACCORDION_SECTION_IDS,
  assertNoGuideHiddenSectionCopy,
  filterAccordionSectionsForGuide,
  shouldShowAdminSettlementSections,
} from './settlement-form-sections'

const mockSections = [
  { id: 'basic', title: '기본정보' },
  { id: 'cash', title: '입금 정리' },
  { id: 'guide-adjustments', title: '메꾸기·가이드 일비' },
  { id: 'adjustments', title: '회사 확인 항목' },
  { id: 'summary', title: '정산내역 (최종)' },
  { id: 'receipts', title: '영수증' },
]

describe('filterAccordionSectionsForGuide', () => {
  it('hides adjustments and summary for guide', () => {
    const visible = filterAccordionSectionsForGuide(mockSections, false)
    expect(visible.map((s) => s.id)).toEqual(['basic', 'cash', 'guide-adjustments', 'receipts'])
    expect(GUIDE_HIDDEN_ACCORDION_SECTION_IDS).toEqual(['adjustments', 'summary'])
  })

  it('keeps all sections for admin', () => {
    expect(filterAccordionSectionsForGuide(mockSections, true).map((s) => s.id)).toEqual(
      mockSections.map((s) => s.id),
    )
  })

  it('guide-visible sections have no company-review titles', () => {
    const visible = filterAccordionSectionsForGuide(mockSections, false)
    expect(() => assertNoGuideHiddenSectionCopy(visible)).not.toThrow()
  })
})

describe('shouldShowAdminSettlementSections', () => {
  it('is true for admin or admin review edit', () => {
    expect(shouldShowAdminSettlementSections(true, false)).toBe(true)
    expect(shouldShowAdminSettlementSections(false, true)).toBe(true)
    expect(shouldShowAdminSettlementSections(false, false)).toBe(false)
  })
})
