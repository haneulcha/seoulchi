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
