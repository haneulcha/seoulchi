import { describe, expect, it } from 'vitest'
import { eventItemSchema, itemSchema, placeItemSchema } from '~/types/item'

const validEvent = {
  id: 'sc-12345',
  source: 'seoul-culture' as const,
  kind: 'event' as const,
  title: '서울시립미술관 특별전',
  category: '전시/미술',
  place: '서울시립미술관',
  startDate: '2026-08-10',
  endDate: '2026-08-16',
}

describe('eventItemSchema', () => {
  it('최소 필수 필드만으로 통과한다', () => {
    expect(eventItemSchema.parse(validEvent)).toMatchObject({ id: 'sc-12345' })
  })

  it('콜론이 들어간 id를 거부한다', () => {
    // 상세 라우트 /e/[id]에 인코딩 없이 들어가야 하므로
    expect(() => eventItemSchema.parse({ ...validEvent, id: 'seoul-culture:12345' })).toThrow()
  })

  it('sc- 또는 vs- 접두사가 없는 id를 거부한다', () => {
    expect(() => eventItemSchema.parse({ ...validEvent, id: '12345' })).toThrow()
  })

  it('날짜 형식이 YYYY-MM-DD가 아니면 거부한다', () => {
    expect(() => eventItemSchema.parse({ ...validEvent, startDate: '2026/08/10' })).toThrow()
  })
})

describe('placeItemSchema', () => {
  const validPlace = {
    id: 'vs-KOPsrn1p5',
    source: 'visit-seoul' as const,
    kind: 'place' as const,
    title: '서울역사박물관',
    category: '문화관광',
    place: '서울역사박물관',
  }

  it('hours가 null이어도 통과한다 (파싱 실패를 표현)', () => {
    expect(placeItemSchema.parse({ ...validPlace, hours: null }).hours).toBeNull()
  })

  it('startDate를 요구하지 않는다', () => {
    expect(() => placeItemSchema.parse(validPlace)).not.toThrow()
  })
})

describe('itemSchema (판별 유니온)', () => {
  it('kind로 분기한다', () => {
    const parsed = itemSchema.parse(validEvent)
    expect(parsed.kind).toBe('event')
  })

  it('알 수 없는 kind를 거부한다', () => {
    expect(() => itemSchema.parse({ ...validEvent, kind: 'venue' })).toThrow()
  })
})
