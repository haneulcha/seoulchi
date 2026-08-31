import type { CategoryGroup } from '~/lib/category'
import { addDays, weekdayOf } from '~/lib/dates'
import { haversineKm, type LatLng } from '~/lib/geo'
import { isOpenNow } from '~/lib/open-now'
import type { CatalogEventIndexItem, CatalogIndexItem } from '~/types/files'

export interface BrowseFilters {
  /** undefined = 전체. '기타'는 칩에 없지만 전체에는 있다(스펙 7장) */
  group?: CategoryGroup
  district?: string
  free?: boolean
  open?: boolean
}

/**
 * 필터 조합(AND). now는 인자다 — 내부 new Date() 금지(레포 규칙).
 *
 * `open`은 아는 것만 거른다: hours가 있는 장소 중 닫힌 곳만 떨어뜨리고,
 * hours 미상 207건은 남긴다 — 버리면 화면이 '안 열려 있다'고 거짓말한다(스펙 8장).
 * 행사는 건드리지 않는다: Event와 Place는 시간 의미가 다르다(AGENTS.md).
 */
export function applyFilters(
  items: CatalogIndexItem[],
  filters: BrowseFilters,
  now: Date,
): CatalogIndexItem[] {
  return items.filter((item) => {
    if (filters.group && item.group !== filters.group) return false
    if (filters.district && item.district !== filters.district) return false
    if (filters.free && item.isFree !== true) return false
    if (filters.open && item.kind === 'place' && item.hours && !isOpenNow(item.hours, now)) {
      return false
    }
    return true
  })
}

export interface TimelineGroup {
  key: string
  label: string
  start: string
  end: string
  items: CatalogEventIndexItem[]
}

const maxStr = (a: string, b: string) => (a > b ? a : b)
const minStr = (a: string, b: string) => (a < b ? a : b)

/** 'YYYY-MM-DD'가 속한 달의 마지막 날 */
function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
}

/**
 * 시간 축은 필터가 아니라 목록의 골격이다(스펙 7장).
 * [today, horizonEnd]를 겹침 없이 나눈다: 오늘~금 / 이번 주말 / 다음 주 / 월별.
 * 항목은 유효 시작일 max(startDate, today)가 속한 그룹에 한 번만 놓는다 —
 * 홈의 effectiveStart와 같은 관용구. 진행 중 장기 전시(82%)는 전부 첫 그룹에
 * 모이고, 뒤 그룹은 자연히 "그때 새로 시작하는 것"만 남는다.
 */
export function groupByTimeline(
  events: CatalogEventIndexItem[],
  today: string,
  horizonEnd: string,
): TimelineGroup[] {
  const iso = (weekdayOf(today) + 6) % 7 // 0=월 … 6=일
  const monday = addDays(today, -iso)
  const groups: TimelineGroup[] = []
  const push = (key: string, label: string, start: string, end: string) => {
    if (start <= horizonEnd) groups.push({ key, label, start, end: minStr(end, horizonEnd), items: [] })
  }

  if (iso <= 4) push('week', '이번 주', today, addDays(monday, 4)) // 오늘이 토·일이면 생략(스펙 7장)
  push('weekend', '이번 주말', maxStr(today, addDays(monday, 5)), addDays(monday, 6))
  push('next-week', '다음 주', addDays(monday, 7), addDays(monday, 13))

  let cursor = addDays(monday, 14)
  const todayYear = today.slice(0, 4)
  while (cursor <= horizonEnd) {
    const end = endOfMonth(cursor)
    const [y, m] = cursor.split('-').map(Number)
    const label = String(y) === todayYear ? `${m}월` : `${y}년 ${m}월`
    push(`month-${y}-${m}`, label, cursor, end)
    cursor = addDays(end, 1)
  }

  // groups가 비면 아래 폴백(groups[groups.length - 1])이 undefined가 되고,
  // 예전 코드의 `g?.items.push(e)`처럼 옵셔널 체이닝이 모든 행사를 조용히
  // 삼킨다 — horizonEnd < today(인덱스가 8주 넘게 묵음)일 때 재현된다.
  // 조용한 0건은 스펙 8장·PRODUCT.md 위반이므로 여기서 계약 위반을 던진다.
  if (groups.length === 0) {
    throw new Error(
      `시간 축 그룹을 만들 수 없습니다: horizonEnd(${horizonEnd})가 today(${today})보다 앞섭니다 — 인덱스가 8주 넘게 묵었습니다`,
    )
  }

  for (const e of events) {
    const eff = maxStr(e.startDate, today)
    // selectCatalog가 [today, horizonEnd] 밖을 이미 걸렀으므로 보통은 찾는다.
    // 못 찾으면(경계 오차 등) 데이터를 버리지 않고 마지막 그룹에 넣는다 —
    // 위에서 groups가 비지 않음을 보장했으므로 g는 항상 존재한다.
    const g = groups.find((g) => g.start <= eff && eff <= g.end) ?? groups[groups.length - 1]!
    g.items.push(e)
  }

  // 그룹 안 정렬: 유효 시작일 → 종료일(마감 임박순) → id. 홈 pickHomeItems와 같은 결정론
  for (const g of groups) {
    g.items.sort(
      (a, b) =>
        maxStr(a.startDate, today).localeCompare(maxStr(b.startDate, today)) ||
        a.endDate.localeCompare(b.endDate) ||
        a.id.localeCompare(b.id),
    )
  }
  return groups
}

export interface DistanceEntry {
  item: CatalogIndexItem
  /** 좌표 없는 항목은 undefined — 거리 미상이지 존재 미상이 아니다 */
  km?: number
}

/** 가까운 순. 행사·장소가 거리 하나로 선다 — "여기서 뭐 하고 있지"에서 그 구분은 의미가 없다(스펙 7장) */
export function sortByDistance(items: CatalogIndexItem[], origin: LatLng): DistanceEntry[] {
  const located: DistanceEntry[] = []
  const unlocated: DistanceEntry[] = []
  for (const item of items) {
    if (item.lat !== undefined && item.lng !== undefined) {
      located.push({ item, km: haversineKm(origin, { lat: item.lat, lng: item.lng }) })
    } else {
      unlocated.push({ item })
    }
  }
  located.sort((a, b) => a.km! - b.km! || a.item.id.localeCompare(b.item.id))
  unlocated.sort((a, b) => a.item.id.localeCompare(b.item.id))
  return [...located, ...unlocated]
}

export type RelaxableFilter = 'group' | 'district' | 'free' | 'open'

export interface RelaxSuggestion {
  filter: RelaxableFilter
  count: number
}

export const FILTER_LABELS: Record<RelaxableFilter, string> = {
  group: '카테고리', district: '자치구', free: '무료만', open: '지금 열림',
}

/**
 * 0건일 때 "어떤 필터를 풀면 몇 건이 나오는지"(스펙 8장 — 크리틱 휴리스틱 9의 응답).
 * 켜진 필터를 하나씩 꺼 보고, 0건이 아닌 것만 건수 내림차순으로 돌려준다.
 */
export function relaxSuggestions(
  items: CatalogIndexItem[],
  filters: BrowseFilters,
  now: Date,
): RelaxSuggestion[] {
  const active: RelaxableFilter[] = []
  if (filters.group) active.push('group')
  if (filters.district) active.push('district')
  if (filters.free) active.push('free')
  if (filters.open) active.push('open')

  return active
    .map((f) => ({ filter: f, count: applyFilters(items, { ...filters, [f]: undefined }, now).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || a.filter.localeCompare(b.filter))
}

/** 1km 미만은 m로 — '0.8km'보다 '850m'가 걷는 사람의 단위다 */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}
