import { describe, expect, it } from 'vitest'
import { dayRange, eventsOn, pickShelf, sortByDeadline } from '~/lib/today'
import type { HomeEntry } from '~/lib/home'
import type { CatalogEventIndexItem } from '~/types/files'

function ev(id: string, startDate: string, endDate: string, time?: string): CatalogEventIndexItem {
  return { id, kind: 'event', title: `행사 ${id}`, group: '보러 가기', place: '어딘가', startDate, endDate, time }
}

function pick(id: string, startDate: string, endDate: string): HomeEntry {
  return {
    item: {
      id,
      source: 'seoul-culture',
      kind: 'event',
      title: `행사 ${id}`,
      category: '전시/미술',
      place: '어딘가',
      startDate,
      endDate,
    },
    reason: '',
  }
}

// 2026-10-28 수, 10-31 토, 11-01 일
describe('dayRange', () => {
  it('오늘·내일은 하루', () => {
    expect(dayRange('today', '2026-10-28')).toEqual({ start: '2026-10-28', end: '2026-10-28' })
    expect(dayRange('tomorrow', '2026-10-28')).toEqual({ start: '2026-10-29', end: '2026-10-29' })
  })
  it('주중의 이번 주말은 다가오는 토·일', () => {
    expect(dayRange('weekend', '2026-10-28')).toEqual({ start: '2026-10-31', end: '2026-11-01' })
  })
  it('토요일이면 토·일, 일요일이면 일요일 하루', () => {
    expect(dayRange('weekend', '2026-10-31')).toEqual({ start: '2026-10-31', end: '2026-11-01' })
    expect(dayRange('weekend', '2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-01' })
  })
})

describe('eventsOn', () => {
  it('하루라도 겹치면 남긴다', () => {
    const r = { start: '2026-10-31', end: '2026-11-01' }
    const ids = eventsOn([
      ev('끝남', '2026-10-01', '2026-10-30'), ev('나중', '2026-11-02', '2026-11-30'),
      ev('걸침', '2026-10-01', '2026-10-31'), ev('안', '2026-11-01', '2026-11-01'),
    ], r).map((e) => e.id)
    expect(ids).toEqual(['걸침', '안'])
  })
  it('쉬는 요일이면 뺀다 — 월요일 휴관은 월요일(11-02)에 빠지고 화요일(11-03)에 남는다', () => {
    const e = ev('휴관', '2026-10-01', '2026-11-30', '화-일 10:00~18:00 / 월요일 휴관')
    expect(eventsOn([e], { start: '2026-11-02', end: '2026-11-02' })).toEqual([])
    expect(eventsOn([e], { start: '2026-11-03', end: '2026-11-03' })).toEqual([e])
  })
  it('이번 주말: 토요일에 여는 것은 남고 평일만 여는 것은 빠진다', () => {
    const r = dayRange('weekend', '2026-10-28')
    const ids = eventsOn([
      ev('토', '2026-10-01', '2026-11-30', '매주 (토) 14:00'),
      ev('평일', '2026-10-01', '2026-11-30', '월-금 10:00~17:00'),
    ], r).map((e) => e.id)
    expect(ids).toEqual(['토'])
  })
  it('time을 못 읽으면 남긴다', () => {
    const e = ev('모름', '2026-10-01', '2026-11-30', '10:00~18:00')
    expect(eventsOn([e], { start: '2026-11-02', end: '2026-11-02' })).toEqual([e])
  })
})

describe('sortByDeadline', () => {
  it('종료일 → id, 원본 불변', () => {
    const input = [ev('b', '2026-10-01', '2026-11-05'), ev('c', '2026-10-01', '2026-10-30'), ev('a', '2026-10-01', '2026-11-05')]
    expect(sortByDeadline(input).map((e) => e.id)).toEqual(['c', 'a', 'b'])
    expect(input.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('pickShelf', () => {
  it('만료·주말 뒤 시작을 먼저 빼고 3개', () => {
    // today 2026-10-28(수), 주말 끝 11-01
    const picks = [pick('만료', '2026-10-01', '2026-10-27'), pick('먼', '2026-11-02', '2026-11-30'),
      pick('a', '2026-10-01', '2026-11-30'), pick('b', '2026-11-01', '2026-11-01'),
      pick('c', '2026-10-28', '2026-10-28'), pick('d', '2026-10-01', '2026-12-01')]
    expect(pickShelf(picks, '2026-10-28').map((p) => p.item.id)).toEqual(['a', 'b', 'c'])
  })
  it('남는 게 없으면 빈 배열', () => {
    expect(pickShelf([pick('만료', '2026-10-01', '2026-10-27')], '2026-10-28')).toEqual([])
  })
})
