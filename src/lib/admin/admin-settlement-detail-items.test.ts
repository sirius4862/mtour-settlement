import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const DETAIL_PAGE = readFileSync(join(ROOT, 'src/app/admin/settlements/[id]/page.tsx'), 'utf8')

describe('admin settlement detail item tables', () => {
  it('renders entrance items when entrances exist', () => {
    expect(DETAIL_PAGE).toContain('entrances.length > 0')
    expect(DETAIL_PAGE).toContain('<ItemTable title="입장료"')
    expect(DETAIL_PAGE).toContain('e.attraction_name')
    expect(DETAIL_PAGE).toContain('e.visit_date')
    expect(DETAIL_PAGE).toContain('e.amount_vnd')
  })

  it('keeps existing meals, shopping, options, and other expense tables', () => {
    expect(DETAIL_PAGE).toContain('<ItemTable title="식사비"')
    expect(DETAIL_PAGE).toContain('<ItemTable title="쇼핑 수익"')
    expect(DETAIL_PAGE).toContain('<ItemTable title="옵션 수익"')
    expect(DETAIL_PAGE).toContain('<ItemTable title="기타지출"')
    expect(DETAIL_PAGE).toContain('m.restaurant_name')
    expect(DETAIL_PAGE).toContain('sh.shop_name')
    expect(DETAIL_PAGE).toContain('op.option_name')
    expect(DETAIL_PAGE).toContain('o.description')
  })

  it('uses conditional rendering so empty entrances do not break the page', () => {
    expect(DETAIL_PAGE).toMatch(/entrances\.length > 0 && <ItemTable title="입장료"/)
  })

  it('does not change calculation summary wiring', () => {
    expect(DETAIL_PAGE).toContain('calcSettlement(toCalcInput(stateFromSettlementFull(data')
    expect(DETAIL_PAGE).toContain('<SettlementBusinessSummary calc={calc} audience="admin" />')
    expect(DETAIL_PAGE).not.toContain('entrances.map(e => e.amount_vnd).reduce')
  })
})
