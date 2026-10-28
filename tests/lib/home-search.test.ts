import { describe, expect, it } from 'vitest'
import { homeSearchSchema, pageNumbers } from '~/lib/home-search'

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

  it('page는 2 이상의 정수만 남긴다 — 1페이지는 URL에 쓰지 않는다', () => {
    expect(homeSearchSchema.parse({ page: 3 }).page).toBe(3)
    expect(homeSearchSchema.parse({ page: 1 }).page).toBeUndefined()
    expect(homeSearchSchema.parse({ page: 'x' }).page).toBeUndefined()
    expect(homeSearchSchema.parse({ page: 2.5 }).page).toBeUndefined()
  })
})

describe('pageNumbers', () => {
  it('7쪽 이하면 전부 보인다', () => {
    expect(pageNumbers(1, 1)).toEqual([1])
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('처음·끝과 현재 양옆만 남기고 사이는 줄임표로 접는다', () => {
    expect(pageNumbers(1, 24)).toEqual([1, 2, '…', 24])
    expect(pageNumbers(12, 24)).toEqual([1, '…', 11, 12, 13, '…', 24])
    expect(pageNumbers(24, 24)).toEqual([1, '…', 23, 24])
  })

  it('한 칸만 비면 줄임표 대신 그 번호를 쓴다', () => {
    expect(pageNumbers(4, 24)).toEqual([1, 2, 3, 4, 5, '…', 24])
  })
})
