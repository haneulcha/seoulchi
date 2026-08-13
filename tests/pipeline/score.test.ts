import { describe, expect, it } from 'vitest'
import { scoreEvent, selectCandidates } from '~/pipeline/score'
import type { EventItem, PlaceItem } from '~/types/item'

// 2026-W33 = 2026-08-10(월) ~ 2026-08-16(일)
const WEEK = '2026-W33'

function evt(over: Partial<EventItem> = {}): EventItem {
  return {
    id: `sc-${Math.random().toString(36).slice(2)}`,
    source: 'seoul-culture',
    kind: 'event',
    title: '행사',
    category: '전시/미술',
    place: '어딘가',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    ...over,
  }
}

describe('scoreEvent', () => {
  it('이번 주에 시작하는 행사에 가점한다', () => {
    const startsThisWeek = evt({ startDate: '2026-08-12', endDate: '2026-08-20' })
    const startedLongAgo = evt({ startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(scoreEvent(startsThisWeek, WEEK)).toBeGreaterThan(scoreEvent(startedLongAgo, WEEK))
  })

  it('주말에 열리는 행사에 가점한다', () => {
    const weekend = evt({ startDate: '2026-08-15', endDate: '2026-08-16' })
    const weekdayOnly = evt({ startDate: '2026-08-11', endDate: '2026-08-12' })
    expect(scoreEvent(weekend, WEEK)).toBeGreaterThan(scoreEvent(weekdayOnly, WEEK))
  })

  it('무료 행사에 가점한다', () => {
    expect(scoreEvent(evt({ isFree: true }), WEEK)).toBeGreaterThan(
      scoreEvent(evt({ isFree: false }), WEEK),
    )
  })

  it('대형 기관에 가점한다', () => {
    expect(scoreEvent(evt({ place: '서울시립미술관' }), WEEK)).toBeGreaterThan(
      scoreEvent(evt({ place: '동네 주민센터' }), WEEK),
    )
  })

  it('이번 주에 끝나는 행사에 마감 임박 가점한다', () => {
    const endingSoon = evt({ startDate: '2026-01-01', endDate: '2026-08-14' })
    const endingLater = evt({ startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(scoreEvent(endingSoon, WEEK)).toBeGreaterThan(scoreEvent(endingLater, WEEK))
  })

  it('이미지가 있으면 가점한다', () => {
    expect(scoreEvent(evt({ imageUrl: 'https://x/a.jpg' }), WEEK)).toBeGreaterThan(
      scoreEvent(evt(), WEEK),
    )
  })
})

describe('selectCandidates', () => {
  // 주 시작일(월). 컷오프가 없을 때의 동작을 보는 기준값.
  const MONDAY = '2026-08-10'

  it('이번 주에 열리지 않는 행사를 제외한다', () => {
    const past = evt({ startDate: '2026-07-01', endDate: '2026-07-31' })
    const future = evt({ startDate: '2026-09-01', endDate: '2026-09-30' })
    const current = evt({ startDate: '2026-08-12', endDate: '2026-08-13' })
    const picked = selectCandidates([past, future, current], WEEK, MONDAY)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.startDate).toBe('2026-08-12')
  })

  it('주 경계에 걸친 행사를 포함한다', () => {
    const spanning = evt({ startDate: '2026-08-01', endDate: '2026-08-31' })
    expect(selectCandidates([spanning], WEEK, MONDAY)).toHaveLength(1)
  })

  it('오늘 이전에 끝난 행사를 뺀다 — 같은 주라도', () => {
    // 목요일에 돌린 배치. 화요일에 끝난 행사는 주에는 걸치지만 이미 지났다.
    const endedTuesday = evt({ startDate: '2026-08-10', endDate: '2026-08-11' })
    const stillRunning = evt({ startDate: '2026-08-10', endDate: '2026-08-16' })
    const picked = selectCandidates([endedTuesday, stillRunning], WEEK, '2026-08-13')
    expect(picked).toHaveLength(1)
    expect(picked[0]!.endDate).toBe('2026-08-16')
  })

  it('오늘 끝나는 행사는 남긴다', () => {
    const endsToday = evt({ startDate: '2026-08-10', endDate: '2026-08-13' })
    expect(selectCandidates([endsToday], WEEK, '2026-08-13')).toHaveLength(1)
  })

  it('지난 주차를 넘겨도 과거 행사가 새어나오지 않는다', () => {
    const lastWeek = evt({ startDate: '2026-08-03', endDate: '2026-08-09' })
    expect(selectCandidates([lastWeek], '2026-W32', '2026-08-13')).toHaveLength(0)
  })

  it('place는 후보에서 제외한다', () => {
    const place: PlaceItem = {
      id: 'vs-x',
      source: 'visit-seoul',
      kind: 'place',
      title: '박물관',
      category: '문화관광',
      place: '박물관',
    }
    expect(selectCandidates([place], WEEK, MONDAY)).toHaveLength(0)
  })

  it('limit 개수만큼만 반환한다', () => {
    const many = Array.from({ length: 100 }, () => evt())
    expect(selectCandidates(many, WEEK, MONDAY, 40)).toHaveLength(40)
  })

  it('점수 내림차순으로 정렬한다', () => {
    const low = evt({ title: '낮음', isFree: false })
    const high = evt({ title: '높음', isFree: true, imageUrl: 'https://x/a.jpg', place: '서울시립미술관' })
    expect(selectCandidates([low, high], WEEK, MONDAY)[0]!.title).toBe('높음')
  })

  it('점수가 같으면 제목 순으로 안정 정렬한다', () => {
    const a = evt({ title: '가나다' })
    const b = evt({ title: '나다라' })
    const first = selectCandidates([b, a], WEEK, MONDAY)
    expect(first.map((e) => e.title)).toEqual(['가나다', '나다라'])
  })
})
