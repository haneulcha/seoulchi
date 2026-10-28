import { addDays, weekdayOf } from '~/lib/dates'
import { eventOpenWeekdays } from '~/lib/event-days'
import type { HomeEntry } from '~/lib/home'
import type { CatalogEventIndexItem } from '~/types/files'

export type DayTab = 'today' | 'tomorrow' | 'weekend'

/** 이번 주말은 다가오는 토·일. 토요일이면 토·일, 일요일이면 일요일 하루 */
export function dayRange(tab: DayTab, today: string): { start: string; end: string } {
  if (tab === 'today') return { start: today, end: today }
  if (tab === 'tomorrow') {
    const d = addDays(today, 1)
    return { start: d, end: d }
  }
  const wd = weekdayOf(today)
  if (wd === 0) return { start: today, end: today }
  const sat = addDays(today, 6 - wd)
  return { start: sat, end: addDays(sat, 1) }
}

/** 범위 안의 날 중 하루라도 기간 안이고 그 요일에 여는 행사. 범위는 최대 이틀이라 날마다 본다 */
export function eventsOn(
  items: CatalogEventIndexItem[],
  range: { start: string; end: string },
): CatalogEventIndexItem[] {
  return items.filter((item) => {
    const open = eventOpenWeekdays(item.time)
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
      if (item.startDate <= d && d <= item.endDate && (!open || open.includes(weekdayOf(d)))) return true
    }
    return false
  })
}

/** 곧 끝나는 순. 같으면 id — 결정론 */
export function sortByDeadline(items: CatalogEventIndexItem[]): CatalogEventIndexItem[] {
  return [...items].sort((a, b) => a.endDate.localeCompare(b.endDate) || a.id.localeCompare(b.id))
}

/** 추천 선반. 이번 주말까지 하루도 갈 수 없는 추천을 먼저 빼고 앞에서 count개. 요일은 보지 않는다 */
export function pickShelf(picks: HomeEntry[], today: string, count = 3): HomeEntry[] {
  const weekendEnd = dayRange('weekend', today).end
  return picks.filter(({ item }) => item.endDate >= today && item.startDate <= weekendEnd).slice(0, count)
}
