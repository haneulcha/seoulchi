import { useState } from 'react'
import { categoryColor } from '~/lib/colors'

/**
 * 이미지가 못 뜨면(onError) 카테고리 색 블록으로 폴백한다(스펙 14장 #3).
 * categoryColor가 결정론적이라 같은 카테고리는 항상 같은 색 — 폴백이 튀지 않는다.
 * alt는 호출 측이 정한다. 제목이 바로 옆에 있는 카드에서는 ''(장식)이 맞다.
 */
export function ItemImage(props: {
  src?: string
  alt: string
  category: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!props.src || failed) {
    return (
      <div
        aria-hidden
        className={props.className}
        style={{ backgroundColor: categoryColor(props.category) }}
      />
    )
  }

  return (
    <img
      src={props.src}
      alt={props.alt}
      loading="lazy"
      className={props.className}
      onError={() => setFailed(true)}
    />
  )
}
