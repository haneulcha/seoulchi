import { describe, expect, it } from 'vitest'
import { loadCatalog, loadIndex, loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { pickShelf } from '~/lib/shelf'
import { dayRange, eventsOn } from '~/lib/today'
import { kstToday } from '~/lib/week'
import type { CatalogEventIndexItem } from '~/types/files'

/**
 * 커밋된 data/*.json 실물로 홈의 데이터 경로 전체를 통과시킨다.
 * 의도적으로 오늘 날짜에 묶여 있다 — 빌드가 그렇게 하기 때문.
 * 배치가 멈춰 데이터가 묵으면 여기가 깨진다. 그게 정확한 신호다.
 */
describe('실데이터 스모크: 주간 파일', () => {
  it('주간 파일의 weekKey가 meta와 일치한다', () => {
    const meta = loadMeta()
    expect(loadWeek(meta.weekKey).weekKey).toBe(meta.weekKey)
  })
})

/**
 * 탐색 카탈로그의 실데이터 무결성. 빌드(전량 프리렌더 + 클라이언트 fetch)가
 * 기대는 것과 정확히 같은 경로다.
 */
describe('실데이터 스모크: 탐색 카탈로그', () => {
  const index = loadIndex()
  const catalog = loadCatalog()
  const placesFile = loadPlaces()

  it('인덱스의 행사 id가 전부 catalog.json에서 해석된다 — 상세 SSG의 전제', () => {
    // 인덱스가 비어 있으면 아래 루프가 공허하게 통과한다 — 먼저 행사가 실제로 있는지 확인한다
    expect(index.items.filter((i) => i.kind === 'event').length).toBeGreaterThan(0)
    const ids = new Set(catalog.items.map((i) => i.id))
    for (const item of index.items) {
      if (item.kind === 'event') expect(ids.has(item.id), item.id).toBe(true)
    }
  })

  it('추천 선반이 1~3장이고 전부 이미지가 있다', () => {
    const events = index.items.filter((i): i is CatalogEventIndexItem => i.kind === 'event')
    const shelf = pickShelf(events, kstToday(new Date(index.generatedAt)))
    expect(shelf.length).toBeGreaterThanOrEqual(1)
    expect(shelf.length).toBeLessThanOrEqual(3)
    for (const item of shelf) expect(item.imageUrl, item.id).toBeTruthy()
  })

  it('인덱스의 장소 id가 전부 places.json에서 해석된다', () => {
    const ids = new Set(placesFile.items.map((i) => i.id))
    for (const item of index.items) {
      if (item.kind === 'place') expect(ids.has(item.id), item.id).toBe(true)
    }
  })

  it('인덱스를 만든 날의 오늘 탭이 비지 않는다 — 홈 목록의 전제', () => {
    const events = index.items.filter((i): i is CatalogEventIndexItem => i.kind === 'event')
    const today = kstToday(new Date(index.generatedAt))
    expect(eventsOn(events, dayRange('today', today)).length).toBeGreaterThan(0)
  })

  it('horizonEnd가 인덱스와 카탈로그에서 일치한다', () => {
    expect(index.horizonEnd).toBe(catalog.horizonEnd)
  })

  it('(0,0) 좌표가 없다 — 좌표 없으면 생략 규칙의 실데이터 검증', () => {
    for (const item of index.items) {
      if (item.lat !== undefined) expect(item.lat, item.id).not.toBe(0)
    }
  })

  it('meta에 anomalies·unmappedCategories가 기록돼 있다', () => {
    const meta = loadMeta()
    expect(meta.anomalies).toBeTypeOf('number')
    expect(Array.isArray(meta.unmappedCategories)).toBe(true)
  })
})
