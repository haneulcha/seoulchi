import { describe, expect, it } from 'vitest'
import { pickPlaces } from '~/pipeline/pick-places'
import type { EventItem, Item, PlaceItem } from '~/types/item'

function place(id: string, over: Partial<PlaceItem> = {}): PlaceItem {
  return {
    id, source: 'visit-seoul', kind: 'place', title: `장소 ${id}`,
    category: '문화관광', place: `장소 ${id}`,
    imageUrl: 'https://example.com/a.jpg', lat: 37.5, lng: 127.0,
    ...over,
  }
}

const pool: Item[] = Array.from({ length: 30 }, (_, i) => place(`vs-${i}`))

describe('pickPlaces — 자격 필터', () => {
  it('이미지가 없으면 제외한다', () => {
    const items = [place('vs-a', { imageUrl: undefined }), ...pool]
    expect(pickPlaces(items, '2026-W33')).not.toContain('vs-a')
  })

  it('좌표가 없으면 제외한다', () => {
    const items = [place('vs-a', { lat: undefined, lng: undefined }), ...pool]
    expect(pickPlaces(items, '2026-W33')).not.toContain('vs-a')
  })

  it('event는 제외한다', () => {
    const event: EventItem = {
      id: 'sc-x', source: 'seoul-culture', kind: 'event', title: '행사',
      category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-16',
      imageUrl: 'https://example.com/a.jpg', lat: 37.5, lng: 127.0,
    }
    expect(pickPlaces([event, ...pool], '2026-W33')).not.toContain('sc-x')
  })
})

describe('pickPlaces — 개수와 결정론', () => {
  it('기본 6개를 반환한다', () => {
    expect(pickPlaces(pool, '2026-W33')).toHaveLength(6)
  })

  it('자격 있는 항목이 6개 미만이면 있는 만큼만 반환한다', () => {
    expect(pickPlaces([place('vs-a'), place('vs-b')], '2026-W33')).toHaveLength(2)
  })

  it('같은 주에는 항상 같은 결과다 (빌드 재현성)', () => {
    expect(pickPlaces(pool, '2026-W33')).toEqual(pickPlaces(pool, '2026-W33'))
  })

  it('주가 바뀌면 조합이 달라진다', () => {
    // 결정론적이므로 항상 통과하거나 항상 실패한다.
    // 두 주의 시드가 우연히 pool 길이로 합동이면 다른 주차 쌍으로 바꾼다.
    expect(pickPlaces(pool, '2026-W33')).not.toEqual(pickPlaces(pool, '2026-W34'))
  })

  it('중복 없이 반환한다', () => {
    const picked = pickPlaces(pool, '2026-W33')
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('입력 순서가 바뀌어도 같은 결과다', () => {
    expect(pickPlaces([...pool].reverse(), '2026-W33')).toEqual(pickPlaces(pool, '2026-W33'))
  })
})

describe('pickPlaces — 점수', () => {
  // 회전이 있으므로 "특정 한 곳이 이번 주에 반드시 나온다"는 보장할 수 없고,
  // 보장할 필요도 없다. 점수의 역할은 순위가 아니라 **회전 풀의 문턱**이다.
  const rich = (id: string) =>
    place(id, { summary: '좋은 곳', subwayInfo: '2호선 시청역', isFree: true })

  it('상위 점수가 풀을 채우면 낮은 점수는 아예 안 나온다', () => {
    // 풀 크기는 count×3 = 18. 점수 높은 곳이 18개 이상이면 낮은 쪽은 못 든다.
    const highs = Array.from({ length: 20 }, (_, i) => rich(`vs-rich-${i}`))
    const lows = Array.from({ length: 30 }, (_, i) => place(`vs-plain-${i}`))
    const picked = pickPlaces([...lows, ...highs], '2026-W33')
    expect(picked.every((id) => id.startsWith('vs-rich-'))).toBe(true)
  })

  it('풀을 다 못 채우면 낮은 점수도 들어온다', () => {
    const picked = pickPlaces([rich('vs-rich'), ...Array.from({ length: 20 }, (_, i) => place(`vs-plain-${i}`))], '2026-W33')
    expect(picked).toHaveLength(6)
  })

  it('여러 주에 걸쳐 보면 상위 풀만 등장한다', () => {
    const highs = Array.from({ length: 20 }, (_, i) => rich(`vs-rich-${i}`))
    const lows = Array.from({ length: 30 }, (_, i) => place(`vs-plain-${i}`))
    const items = [...lows, ...highs]
    const seen = new Set<string>()
    for (let w = 1; w <= 52; w++) {
      for (const id of pickPlaces(items, `2026-W${String(w).padStart(2, '0')}`)) seen.add(id)
    }
    expect([...seen].every((id) => id.startsWith('vs-rich-'))).toBe(true)
    // 1년을 돌면 풀(18개)을 골고루 쓴다 — 매주 같은 곳만 나오지 않는다
    expect(seen.size).toBe(18)
  })
})
