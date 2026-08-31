import type { LlmProvider } from '~/llm/types'
import { unmappedCategories } from '~/lib/category'
import { curate } from '~/pipeline/curate'
import type { EmitPayload } from '~/pipeline/emit'
import { mergeItems } from '~/pipeline/merge'
import { pickPlaces } from '~/pipeline/pick-places'
import { selectCatalog } from '~/pipeline/select-catalog'
import { selectCandidates } from '~/pipeline/score'
import { weekLabel, weekRange } from '~/lib/week'
import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem, Item, PlaceItem } from '~/types/item'

export interface RunOptions {
  sources: EventSource<any, any>[]
  provider: LlmProvider
  weekKey: string
  /** KST 기준 오늘(YYYY-MM-DD). 이미 끝난 행사를 잘라내는 기준. CLI가 넘긴다. */
  today: string
  cache: DetailCache
  curatedCount?: number
  placeCount?: number
  candidateCount?: number
}

/**
 * fetch → hydrate → normalize → merge → score → curate → (payload)
 * 파일 쓰기는 하지 않는다. emit()이 검증과 함께 담당한다.
 */
export async function runPipeline(opts: RunOptions): Promise<EmitPayload> {
  const {
    sources, provider, weekKey, today, cache,
    curatedCount = 12, placeCount = 6, candidateCount = 40,
  } = opts

  const groups: Item[][] = []
  const sourceCounts: Record<string, number> = {}

  for (const source of sources) {
    console.log(`[${source.name}] 수집 중...`)
    const list = await source.fetchList()
    const hydrated = await source.hydrate(list, cache)
    const items = source.normalize(hydrated)
    sourceCounts[source.name] = items.length
    groups.push(items)
    console.log(`[${source.name}] ${list.length}건 → 정규화 ${items.length}건`)
  }

  const merged = mergeItems(groups)
  console.log(`병합 후 ${merged.length}건 (중복 ${groups.flat().length - merged.length}건 제거)`)

  const allEvents = merged.filter((i): i is EventItem => i.kind === 'event')
  const places = merged.filter((i): i is PlaceItem => i.kind === 'place')

  // 카탈로그는 주간 창과 무관한 8주 지평이다 — 주간 필터보다 먼저 골라야
  // 미래 시작 행사가 살아 있다(주간 파일의 미래 행사는 0건 — 스펙 3장 실측)
  const catalog = selectCatalog(allEvents, places, today)
  for (const a of catalog.anomalies) {
    // stderr — 실패를 숨기지 않는다. 건수는 emit이 meta.anomalies로 남긴다
    console.error(`[카탈로그] endDate 이상치 제외: ${a.id} (${a.endDate})`)
  }
  const unmapped = unmappedCategories([...catalog.events, ...catalog.places])
  if (unmapped.length > 0) {
    console.error(`[카탈로그] 미매핑 카테고리 ${unmapped.length}건 → '기타'로 노출: ${unmapped.join(', ')}`)
  }
  console.log(`카탈로그 ${catalog.events.length}건 (오늘~${catalog.horizonEnd}) / 이상치 ${catalog.anomalies.length}건`)

  // 과거 컷오프: 유효 시작일은 max(주 시작일, 오늘).
  // 주 시작일만 쓰면 월요일에 끝난 행사가 목요일 화면에 남는다.
  const { start, end } = weekRange(weekKey)
  const from = today > start ? today : start
  const events = allEvents.filter((e) => e.startDate <= end && e.endDate >= from)
  console.log(`이번 주 이벤트 ${events.length}건 (${from}~${end}) / 장소 ${places.length}건`)

  const candidates = selectCandidates(events, weekKey, today, candidateCount)
  console.log(`후보 ${candidates.length}건 → 선별 ${curatedCount}건 요청`)

  const { entries, providerName } = await curate(candidates, {
    provider,
    count: curatedCount,
    weekLabel: weekLabel(weekKey),
  })

  return {
    weekKey,
    events,
    places,
    curated: entries,
    curatedPlaces: pickPlaces(places, weekKey, placeCount),
    providerName,
    cache,
    sourceCounts,
    catalog,
    unmappedCategories: unmapped,
  }
}
