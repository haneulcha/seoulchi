import { haversineKm } from '~/lib/geo'
import type { Item } from '~/types/item'

/** 비교용 정규화: 공백·기호 제거, 소문자화. '서울 역사 박물관' === '서울역사박물관' */
function normalizeForCompare(text: string): string {
  return text.replace(/[\s\-–—_()[\]<>「」『』"'·,.]/g, '').toLowerCase()
}

function dedupeKey(item: Item): string {
  return `${item.kind}|${normalizeForCompare(item.title)}|${normalizeForCompare(item.place)}`
}

/** 기준 항목에 비어 있는 값만 채운다. 이미 있는 값은 덮어쓰지 않는다. */
const ENRICHABLE = ['summary', 'imageUrl', 'subwayInfo', 'address', 'fee', 'linkUrl'] as const

function enrich(base: Item, other: Item): Item {
  const merged: Record<string, unknown> = { ...base }

  for (const key of ENRICHABLE) {
    if (merged[key] == null && other[key] != null) merged[key] = other[key]
  }
  if (merged.tags == null && other.tags?.length) merged.tags = other.tags

  const from = new Set<string>([...((base.mergedFrom ?? []) as string[]), ...(other.mergedFrom ?? [])])
  from.add(other.id)
  from.delete(base.id)
  merged.mergedFrom = [...from]

  return merged as Item
}

const MIN_CONTAINED_LEN = 4
const SAME_VENUE_KM = 0.5

/** 표기가 다른 소스끼리 같은 행사인지: 기간 겹침 + 500m 이내 + 한쪽 제목이 다른 쪽에 포함(짧은 쪽 4자 이상). */
export function findMatch(item: Item, known: Item[]): Item | undefined {
  if (item.kind !== 'event' || item.lat == null || item.lng == null) return undefined
  const a = normalizeForCompare(item.title)
  // ponytail: 행사 수 × 기존 수 선형 탐색, 소스가 늘어 느려지면 기간·격자로 blocking
  return known.find((k) => {
    if (k.source === item.source || k.kind !== 'event' || k.lat == null || k.lng == null) return false
    if (!(item.startDate <= k.endDate && k.startDate <= item.endDate)) return false
    if (haversineKm({ lat: item.lat!, lng: item.lng! }, { lat: k.lat, lng: k.lng }) > SAME_VENUE_KM) return false
    const b = normalizeForCompare(k.title)
    const [short, long] = a.length <= b.length ? [a, b] : [b, a]
    return short.length >= MIN_CONTAINED_LEN && long.includes(short)
  })
}

/**
 * 여러 소스의 아이템을 병합한다.
 * 인자 순서가 우선순위다 — 앞 그룹의 항목이 기준(id 생존)이 되고, 뒤 그룹은 필드를 얹는다.
 * 근거: 서울시 문화행사가 망라성을 담당하므로 그쪽 id가 안정적인 기준선이 된다.
 */
export function mergeItems(groups: Item[][]): Item[] {
  const byKey = new Map<string, Item>()

  for (const group of groups) {
    for (const item of group) {
      const key = dedupeKey(item)
      const existing = byKey.get(key) ?? findMatch(item, [...byKey.values()])
      if (existing) byKey.set(dedupeKey(existing), enrich(existing, item))
      else byKey.set(key, item)
    }
  }

  return [...byKey.values()]
}
