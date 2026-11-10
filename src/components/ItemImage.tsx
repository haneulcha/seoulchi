import { Thumbnail } from '~/components/cards'
import { categoryColor } from '~/lib/colors'

/**
 * 이미지가 못 뜨면 카테고리 색 블록으로 폴백한다(스펙 14장 #3).
 * categoryColor가 결정론적이라 같은 카테고리는 항상 같은 색 — 폴백이 튀지 않는다.
 */
export function ItemImage({ category, ...props }: {
  src?: string
  alt: string
  category: string
  className?: string
}) {
  return <Thumbnail {...props} fallbackColor={categoryColor(category)} />
}
