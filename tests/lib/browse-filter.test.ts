import { describe, expect, it } from 'vitest'
import {
  applyFilters, formatDistance, groupByTimeline, relaxSuggestions, sortByDistance,
} from '~/lib/browse-filter'
import type { CatalogEventIndexItem, CatalogIndexItem, CatalogPlaceIndexItem } from '~/types/files'

const TODAY = '2026-08-31' // 월요일
const HORIZON = '2026-10-26'
/** KST 2026-09-01(화) 14:00 = UTC 05:00 — open-now 테스트와 같은 방식으로 순간을 고정 */
const NOW = new Date('2026-09-01T05:00:00Z')

function evIdx(id: string, over: Partial<CatalogEventIndexItem> = {}): CatalogEventIndexItem {
  return {
    id, kind: 'event', title: `행사 ${id}`, group: '전시', place: '어딘가',
    startDate: '2026-08-01', endDate: '2026-09-30', ...over,
  }
}

function plIdx(id: string, over: Partial<CatalogPlaceIndexItem> = {}): CatalogPlaceIndexItem {
  return { id, kind: 'place', title: `장소 ${id}`, group: '공원·자연', ...over }
}

describe('applyFilters', () => {
  it('그룹 필터 — 단일 선택', () => {
    const items: CatalogIndexItem[] = [evIdx('sc-전시'), evIdx('sc-공연', { group: '공연' })]
    expect(applyFilters(items, { group: '공연' }, NOW).map((i) => i.id)).toEqual(['sc-공연'])
  })

  it('자치구 필터 — district가 없는 항목은 매치되지 않는다', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-종로', { district: '종로구' }),
      evIdx('sc-미상'), // district 없음
    ]
    expect(applyFilters(items, { district: '종로구' }, NOW).map((i) => i.id)).toEqual(['sc-종로'])
  })

  it('무료만 — isFree가 true인 것만. 행사·장소 공통', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-무료', { isFree: true }),
      evIdx('sc-유료', { isFree: false }),
      plIdx('vs-무료', { isFree: true }),
      plIdx('vs-유료', { isFree: false }),
    ]
    expect(applyFilters(items, { free: true }, NOW).map((i) => i.id)).toEqual(['sc-무료', 'vs-무료'])
  })

  it('지금 열림 — 닫힌 장소만 떨어뜨리고, hours 미상은 남긴다', () => {
    const items: CatalogIndexItem[] = [
      plIdx('vs-열림', { hours: { open: '10:00', close: '18:00', closedWeekdays: [] } }),
      plIdx('vs-닫힘', { hours: { open: '19:00', close: '23:00', closedWeekdays: [] } }),
      plIdx('vs-미상'), // hours 없음 — 버리면 화면이 '안 열려 있다'고 거짓말한다(스펙 8장)
    ]
    expect(applyFilters(items, { open: true }, NOW).map((i) => i.id)).toEqual(['vs-열림', 'vs-미상'])
  })

  it('지금 열림은 행사를 건드리지 않는다 — 행사에는 hours 개념이 없다', () => {
    const items: CatalogIndexItem[] = [evIdx('sc-a')]
    expect(applyFilters(items, { open: true }, NOW)).toHaveLength(1)
  })

  it('필터 조합은 AND다', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-a', { group: '공연', district: '마포구', isFree: true }),
      evIdx('sc-b', { group: '공연', district: '마포구', isFree: false }),
      evIdx('sc-c', { group: '공연', district: '중구', isFree: true }),
    ]
    expect(
      applyFilters(items, { group: '공연', district: '마포구', free: true }, NOW).map((i) => i.id),
    ).toEqual(['sc-a'])
  })

  it('빈 필터는 전부 통과 — 기타 그룹도 전체에는 있다(스펙 7장)', () => {
    const items: CatalogIndexItem[] = [evIdx('sc-기타', { group: '기타' })]
    expect(applyFilters(items, {}, NOW)).toHaveLength(1)
  })
})

