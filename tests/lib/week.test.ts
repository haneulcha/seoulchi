import { describe, expect, it } from 'vitest'
import { isoWeekKey, kstToday, weekLabel, weekRange } from '~/lib/week'

describe('isoWeekKey', () => {
  it('2026-08-13(목)은 2026-W33이다', () => {
    expect(isoWeekKey(new Date('2026-08-13T12:00:00+09:00'))).toBe('2026-W33')
  })

  it('같은 주의 월요일과 일요일이 같은 키를 낸다', () => {
    expect(isoWeekKey(new Date('2026-08-10T00:00:00+09:00'))).toBe('2026-W33')
    expect(isoWeekKey(new Date('2026-08-16T23:59:00+09:00'))).toBe('2026-W33')
  })

  it('KST 기준으로 계산한다 — UTC로는 전날인 시각', () => {
    // 2026-08-17T00:30+09:00 = 2026-08-16T15:30Z. KST로는 월요일이므로 W34.
    expect(isoWeekKey(new Date('2026-08-17T00:30:00+09:00'))).toBe('2026-W34')
  })

  it('연말 경계: 2026-01-01(목)은 2026-W01이다', () => {
    expect(isoWeekKey(new Date('2026-01-01T12:00:00+09:00'))).toBe('2026-W01')
  })

  it('연말 경계: 2025-12-29(월)은 2026-W01이다', () => {
    // ISO 주차는 목요일이 속한 해를 따른다
    expect(isoWeekKey(new Date('2025-12-29T12:00:00+09:00'))).toBe('2026-W01')
  })

  it('주차를 두 자리로 0 패딩한다', () => {
    expect(isoWeekKey(new Date('2026-03-05T12:00:00+09:00'))).toMatch(/^2026-W\d{2}$/)
  })
})

describe('weekRange', () => {
  it('2026-W33은 08-10(월)~08-16(일)이다', () => {
    expect(weekRange('2026-W33')).toEqual({ start: '2026-08-10', end: '2026-08-16' })
  })

  it('2026-W01은 2025-12-29~2026-01-04이다', () => {
    expect(weekRange('2026-W01')).toEqual({ start: '2025-12-29', end: '2026-01-04' })
  })

  it('잘못된 키 형식을 거부한다', () => {
    expect(() => weekRange('2026-33')).toThrow()
  })
})

describe('weekLabel', () => {
  it('그 주 목요일이 속한 달의 몇 번째 목요일인지로 센다', () => {
    // 2026년 8월의 목요일: 6, 13, 20, 27 → 8/13은 두 번째
    expect(weekLabel('2026-W33')).toBe('2026년 8월 둘째 주')
  })

  it('첫째 주를 올바르게 센다', () => {
    // 2026-W32의 목요일은 8/6 → 첫 번째
    expect(weekLabel('2026-W32')).toBe('2026년 8월 첫째 주')
  })
})

describe('kstToday', () => {
  it('KST 달력 날짜를 YYYY-MM-DD로 준다', () => {
    expect(kstToday(new Date('2026-08-13T12:00:00+09:00'))).toBe('2026-08-13')
  })

  it('UTC로는 전날인 이른 새벽도 KST 날짜로 준다', () => {
    // 2026-08-13T00:30+09:00 = 2026-08-12T15:30Z
    expect(kstToday(new Date('2026-08-13T00:30:00+09:00'))).toBe('2026-08-13')
  })

  it('UTC로는 전날인 늦은 밤도 KST 날짜로 준다', () => {
    // 2026-08-14T08:00+09:00 = 2026-08-13T23:00Z
    expect(kstToday(new Date('2026-08-14T08:00:00+09:00'))).toBe('2026-08-14')
  })
})
