import { describe, expect, it } from 'vitest'
import { resolveCurated } from '~/data/resolve'
import type { CuratedFile } from '~/types/files'
import type { EventItem, PlaceItem } from '~/types/item'

function ev(id: string): EventItem {
  return {
    id,
    source: 'seoul-culture',
    kind: 'event',
    title: `행사 ${id}`,
    category: '전시/미술',
    place: '어딘가',
    startDate: '2026-08-17',
    endDate: '2026-08-23',
  }
}

function pl(id: string): PlaceItem {
  return {
    id,
    source: 'visit-seoul',
    kind: 'place',
    title: `장소 ${id}`,
    category: '문화관광',
    place: '어딘가',
  }
}

const events = [ev('sc-1'), ev('sc-2')]
const places = [pl('vs-KOP1'), pl('vs-KOP2')]

describe('resolveCurated', () => {
  it('picks를 curated 순서대로, reason을 붙여 해석한다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [
        { id: 'sc-2', reason: '두 번째 코멘트' },
        { id: 'sc-1', reason: '' },
      ],
      places: [],
    }
    const resolved = resolveCurated(curated, events, places)
    expect(resolved.picks.map((p) => p.item.id)).toEqual(['sc-2', 'sc-1'])
    expect(resolved.picks[0]!.reason).toBe('두 번째 코멘트')
    // 규칙 배치(LLM_PROVIDER=rule)의 빈 reason도 그대로 통과한다 — 렌더 측이 접는다
    expect(resolved.picks[1]!.reason).toBe('')
  })

  it('이벤트에 없는 pick id는 조용히 버린다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [{ id: 'sc-없음', reason: 'x' }, { id: 'sc-1', reason: 'y' }],
      places: [],
    }
    const resolved = resolveCurated(curated, events, places)
    expect(resolved.picks.map((p) => p.item.id)).toEqual(['sc-1'])
  })

  it('places를 id 순서대로 해석한다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [],
      places: ['vs-KOP2', 'vs-KOP1'],
    }
    const resolved = resolveCurated(curated, events, places)
    expect(resolved.places.map((p) => p.id)).toEqual(['vs-KOP2', 'vs-KOP1'])
  })

  it('places에 없는 id는 조용히 버린다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [],
      places: ['vs-없음', 'vs-KOP1'],
    }
    expect(resolveCurated(curated, events, places).places.map((p) => p.id)).toEqual(['vs-KOP1'])
  })
})
