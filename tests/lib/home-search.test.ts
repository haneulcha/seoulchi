import { describe, expect, it } from 'vitest'
import { homeSearchSchema } from '~/lib/home-search'

describe('homeSearchSchema', () => {
  it('빈 search는 빈 객체다 — day 없음이 오늘이다', () => {
    expect(homeSearchSchema.parse({})).toEqual({})
  })

  it('유효한 조합을 그대로 통과시킨다', () => {
    expect(homeSearchSchema.parse({ day: 'weekend', group: '놀러 가기' })).toEqual({ day: 'weekend', group: '놀러 가기' })
  })

  it('잘못된 값은 던지지 않고 버린다', () => {
    expect(homeSearchSchema.parse({ group: '전시', day: 'yesterday' })).toEqual({ group: undefined, day: undefined })
  })

  it('걸으러 가기는 홈에 없는 칩이라 버린다', () => {
    expect(homeSearchSchema.parse({ group: '걸으러 가기' }).group).toBeUndefined()
  })
})
