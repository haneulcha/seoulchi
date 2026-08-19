import { describe, expect, it } from 'vitest'
import { formatDateRange, formatUpdatedAt, formatWeekRange } from '~/lib/dates'

const TODAY = '2026-08-18'

describe('formatDateRange', () => {
  it('시작일과 종료일이 같으면 하루로 표기한다', () => {
    expect(formatDateRange('2026-08-15', '2026-08-15', TODAY)).toBe('8/15(토)')
  })

  it('다르면 범위로 표기한다', () => {
    expect(formatDateRange('2026-08-15', '2026-08-30', TODAY)).toBe('8/15(토) – 8/30(일)')
  })

  it('해를 넘는 범위도 요일이 맞는다', () => {
    expect(formatDateRange('2026-12-31', '2027-01-01', TODAY)).toBe('12/31(목) – 1/1(금)')
  })

  it('종료일이 오늘로부터 2년을 넘으면 상시로 표기한다 (원본 오타 방어)', () => {
    expect(formatDateRange('2026-08-01', '2626-08-08', TODAY)).toBe('상시')
    expect(formatDateRange('2026-08-01', '2099-12-31', TODAY)).toBe('상시')
  })

  it('정확히 2년 뒤는 상시가 아니다 — 초과만 상시다', () => {
    expect(formatDateRange('2026-08-01', '2028-08-18', TODAY)).toContain('8/18')
    expect(formatDateRange('2026-08-01', '2028-08-19', TODAY)).toBe('상시')
  })
})

describe('formatUpdatedAt', () => {
  it('ISO 순간을 KST로 바꿔 표기한다', () => {
    expect(formatUpdatedAt('2026-08-14T10:59:22.232Z')).toBe('8/14 19:59 갱신')
  })

  it('KST 변환이 날짜를 넘기는 경우', () => {
    expect(formatUpdatedAt('2026-08-14T16:30:00Z')).toBe('8/15 01:30 갱신')
  })
})

describe('formatWeekRange', () => {
  it('시작일과 종료일을 월/일로 표기한다', () => {
    expect(formatWeekRange({ start: '2026-08-10', end: '2026-08-16' })).toBe('8/10 – 8/16 기준')
  })

  it('해를 넘는 범위도 월/일만 표기한다', () => {
    expect(formatWeekRange({ start: '2026-12-29', end: '2027-01-04' })).toBe('12/29 – 1/4 기준')
  })
})
