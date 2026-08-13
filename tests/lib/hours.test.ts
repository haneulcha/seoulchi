import { describe, expect, it } from 'vitest'
import { parseHours } from '~/lib/hours'

describe('parseHours — 성공 케이스', () => {
  it('물결 구분 시간대를 읽는다', () => {
    expect(parseHours('10:00~18:00')).toEqual({
      open: '10:00',
      close: '18:00',
      closedWeekdays: [],
    })
  })

  it('하이픈 구분도 읽는다', () => {
    expect(parseHours('09:30 - 17:30')).toMatchObject({ open: '09:30', close: '17:30' })
  })

  it('한 자리 시각을 0 패딩한다', () => {
    expect(parseHours('9:00~18:00')).toMatchObject({ open: '09:00' })
  })

  it('useTime 안의 휴관 요일을 읽는다', () => {
    expect(parseHours('10:00~18:00, 매주 월요일 휴관')).toEqual({
      open: '10:00',
      close: '18:00',
      closedWeekdays: [1],
    })
  })

  it('closedDays 인자에서 휴관 요일을 읽는다', () => {
    expect(parseHours('10:00~18:00', '매주 화요일')).toMatchObject({ closedWeekdays: [2] })
  })

  it('여러 요일을 읽는다', () => {
    expect(parseHours('10:00~18:00', '월요일, 화요일 휴관')).toMatchObject({
      closedWeekdays: [1, 2],
    })
  })

  it('연중무휴는 휴무 없음으로 본다', () => {
    expect(parseHours('10:00~18:00', '연중무휴')).toMatchObject({ closedWeekdays: [] })
  })
})

describe('parseHours — 실패 시 null', () => {
  it('입력이 없으면 null', () => {
    expect(parseHours(undefined)).toBeNull()
    expect(parseHours('')).toBeNull()
  })

  it('시간대를 못 찾으면 null', () => {
    expect(parseHours('상시 개방')).toBeNull()
  })

  it('시각이 아닌 숫자 범위에 속지 않는다', () => {
    expect(parseHours('관람료 1000~2000원')).toBeNull()
  })

  it('불가능한 시각은 null', () => {
    expect(parseHours('25:00~30:00')).toBeNull()
  })
})