describe('groupByTimeline', () => {
  it('월요일 기준 그룹 경계: 이번 주 / 이번 주말 / 다음 주 / 월별', () => {
    const groups = groupByTimeline([], TODAY, HORIZON)
    expect(groups.map((g) => ({ label: g.label, start: g.start, end: g.end }))).toEqual([
      { label: '이번 주', start: '2026-08-31', end: '2026-09-04' },
      { label: '이번 주말', start: '2026-09-05', end: '2026-09-06' },
      { label: '다음 주', start: '2026-09-07', end: '2026-09-13' },
      { label: '9월', start: '2026-09-14', end: '2026-09-30' },
      { label: '10월', start: '2026-10-01', end: '2026-10-26' }, // horizonEnd에서 끊긴다
    ])
  })

  it('오늘이 토요일이면 이번 주 그룹이 없다', () => {
    const groups = groupByTimeline([], '2026-09-05', '2026-11-02')
    expect(groups[0]).toMatchObject({ label: '이번 주말', start: '2026-09-05', end: '2026-09-06' })
  })

  it('오늘이 일요일이면 이번 주말은 오늘 하루다', () => {
    const groups = groupByTimeline([], '2026-09-06', '2026-11-02')
    expect(groups[0]).toMatchObject({ label: '이번 주말', start: '2026-09-06', end: '2026-09-06' })
  })

  it('해를 넘는 월 그룹은 연도를 붙인다', () => {
    // 2026-11-30(월) + 8주 = 2027-01-25
    const labels = groupByTimeline([], '2026-11-30', '2027-01-25').map((g) => g.label)
    expect(labels).toContain('12월')
    expect(labels).toContain('2027년 1월')
  })

  it('진행 중인 장기 행사는 전부 첫 그룹에 모인다 — 유효 시작일 max(startDate, today)', () => {
    const events = [evIdx('sc-장기', { startDate: '2026-02-24', endDate: '2026-11-30' })]
    const groups = groupByTimeline(events, TODAY, HORIZON)
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['sc-장기'])
  })

  it('미래 시작 행사는 시작일이 속한 그룹에만 있다 — 뒤 그룹은 "그때 새로 시작하는 것"만 남는다', () => {
    const events = [
      evIdx('sc-주말', { startDate: '2026-09-05', endDate: '2026-09-06' }),
      evIdx('sc-다음주', { startDate: '2026-09-09', endDate: '2026-12-31' }),
      evIdx('sc-9월', { startDate: '2026-09-14', endDate: '2026-09-14' }),
      evIdx('sc-10월', { startDate: '2026-10-26', endDate: '2026-10-31' }),
    ]
    const groups = groupByTimeline(events, TODAY, HORIZON)
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.id)]))
    expect(byLabel).toEqual({
      '이번 주': [], '이번 주말': ['sc-주말'], '다음 주': ['sc-다음주'],
      '9월': ['sc-9월'], '10월': ['sc-10월'],
    })
  })

  it('항목은 정확히 한 그룹에만 놓인다', () => {
    const events = [evIdx('sc-a', { startDate: '2026-09-05', endDate: '2026-10-31' })]
    const total = groupByTimeline(events, TODAY, HORIZON).reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(1)
  })

  it('그룹 안은 유효 시작일 → 종료일 → id 순 — 홈과 같은 결정론', () => {
    const events = [
      evIdx('sc-b', { startDate: '2026-08-01', endDate: '2026-09-20' }),
      evIdx('sc-a', { startDate: '2026-08-01', endDate: '2026-09-20' }),
      evIdx('sc-임박', { startDate: '2026-08-01', endDate: '2026-09-01' }),
      evIdx('sc-수요일', { startDate: '2026-09-02', endDate: '2026-09-30' }),
    ]
    const first = groupByTimeline(events, TODAY, HORIZON)[0]!
    expect(first.items.map((i) => i.id)).toEqual(['sc-임박', 'sc-a', 'sc-b', 'sc-수요일'])
  })
})

describe('sortByDistance', () => {
  const origin = { lat: 37.5665, lng: 126.978 } // 서울시청

  it('가까운 순으로 정렬하고 km를 계산한다 — 행사·장소가 거리 하나로 선다', () => {
    const items: CatalogIndexItem[] = [
      plIdx('vs-멀다', { lat: 37.54, lng: 127.04 }),   // 서울숲 ~6km
      evIdx('sc-가깝다', { lat: 37.566, lng: 126.977 }), // 코앞
    ]
    const out = sortByDistance(items, origin)
    expect(out.map((e) => e.item.id)).toEqual(['sc-가깝다', 'vs-멀다'])
    expect(out[0]!.km!).toBeLessThan(0.2)
    expect(out[1]!.km!).toBeGreaterThan(3)
  })

  it('좌표 없는 항목은 버리지 않고 끝에 id 순으로 둔다 — 거리 미상이지 존재 미상이 아니다', () => {
    const items: CatalogIndexItem[] = [
      plIdx('vs-b없음'), plIdx('vs-a없음'), evIdx('sc-좌표', { lat: 37.57, lng: 126.98 }),
    ]
    const out = sortByDistance(items, origin)
    expect(out.map((e) => e.item.id)).toEqual(['sc-좌표', 'vs-a없음', 'vs-b없음'])
    expect(out[1]!.km).toBeUndefined()
  })
})

describe('relaxSuggestions', () => {
  it('0건일 때 어떤 필터를 풀면 몇 건이 나오는지 계산한다 (스펙 8장)', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-a', { group: '공연', district: '마포구', isFree: false }),
      evIdx('sc-b', { group: '전시', district: '중구', isFree: true }),
    ]
    const filters = { group: '공연' as const, district: '중구', free: true }
    expect(applyFilters(items, filters, NOW)).toHaveLength(0)
    const out = relaxSuggestions(items, filters, NOW)
    // group을 풀면 sc-b가 1건. district·free를 풀어도 0건이라 제안에 없다
    expect(out).toEqual([{ filter: 'group', count: 1 }])
  })

  it('켜져 있지 않은 필터는 제안하지 않는다', () => {
    const out = relaxSuggestions([evIdx('sc-a')], { free: true }, NOW)
    expect(out.map((s) => s.filter)).toEqual(['free'])
  })

  it('여러 제안은 건수 내림차순', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-1', { group: '공연', isFree: false }),
      evIdx('sc-2', { group: '공연', isFree: false }),
      evIdx('sc-3', { group: '전시', isFree: true }),
    ]
    const out2 = relaxSuggestions(items, { group: '공연' as const, free: true }, NOW)
    expect(out2).toEqual([
      { filter: 'free', count: 2 },  // free를 풀면 공연 2건
      { filter: 'group', count: 1 }, // group을 풀면 무료 1건
    ])
  })
})

describe('formatDistance', () => {
  it('1km 미만은 m, 이상은 km 한 자리', () => {
    expect(formatDistance(0.85)).toBe('850m')
    expect(formatDistance(1.23)).toBe('1.2km')
    expect(formatDistance(12.04)).toBe('12.0km')
  })
})
