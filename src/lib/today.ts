import { addDays, weekdayOf } from '~/lib/dates'
import { eventOpenWeekdays } from '~/lib/event-days'
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

/** id 해시(FNV-1a + murmur3 마무리 섞기). id 문자열 순은 접두어(kp- < sc- < vs-) 때문에 한 출처를 통째로 앞에 세운다 */
function idHash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** 곧 끝나는 순. 같으면 id 해시 — 결정론이면서 출처가 섞인다 */
export function sortByDeadline(items: CatalogEventIndexItem[]): CatalogEventIndexItem[] {
  return [...items].sort((a, b) => a.endDate.localeCompare(b.endDate) || idHash(a.id) - idHash(b.id))
}
