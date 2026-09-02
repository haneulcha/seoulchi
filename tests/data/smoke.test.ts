import { describe, expect, it } from 'vitest'
import { loadCatalog, loadCurated, loadIndex, loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { resolveCurated } from '~/data/resolve'
import { pickHomeItems } from '~/lib/home'
import { kstToday } from '~/lib/week'

/**
 * 커밋된 data/*.json 실물로 홈의 데이터 경로 전체를 통과시킨다.
 * 의도적으로 오늘 날짜에 묶여 있다 — 빌드가 그렇게 하기 때문.
 * 배치가 멈춰 데이터가 묵으면 여기가 깨진다. 그게 정확한 신호다.
 */
describe('실데이터 스모크: 홈이 요구하는 18개 id가 전부 해석된다', () => {
  const meta = loadMeta()
  const week = loadWeek(meta.weekKey)
  const curated = loadCurated(meta.weekKey)
  const places = loadPlaces()
  const resolved = resolveCurated(curated, week.items, places.items)

  it('주간 파일의 weekKey가 meta와 일치한다', () => {
    expect(week.weekKey).toBe(meta.weekKey)
    expect(curated.weekKey).toBe(meta.weekKey)
  })

  it('curated places 6개가 전부 places.json에서 해석된다', () => {
    expect(curated.places).toHaveLength(6)
    expect(resolved.places).toHaveLength(6)
  })

  it('홈 12자리가 채워지고 전부 이미지가 있다', () => {
    const today = kstToday(new Date())
    const home = pickHomeItems({ events: week.items, picks: resolved.picks, today })
    expect(home).toHaveLength(12)
    // 카드 12장이 초라해지지 않는지 — 실측상 event 이미지 보유율 100%
    for (const { item } of home) expect(item.imageUrl).toBeTruthy()
  })

  it('place 6개 카드가 전부 이미지가 있다 — 배치의 자격 필터(스펙 10-1)가 지켜졌다', () => {
    for (const p of resolved.places) expect(p.imageUrl).toBeTruthy()
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

  it('인덱스의 장소 id가 전부 places.json에서 해석된다', () => {
    const ids = new Set(placesFile.items.map((i) => i.id))
    for (const item of index.items) {
      if (item.kind === 'place') expect(ids.has(item.id), item.id).toBe(true)
    }
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
