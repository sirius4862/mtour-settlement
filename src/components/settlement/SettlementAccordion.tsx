'use client'

import { useState, type ReactNode } from 'react'
import type { AnnotatedNumber } from '@/lib/settlement/types-calc'
import { SubtotalPreview } from './SectionSubtotal'

export interface AccordionSection {
  id: string
  title: string
  excelRows?: string
  preview?: AnnotatedNumber
  badge?: string
  children: ReactNode
  footer?: ReactNode
}

export function SettlementAccordion({ sections }: { sections: AccordionSection[] }) {
  const [openId, setOpenId] = useState<string>(sections[0]?.id ?? '')

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isOpen = openId === section.id
        return (
          <div
            key={section.id}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? '' : section.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[52px] active:bg-gray-50"
              aria-expanded={isOpen}
            >
              <span
                className={
                  'w-6 h-6 flex items-center justify-center rounded-lg text-xs font-bold shrink-0 ' +
                  (isOpen ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500')
                }
              >
                {isOpen ? '−' : '+'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{section.title}</span>
                  {section.excelRows && (
                    <span className="text-[10px] font-mono text-gray-400">{section.excelRows}</span>
                  )}
                  {section.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {section.badge}
                    </span>
                  )}
                </div>
              </div>
              {!isOpen && <SubtotalPreview field={section.preview} />}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 border-t border-gray-50">
                <div className="pt-4">{section.children}</div>
                {section.footer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
