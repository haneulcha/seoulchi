import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ItemImage } from '~/components/ItemImage'
import { cardFacts, splitTitle, type CardFacts } from '~/lib/card-facts'
import type { HomeEntry } from '~/lib/home'

/**
 * 행사 이미지는 거의 전부 세로 포스터다 — 실측한 원본 비율이 0.67~0.71에 몰려 있다.
 * 3/4(0.75)에 담으면 크롭이 약 5%다. 이전의 16:9는 62%를 잘라내서 포스터를 무늬로 만들었다.
 * 소스 비율을 존중하는 것만으로 해결되므로 블러 배경이나 레터박스 같은 장치가 필요 없다.
 */
const POSTER = 'aspect-[3/4]'

/** 제목 맨 앞 대괄호 기관명은 제목 아래 작은 줄로 내린다(PRODUCT.md 안티레퍼런스 1번) */
function CardTitle({ title, className }: { title: string; className: string }) {
  const t = splitTitle(title)
  return (
    <>
      <h3 className={className}>{t.title}</h3>
      {t.org && <p className="truncate text-caption text-ink-subtle">{t.org}</p>}
    </>
  )
}

/**
 * 모든 카드 공통의 사실 두 줄. 고정 줄(어디 · 거리 · 시간)은 늘 같은 자리에 있고,
 * 조건부 줄(지금 열림 · 가격 · 남은 기간)은 조각이 없으면 통째로 접는다.
 * 배지는 조건부 줄 맨 앞에 둔다 — 고정 줄 끝에 붙이면 장소 2열 칸에서 시간 뒤로 밀려 잘렸다.
 */
function FactLines({
  facts, badge, size = 'text-body',
}: { facts: CardFacts; badge?: ReactNode; size?: 'text-body' | 'text-caption' }) {
  const fixed = [facts.where, facts.distance, facts.time].filter(Boolean).join(' · ')
  return (
    <>
      <p className={`mt-050 truncate ${size} text-ink-muted`}>{fixed}</p>
      {(badge || facts.price || facts.deadline) && (
        <p className={`truncate ${size} text-ink-muted`}>
          {badge}
          {facts.price && (
            <span className={facts.price === '무료' ? 'text-success-text' : undefined}>{facts.price}</span>
          )}
          {facts.price && facts.deadline && ' · '}
          {facts.deadline}
        </p>
      )}
    </>
  )
}

/**
 * 추천 3개 — 포스터 카드. 폭과 상관없이 **세로 카드**다.
 *
 * 모바일 전폭 3/4 포스터는 477px이라 한 장이 화면을 다 먹는다. 그래서 모바일에서는 폭 62%의 카드를
 * 가로로 넘기는 선반에 담고(홈이 정한다), md 이상에서는 3단 그리드에 선다.
 * 예전 모바일 구조(96px 포스터 + 텍스트 가로 행)는 아래 목록 행에 썸네일이 돌아오면서 크기만 다른
 * 같은 모양이 됐다. 위계는 크기가 아니라 **모양**(선반 대 목록)으로 만든다.
 */
export function EventPosterCard({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="block w-36 shrink-0 snap-start md:w-44">
      <ItemImage
        src={e.imageUrl}
        alt=""
        category={e.category}
        className={`${POSTER} w-full rounded-100 object-cover`}
      />
      {/* 제목·메타는 붙이고(mt-050) 코멘트는 떼어 놓는다(mt-100) — 코멘트는 사실이 아니라 목소리다 */}
      <div className="mt-100 min-w-0">
        <CardTitle title={e.title} className="line-clamp-2 text-title-card" />
        <FactLines facts={cardFacts(e, { today })} />
        {/* 코멘트는 있을 때만 — 운영 배치(rule)는 reason이 빈 문자열이다. 빈 자리를 남기지 않는다 */}
        {entry.reason !== '' && <p className="mt-100 line-clamp-2 text-body text-ink-subtle">{entry.reason}</p>}
      </div>
    </Link>
  )
}

/**
 * 목록 행 — 홈의 그날 목록과 탐색의 행사·장소 행이 모두 이 모양이다. 썸네일 비율만 다르다.
 *
 * 한때 64px 1:1 썸네일을 뺐다 — 세로 포스터를 정사각으로 자른 조각은 알아볼 수 없었다.
 * 3/4로 담으면 크롭이 약 5%라 작아도 포스터로 읽힌다(탐색에서 확인). 장소 사진은 가로형이라 4/3.
 */
export function ListRow({
  id, image, title, facts, badge,
}: {
  id: string
  image: { src?: string; category: string; shape: 'poster' | 'photo' }
  title: string
  facts: CardFacts
  badge?: ReactNode
}) {
  return (
    <Link to="/e/$id" params={{ id }} className="flex gap-150 border-t border-neutral-border py-150">
      <ItemImage
        src={image.src}
        alt=""
        category={image.category}
        className={`${image.shape === 'poster' ? `${POSTER} w-20` : 'aspect-[4/3] w-28'} shrink-0 self-start rounded-050 object-cover`}
      />
      <div className="min-w-0">
        <CardTitle title={title} className="line-clamp-2 text-title-row" />
        <FactLines facts={facts} badge={badge} size="text-caption" />
      </div>
    </Link>
  )
}
