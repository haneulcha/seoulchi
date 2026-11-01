import { describe, expect, it } from 'vitest'
import { parseMinPrice } from '~/lib/price'

describe('parseMinPrice', () => {
  it('금액 중 최저가를 돌려준다', () => {
    expect(parseMinPrice('열매(심화) 70,000원, 잎새(초급) 50,000원, 새싹(입문) 30,000원')).toBe(30000)
    expect(parseMinPrice('현장판매 15,000원, 사전예약 10,000원')).toBe(10000)
  })
  it('무료만 있으면 0, 금액이 있으면 금액이 이긴다', () => {
    expect(parseMinPrice('전석무료')).toBe(0)
    expect(parseMinPrice('청소년 무료, 일반 20,000원')).toBe(20000)
  })
  it('못 읽으면 중립', () => {
    expect(parseMinPrice('3만원')).toBeUndefined()
    expect(parseMinPrice(undefined)).toBeUndefined()
  })
})
