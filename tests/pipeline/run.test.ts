import { describe, expect, it } from 'vitest'
import { runPipeline } from '~/pipeline/run'
import { RuleOnlyProvider } from '~/llm/rule-only'
import type { EventSource } from '~/sources/types'
import type { Item } from '~/types/item'

function fakeSource(name: string, items: Item[]): EventSource<Item, Item> {
  return {
    name,
    fetchList: async () => items,
    hydrate: async (i) => i,
    normalize: (i) => i,
  }
}

const scEvent: Item = {
  id: 'sc-a', source: 'seoul-culture', kind: 'event', title: '전시 A',
  category: '전시', place: '서울시립미술관', startDate: '2026-08-10', endDate: '2026-08-16',
  isFree: true,
}

const vsPlace: Item = {
  id: 'vs-b', source: 'visit-seoul', kind: 'place', title: '박물관',
  category: '문화관광', place: '박물관',
  imageUrl: 'https://example.com/a.jpg', lat: 37.5, lng: 127.0,
}

const outOfWeek: Item = {
  id: 'sc-old', source: 'seoul-culture', kind: 'event', title: '지난 행사',
  category: '전시', place: '어딘가', startDate: '2026-01-01', endDate: '2026-01-31',
}

/** 2026-W33에는 걸치지만 목요일(08-13) 시점에는 이미 끝난 행사 */
const endedEarlyThisWeek: Item = {
  id: 'sc-ended', source: 'seoul-culture', kind: 'event', title: '월요일에 끝난 행사',
  category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-11',
}

describe('runPipeline', () => {
  const opts = {
    sources: [
      fakeSource('seoul-culture', [scEvent, outOfWeek, endedEarlyThisWeek]),
      fakeSource('visit-seoul', [vsPlace]),
    ],
    provider: new RuleOnlyProvider(),
    weekKey: '2026-W33',
    today: '2026-08-13',
    cache: {},
    curatedCount: 12,
    placeCount: 6,
  }

  it('이번 주 이벤트만 events에 담는다', async () => {
    const out = await runPipeline(opts)
    expect(out.events.map((e) => e.id)).toEqual(['sc-a'])
  })

  it('이번 주라도 오늘 이전에 끝난 행사는 뺀다', async () => {
    const out = await runPipeline(opts)
    expect(out.events.map((e) => e.id)).not.toContain('sc-ended')
  })

  it('today가 주 시작일보다 이르면 주 전체를 담는다', async () => {
    const out = await runPipeline({ ...opts, today: '2026-08-01' })
    expect(out.events.map((e) => e.id).sort()).toEqual(['sc-a', 'sc-ended'])
  })

  it('place를 events에서 분리한다', async () => {
    const out = await runPipeline(opts)
    expect(out.places.map((p) => p.id)).toEqual(['vs-b'])
  })

  it('큐레이션 id가 events 안에 있다', async () => {
    const out = await runPipeline(opts)
    const eventIds = new Set(out.events.map((e) => e.id))
    for (const pick of out.curated) expect(eventIds.has(pick.id)).toBe(true)
  })

  it('선정된 장소 id가 places 안에 있다', async () => {
    const out = await runPipeline(opts)
    const placeIds = new Set(out.places.map((p) => p.id))
    for (const id of out.curatedPlaces) expect(placeIds.has(id)).toBe(true)
  })

  it('소스별 건수를 센다', async () => {
    const out = await runPipeline(opts)
    expect(out.sourceCounts).toMatchObject({ 'seoul-culture': 3, 'visit-seoul': 1 })
  })

  it('provider 이름을 담는다', async () => {
    expect((await runPipeline(opts)).providerName).toBe('rule')
  })
})

/** 주간 창(W33) 밖이지만 8주 지평(today 08-13 기준 ~10-08) 안의 미래 행사 */
const futureEvent: Item = {
  id: 'sc-미래', source: 'seoul-culture', kind: 'event', title: '가을 축제',
  category: '축제-문화/예술', place: '어딘가', startDate: '2026-09-20', endDate: '2026-09-22',
}

/** 원본 오타 — endDate가 3년 뒤를 넘는다 */
const farFuture: Item = {
  id: 'sc-이상치', source: 'seoul-culture', kind: 'event', title: '오타 행사',
  category: '전시/미술', place: '어딘가', startDate: '2026-08-10', endDate: '2626-08-08',
}

describe('runPipeline: 탐색 카탈로그', () => {
  // 기존 describe 안의 opts는 스코프 밖이라 여기서 따로 만든다 (같은 값)
  const catalogOpts = {
    sources: [
      fakeSource('seoul-culture', [scEvent, outOfWeek, endedEarlyThisWeek, futureEvent, farFuture]),
      fakeSource('visit-seoul', [vsPlace]),
    ],
    provider: new RuleOnlyProvider(),
    weekKey: '2026-W33',
    today: '2026-08-13',
    cache: {},
    curatedCount: 12,
    placeCount: 6,
  }

  it('카탈로그는 주간 창 밖의 미래 행사를 담는다 — 주간 events에는 없다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.events.map((e) => e.id)).toContain('sc-미래')
    expect(out.events.map((e) => e.id)).not.toContain('sc-미래')
  })

  it('이미 끝난 행사는 카탈로그에도 없다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.events.map((e) => e.id)).not.toContain('sc-old')
  })

  it('endDate 이상치는 카탈로그에서 빠지고 anomalies에 남는다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.events.map((e) => e.id)).not.toContain('sc-이상치')
    expect(out.catalog.anomalies).toEqual([{ id: 'sc-이상치', endDate: '2626-08-08' }])
  })

  it("미매핑 카테고리를 수집한다 — 픽스처의 '전시'는 원시값이 아니다('전시/미술'이 원시값)", async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.unmappedCategories).toEqual(['전시'])
  })

  it('카탈로그의 장소는 places와 같다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.places).toEqual(out.places)
  })
})
