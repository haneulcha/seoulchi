import { describe, expect, it } from 'vitest'
import { loadCurated, loadMeta, loadPlaces, loadWeek } from '~/data/load'
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
