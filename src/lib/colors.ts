/** Tailwind 600 톤 8색. 이미지 폴백 블록이 본문 텍스트와 싸우지 않을 만큼 진하다 */
const PALETTE = [
  '#dc2626', // red-600
  '#ea580c', // orange-600
  '#ca8a04', // yellow-600
  '#16a34a', // green-600
  '#0d9488', // teal-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
] as const

/**
 * 카테고리 → 색. 해시가 결정론적이라 같은 카테고리는 항상 같은 색 —
 * 리렌더·페이지 간에 색이 튀지 않는다. 이미지 로드 실패 폴백에 쓴다.
 */
export function categoryColor(category: string): string {
  let hash = 0
  for (const ch of category) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return PALETTE[hash % PALETTE.length]!
}
