/** Accordion sections hidden from guide (and guide preview) settlement forms. */
export const GUIDE_HIDDEN_ACCORDION_SECTION_IDS = ['adjustments', 'summary'] as const

export type GuideHiddenAccordionSectionId = (typeof GUIDE_HIDDEN_ACCORDION_SECTION_IDS)[number]

export function shouldShowAdminSettlementSections(
  isAdmin: boolean,
  isAdminReview: boolean,
): boolean {
  return isAdmin || isAdminReview
}

export function filterAccordionSectionsForGuide<T extends { id: string; title?: string }>(
  sections: T[],
  showAdminSections: boolean,
): T[] {
  if (showAdminSections) return sections
  const hidden = new Set<string>(GUIDE_HIDDEN_ACCORDION_SECTION_IDS)
  return sections.filter((s) => !hidden.has(s.id))
}

/** Guardrail: guide-visible section titles must not expose company-review copy. */
export function assertNoGuideHiddenSectionCopy<T extends { id: string; title?: string }>(
  sections: T[],
): void {
  for (const section of sections) {
    const title = section.title ?? ''
    if (title.includes('회사 확인')) {
      throw new Error(`Guide form must not show section title: ${title}`)
    }
    if (title.includes('정산내역 (최종)')) {
      throw new Error(`Guide form must not show section title: ${title}`)
    }
  }
}
