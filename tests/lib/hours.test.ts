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

describe('parseHours — 상시 개방', () => {
  // Task 6 실측: 파싱 실패 원문의 최빈 패턴이 '24시간' / '상시개방' 계열이었다.
  it.each(['24시간', '24시간 개방', '24시간 운영', '상시개방', '상시 개방'])(
    '%s를 00:00~24:00으로 읽는다',
    (raw) => {
      expect(parseHours(raw)).toMatchObject({ open: '00:00', close: '24:00' })
    },
  )

  it('뒤에 다른 안내가 붙어도 읽는다', () => {
    // 실측 원문: '24시간, 연중무휴'
    expect(parseHours('24시간, 연중무휴')).toMatchObject({ open: '00:00', close: '24:00' })
  })

  it('상시 개방이어도 휴관 요일은 살린다', () => {
    expect(parseHours('24시간', '매주 월요일 휴관')).toEqual({
      open: '00:00',
      close: '24:00',
      closedWeekdays: [1],
    })
  })

  it('명시된 시간대가 있으면 그쪽이 이긴다', () => {
    expect(parseHours('24시간 편의점 있음, 10:00~18:00')).toMatchObject({
      open: '10:00',
      close: '18:00',
    })
  })

  it("'24시간 전 예약'에 속지 않는다", () => {
    // 24시간이 영업시간이 아니라 사전 안내인 경우
    expect(parseHours('24시간 전 예약 필수')).toBeNull()
  })

  it('연중무휴는 24시간이 아니다 — 쉬는 날이 없다는 뜻일 뿐', () => {
    expect(parseHours('연중무휴')).toBeNull()
  })
})

describe('parseHours — 실패 시 null', () => {
  it('입력이 없으면 null', () => {
    expect(parseHours(undefined)).toBeNull()
    expect(parseHours('')).toBeNull()
  })

  it('시간대를 못 찾으면 null', () => {
    // Task 6 실측에서 실제로 나온 원문들. 애초에 단일 시간대가 없어 파싱 대상이 아니다.
    expect(parseHours('업체별 상이')).toBeNull()
    expect(parseHours('층별로 상이')).toBeNull()
    expect(parseHours('일출 시 ~ 일몰 시')).toBeNull()
    expect(parseHours('법회, 기도 불공 등 사찰 일정에 따라 이용 시간에 차이가 있음')).toBeNull()
  })

  it('시각이 아닌 숫자 범위에 속지 않는다', () => {
    expect(parseHours('관람료 1000~2000원')).toBeNull()
  })

  it('불가능한 시각은 null', () => {
    expect(parseHours('25:00~30:00')).toBeNull()
  })
})
