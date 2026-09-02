import { describe, expect, it } from 'vitest'
import { addDays, formatDateRange, formatUpdatedAt, formatWeekRange, relativeDateLabel, weekdayOf } from '~/lib/dates'

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

describe('addDays', () => {
  it('일 단위 산술', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-08-31', -1)).toBe('2026-08-30')
  })

  it('월·해를 넘는다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-08-31', 56)).toBe('2026-10-26') // 8주 지평의 실제 값
  })
})

describe('weekdayOf', () => {
  it('0=일 … 6=토 (closedWeekdays와 같은 규약)', () => {
    expect(weekdayOf('2026-08-31')).toBe(1) // 월요일
    expect(weekdayOf('2026-09-05')).toBe(6) // 토요일
    expect(weekdayOf('2026-09-06')).toBe(0) // 일요일
  })
})

describe('relativeDateLabel', () => {
  const TODAY = '2026-08-31' // 월요일

  it('진행 중이고 오늘 끝나면 오늘까지 — 절대 날짜보다 먼저다', () => {
    expect(relativeDateLabel('2026-02-24', '2026-08-31', TODAY)).toBe('오늘까지')
  })

  it('진행 중이면 종료일로 말한다', () => {
    expect(relativeDateLabel('2026-02-24', '2026-11-30', TODAY)).toBe('11/30까지')
  })

  it('아직 시작 전이면 시작일로 말한다', () => {
    expect(relativeDateLabel('2026-09-03', '2026-11-30', TODAY)).toBe('9/3 시작')
  })

  it('다가오는 주말에 딱 맞으면 토·일', () => {
    expect(relativeDateLabel('2026-09-05', '2026-09-06', TODAY)).toBe('토·일')
  })

  it('주말을 넘치면 토·일이 아니다', () => {
    expect(relativeDateLabel('2026-09-05', '2026-09-07', TODAY)).toBe('9/5 시작')
  })

  it('오늘이 토·일이면 토·일 라벨을 쓰지 않는다 — 다음 주말과 오독된다', () => {
    // 오늘 = 2026-09-05(토). 다음 주말(9/12~13)에 딱 맞아도 날짜로 말한다
    expect(relativeDateLabel('2026-09-12', '2026-09-13', '2026-09-05')).toBe('9/12 시작')
  })

  it('오늘 시작하는 것은 진행 중으로 취급한다', () => {
    expect(relativeDateLabel('2026-08-31', '2026-09-14', TODAY)).toBe('9/14까지')
  })
})
