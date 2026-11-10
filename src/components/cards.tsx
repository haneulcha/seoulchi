import { useState, type ReactNode } from 'react'

/**
 * 썸네일 카드의 view. 도메인을 모른다 — 받은 값을 자리에 놓기만 한다.
 * 값을 만드는 일(사실 계산, 기관명 떼기, 링크)은 감싸는 도메인 컴포넌트가 한다.
 * tests/components/cards.test.ts가 이 파일의 도메인 import를 막는다.
 */

/**
 * 행사 이미지는 거의 전부 세로 포스터다 — 실측한 원본 비율이 0.67~0.71에 몰려 있다.
 * 2/3(0.67)에 담으면 거의 자르지 않는다(2026-10-31, 3/4는 약 5%를 잘랐다). 이전의 16:9는 62%를 잘라내서 포스터를 무늬로 만들었다.
 * 소스 비율을 존중하는 것만으로 해결되므로 블러 배경이나 레터박스 같은 장치가 필요 없다.
 */
const POSTER = 'aspect-[2/3]'

/** 카드 본문. eyebrow는 제목 위 가장 약한 줄, subtitle은 제목 아래 작은 줄, meta는 늘 있는 사실 줄, extra는 값이 있을 때만 나오는 줄 */
export type CardText = {
  eyebrow?: string
  title: string
  subtitle?: string
  meta: string
  extra?: ReactNode
}

/**
 * 이미지가 못 뜨면(onError) fallbackColor 블록으로 대신한다(스펙 14장 #3).
 * alt는 호출 측이 정한다. 제목이 바로 옆에 있는 카드에서는 ''(장식)이 맞다.
 */
export function Thumbnail(props: {
  src?: string
  alt: string
  fallbackColor: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!props.src || failed) {
    return (
      <div
        aria-hidden
        className={props.className}
        style={{ backgroundColor: props.fallbackColor }}
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

const BADGE_TONE = { success: 'bg-success-subtle text-success' }

export function Badge({ tone, children }: { tone: keyof typeof BADGE_TONE; children: ReactNode }) {
  return <span className={`mr-100 rounded-full px-100 py-025 text-body-s ${BADGE_TONE[tone]}`}>{children}</span>
}

/** 이미지 자리. src가 없거나 못 뜨면 fallbackColor 블록이다 */
type CardImage = { src?: string; fallbackColor: string }

/**
 * 모든 카드 공통의 본문. 고정 줄(meta)은 늘 같은 자리에 있고, 조건부 줄(extra)은 없으면 통째로 접는다.
 * 배지는 조건부 줄 맨 앞에 둔다 — 고정 줄 끝에 붙이면 장소 2열 칸에서 시간 뒤로 밀려 잘렸다.
 */
function CardBody({ eyebrow, title, subtitle, meta, extra, className }: CardText & { className: string }) {
  return (
    <div className={className}>
      {eyebrow && <p className="truncate text-body-s text-neutral-subtle">{eyebrow}</p>}
      <h3 className="line-clamp-2 text-title-s">{title}</h3>
      {subtitle && <p className="truncate text-body-s text-neutral-subtle">{subtitle}</p>}
      <p className="mt-100 truncate text-body-s text-neutral-muted">{meta}</p>
      {extra && <p className="truncate text-body-s text-neutral-muted">{extra}</p>}
    </div>
  )
}

/**
 * 포스터 카드. 폭과 상관없이 **세로 카드**다. 폭은 담는 쪽(선반)이 정한다.
 * 위계는 크기가 아니라 **모양**(선반 대 목록)으로 만든다.
 */
export function PosterCard({ image, ...text }: CardText & { image: CardImage }) {
  return (
    <div>
      <Thumbnail {...image} alt="" className={`${POSTER} w-full rounded-100 object-cover`} />
      <CardBody {...text} className="mt-100 min-w-0" />
    </div>
  )
}

/**
 * 썸네일 행. 썸네일 비율만 다르다 — 포스터는 2/3, 장소 사진은 가로형이라 4/3.
 * 한때 64px 1:1 썸네일을 뺐다 — 세로 포스터를 정사각으로 자른 조각은 알아볼 수 없었다.
 */
export function ThumbnailRow({
  image, shape, ...text
}: CardText & { image: CardImage; shape: 'poster' | 'photo' }) {
  return (
    <div className="flex gap-150 border-t border-neutral py-150">
      <Thumbnail
        {...image}
        alt=""
        className={`${shape === 'poster' ? `${POSTER} w-20` : 'aspect-[4/3] w-28'} shrink-0 self-start rounded-050 object-cover`}
      />
      <CardBody {...text} className="min-w-0" />
    </div>
  )
}
