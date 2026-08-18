import type { Item, PlaceItem } from '~/types/item'

const WEIGHTS = {
  hasSummary: 10,
  hasSubwayInfo: 8,
  isFree: 6,
  hasHours: 5,
  hasAddress: 3,
} as const

/**
 * 자격: 이미지와 좌표가 둘 다 있는 place만.
 * 이미지 없는 카드는 홈 하단에서 초라해 보이고,
 * 좌표가 없으면 근처 화면으로 이어지지 않는다.
 */
function isEligible(item: Item): item is PlaceItem {
  return item.kind === 'place' && !!item.imageUrl && item.lat != null && item.lng != null
}

function scorePlace(p: PlaceItem): number {
  let score = 0
  if (p.summary) score += WEIGHTS.hasSummary
  if (p.subwayInfo) score += WEIGHTS.hasSubwayInfo
  if (p.isFree) score += WEIGHTS.isFree
  if (p.hours) score += WEIGHTS.hasHours
  if (p.address) score += WEIGHTS.hasAddress
  return score
}

/** 문자열 → 32비트 시드 (FNV-1a) */
function seedFrom(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * 회전 풀 크기 = count × 이 값. 상위 몇 배까지를 "보여줄 만한 곳"으로 볼지.
 *
 * 전체를 회전 대상으로 삼으면 점수가 무의미해진다 — 1등이든 꼴등이든
 * 회전 창에 걸리느냐만 남기 때문이다. 반대로 풀을 count와 같게 하면
 * 매주 같은 곳만 나온다. 3배는 품질 하한과 주간 다양성이 둘 다 사는 지점이다.
 */
const ROTATION_POOL_MULTIPLIER = 3

/**
 * "언제 가도 좋은 곳" 선정.
 *
 * 점수 상위 풀(count × 3)을 만든 뒤, 그 안에서만 주차 시드로 시작 위치를 옮겨
 * count개를 순환 추출한다. 매주 다른 조합이 나오면서도 같은 주에는 항상 같은
 * 결과가 나오고(빌드 재현성), 점수가 낮은 곳은 애초에 후보에 못 든다.
 *
 * LLM을 쓰지 않는 이유: place는 상설이라 "이번 주에 왜 볼 만한가"라는
 * 판단이 성립하지 않는다. 회전만으로 신선함이 충분하다.
 */
export function pickPlaces(items: Item[], weekKey: string, count = 6): string[] {
  const ranked = items
    .filter(isEligible)
    .map((p) => ({ p, score: scorePlace(p) }))
    // 동점은 id 순으로 안정 정렬 — 입력 순서에 의존하지 않는다
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .map(({ p }) => p.id)

  if (ranked.length <= count) return ranked

  const pool = ranked.slice(0, count * ROTATION_POOL_MULTIPLIER)
  const offset = seedFrom(weekKey) % pool.length
  return Array.from({ length: count }, (_, i) => pool[(offset + i) % pool.length]!)
}
