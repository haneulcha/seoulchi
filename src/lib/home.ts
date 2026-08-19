import type { EventItem } from '~/types/item'

export interface HomeEntry {
  item: EventItem
  /** 큐레이션 코멘트. 규칙 배치(LLM_PROVIDER=rule)에서는 빈 문자열 — 렌더 측이 그 줄을 접는다 */
  reason: string
}

/** max(startDate, today). 배치 score의 과거 컷오프와 같은 관용구 — 프로젝트에 관용구를 하나로 유지한다 */
function effectiveStart(item: EventItem, today: string): string {
  return item.startDate > today ? item.startDate : today
}

/**
 * 홈 12자리. 살아 있는 curated pick을 먼저 놓고(코멘트가 붙어 있으므로),
 * 모자란 자리를 max(startDate, 오늘) 오름차순 → endDate 오름차순 → id 오름차순으로 채운다.
 *
 * curated는 배치가 돈 시점의 판단이라 오늘과 어긋날 수 있다 —
 * 실측: 2026-W33 picks 12개 중 08-18 시점 생존 2개. 보충이 없으면 홈이 빈다.
 * "화면이 절대 비지 않는다"(스펙 8-1)의 앱 쪽 대응이다.
 */
export function pickHomeItems(input: {
  events: EventItem[]
  picks: Array<{ item: EventItem; reason: string }>
  today: string
  count?: number
}): HomeEntry[] {
  const { events, picks, today } = input
  const count = input.count ?? 12

  const alivePicks: HomeEntry[] = picks.filter(({ item }) => item.endDate >= today)
  const pickedIds = new Set(alivePicks.map(({ item }) => item.id))

  const fillers: HomeEntry[] = events
    .filter((e) => e.endDate >= today && !pickedIds.has(e.id))
    .sort(
      (a, b) =>
        effectiveStart(a, today).localeCompare(effectiveStart(b, today)) ||
        a.endDate.localeCompare(b.endDate) ||
        a.id.localeCompare(b.id),
    )
    .map((item) => ({ item, reason: '' }))

  return [...alivePicks, ...fillers].slice(0, count)
}
