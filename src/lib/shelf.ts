import { addDays } from '~/lib/dates'
import type { LatLng } from '~/lib/geo'
import { haversineKm } from '~/lib/geo'
import { dayRange } from '~/lib/today'
import type { CatalogEventIndexItem } from '~/types/files'

/** 거리(km)에서 깎아 주는 가산점. 클수록 먼 행사도 앞에 선다 */
export const SHELF_BONUS_KM = { free: 1.5, cheap: 1, local: 0.5, fresh: 1 } as const
export const CHEAP_MAX_WON = 20_000
export const FRESH_DAYS = 3

/** 서울 5개 생활권. 순서가 동점 순서다 */
export const ZONES: ReadonlyArray<{ name: string; districts: readonly string[] }> = [
  { name: '도심', districts: ['종로구', '중구', '용산구'] },
  { name: '동북', districts: ['성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구'] },
  { name: '서북', districts: ['은평구', '서대문구', '마포구'] },
  { name: '서남', districts: ['양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구'] },
  { name: '동남', districts: ['서초구', '강남구', '송파구', '강동구'] },
]

export function shelfBonusKm(item: CatalogEventIndexItem, today: string): number {
  const b = SHELF_BONUS_KM
  let bonus = 0
  if (item.minPrice === 0 || item.isFree === true) bonus += b.free
  else if (item.minPrice !== undefined && item.minPrice <= CHEAP_MAX_WON) bonus += b.cheap
  if (item.localVenue) bonus += b.local
  const lo = addDays(today, -FRESH_DAYS)
  const hi = addDays(today, FRESH_DAYS)
  if ((item.startDate >= lo && item.startDate <= hi) || (!item.openRun && item.endDate <= hi)) bonus += b.fresh
  return bonus
}

const byId = (a: CatalogEventIndexItem, b: CatalogEventIndexItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** 같은 장소(이름이 같거나 좌표가 소수 셋째 자리, 약 100m까지 같음)는 먼저 나온 1장만 남기고 count장까지 */
function takeDistinctPlaces(sorted: CatalogEventIndexItem[], count: number): CatalogEventIndexItem[] {
  const seen = new Set<string>()
  const out: CatalogEventIndexItem[] = []
  for (const it of sorted) {
    const keys = [it.place]
    if (it.lat !== undefined && it.lng !== undefined) keys.push(`@${it.lat.toFixed(3)},${it.lng.toFixed(3)}`)
    if (keys.some((k) => seen.has(k))) continue
    for (const k of keys) seen.add(k)
    out.push(it)
    if (out.length === count) break
  }
  return out
}

export function pickShelf(
  items: CatalogEventIndexItem[],
  today: string,
  origin?: LatLng,
  count = 3,
): CatalogEventIndexItem[] {
  const end = dayRange('weekend', today).end
  const bonus = new Map<CatalogEventIndexItem, number>()
  const pool = items.filter((it) => it.imageUrl && it.endDate >= today && it.startDate <= end) // 선반은 포스터 카드다
  for (const it of pool) bonus.set(it, shelfBonusKm(it, today))
  const b = (it: CatalogEventIndexItem) => bonus.get(it) ?? 0

  if (origin) {
    const located: Array<{ it: CatalogEventIndexItem; score: number }> = []
    const rest: CatalogEventIndexItem[] = []
    for (const it of pool) {
      if (it.lat !== undefined && it.lng !== undefined) {
        located.push({ it, score: haversineKm(origin, { lat: it.lat, lng: it.lng }) - b(it) })
      } else rest.push(it)
    }
    located.sort((x, y) => x.score - y.score || byId(x.it, y.it))
    rest.sort((x, y) => b(y) - b(x) || byId(x, y))
    return takeDistinctPlaces([...located.map((l) => l.it), ...rest], count)
  }

  const winners: CatalogEventIndexItem[] = []
  for (const zone of ZONES) {
    const best = pool
      .filter((it) => it.district !== undefined && zone.districts.includes(it.district))
      .sort((x, y) => b(y) - b(x) || (x.endDate < y.endDate ? -1 : x.endDate > y.endDate ? 1 : 0) || byId(x, y))[0]
    if (best) winners.push(best)
  }
  winners.sort((x, y) => b(y) - b(x)) // 안정 정렬 — 동점은 ZONES 순서
  return takeDistinctPlaces(winners, count)
}
