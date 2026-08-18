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
      const existing = byKey.get(key)
      byKey.set(key, existing ? enrich(existing, item) : item)
    }
  }

  return [...byKey.values()]
}
