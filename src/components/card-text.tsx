import type { ReactNode } from 'react'
import type { CardText } from '~/components/cards'
import { splitTitle, type CardFacts } from '~/lib/card-facts'

/**
 * 카드 사실을 view의 자리로 옮긴다. 제목 맨 앞 대괄호 기관명은 제목 아래 작은 줄로 내린다(PRODUCT.md 안티레퍼런스 1번).
 * 고정 줄은 어디 · 거리 · 시간, 조건부 줄은 배지 · 가격 · 남은 기간이고 조각이 없으면 줄째 접는다.
 */
export function cardText(title: string, facts: CardFacts, badge?: ReactNode): CardText {
  const t = splitTitle(title)
  return {
    eyebrow: facts.genre,
    title: t.title,
    subtitle: t.org,
    meta: [facts.where, facts.distance, facts.time].filter(Boolean).join(' · '),
    extra: (badge || facts.price || facts.deadline) && (
      <>
        {badge}
        {facts.price && (
          <span className={facts.price === '무료' ? 'text-success' : undefined}>{facts.price}</span>
        )}
        {facts.price && facts.deadline && ' · '}
        {facts.deadline}
      </>
    ),
  }
}
