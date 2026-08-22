import { Link } from '@tanstack/react-router'
import { ItemImage } from '~/components/ItemImage'
import { formatDateRange } from '~/lib/dates'
import type { HomeEntry } from '~/lib/home'
import type { EventItem, PlaceItem } from '~/types/item'

/**
 * 행사 이미지는 거의 전부 세로 포스터다 — 실측한 원본 비율이 0.67~0.71에 몰려 있다.
 * 3/4(0.75)에 담으면 크롭이 약 5%다. 이전의 16:9는 62%를 잘라내서 포스터를 무늬로 만들었다.
 * 소스 비율을 존중하는 것만으로 해결되므로 블러 배경이나 레터박스 같은 장치가 필요 없다.
 */
const POSTER = 'aspect-[3/4]'

/** 요금 한 조각. fee 원문 우선(할인 안내가 들어 있다), 없고 무료면 '무료', 둘 다 없으면 생략 — 상세(Task 9)와 같은 규칙 */
function Fee({ item }: { item: EventItem }) {
  const fee = item.fee ?? (item.isFree ? '무료' : undefined)
  if (!fee) return null
  return <span className="text-success-text"> · {fee}</span>
}

/** 장소 · 기간 · 요금 한 줄. 카드 종류가 달라도 같은 순서로 읽히게 한다 */
function MetaLine({ item, today, className }: { item: EventItem; today: string; className: string }) {
  return (
    <p className={className}>
      {item.place} · {formatDateRange(item.startDate, item.endDate, today)}
      <Fee item={item} />
    </p>
  )
}

/**
 * 추천 3개 — 포스터 카드.
 *
 * 폭에 따라 **구조가 바뀐다**. md 미만에서는 가로 행(96px 포스터 + 텍스트)이고,
 * md 이상에서는 세로 카드 3개가 한 줄에 선다. 세로 포스터를 크게 보여주려면 세로 카드여야 하는데,
 * 모바일 전폭에서 3/4 포스터는 477px이라 한 장이 화면을 다 먹는다. 두 요구를 폭으로 나눠 만족시킨다.
 *
 * 어제 넣었던 `lead`(1번 픽만 가로로 눕히기)는 뺐다. 그건 전폭 16:9가 세로 540px을 먹는 걸
 * 피하려고 만든 장치인데, 크롭을 포스터 비율로 고치면서 그 이유가 사라졌다.
 * 그리고 가로 카드로는 세로 포스터를 크게 보여줄 수가 없다 — 이미지 높이를 텍스트에 맞추면
 * 폭이 150px짜리 썸네일이 된다. 순위는 이제 배치가 아니라 **순서**가 전한다.
 */
export function EventPosterCard({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="flex gap-4 md:block">
      {/*
        self-start가 없으면 flex 기본 stretch가 이미지를 행 높이까지 잡아늘여 비율이 깨진다 —
        텍스트가 가장 긴 카드에서 0.75가 0.60으로 늘어나는 걸 실측했다.
      */}
      <ItemImage
        src={e.imageUrl}
        alt=""
        category={e.category}
        className={`${POSTER} w-24 shrink-0 self-start rounded-lg object-cover md:w-full md:rounded-xl`}
      />
      {/* 제목·메타는 붙이고(mt-1) 코멘트는 떼어 놓는다(mt-2) — 코멘트는 사실이 아니라 목소리다 */}
      <div className="min-w-0 md:mt-3">
        <h3 className="font-bold md:text-lg">{e.title}</h3>
        <MetaLine item={e} today={today} className="mt-1 text-sm text-ink-muted" />
        {/* 코멘트는 있을 때만 — 운영 배치(rule)는 reason이 빈 문자열이다. 빈 자리를 남기지 않는다 */}
        {entry.reason !== '' && <p className="mt-2 text-sm text-ink">{entry.reason}</p>}
      </div>
    </Link>
  )
}

/**
 * 나머지 9개 — 이미지 없는 텍스트 행.
 *
 * 64px 썸네일을 뺐다. 세로 포스터를 1:1로 자른 64px 조각은 무엇인지 알아볼 수 없어서
 * 정보값이 0인데, 왼쪽을 차지해 제목을 한 줄 `truncate`로 밀어넣고 있었다.
 * 실제로 보이는 건 대괄호 접두사뿐이었다("[송파 청년아티스트센터] 3기 릴레이 개인…").
 * 그 자리를 제목 두 줄에 준다 — PRODUCT.md의 "무늬가 되는 순간 자리를 뺀다".
 *
 * 위쪽 포스터 그리드, 아래쪽 사진 그리드 사이에서 이 구간만 텍스트라 리듬도 생긴다.
 * 구분선은 카드로 감싸지 않고 행을 나누기 위한 것이다(안내판의 행 구분에 가깝다).
 */
export function CompactEventRow({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="block border-t border-neutral-border py-3">
      <h3 className="line-clamp-2 font-medium">{e.title}</h3>
      <MetaLine item={e} today={today} className="mt-1 truncate text-sm text-ink-muted" />
      {entry.reason !== '' && <p className="truncate text-sm text-ink-subtle">{entry.reason}</p>}
    </Link>
  )
}

/**
 * 언제 가도 좋은 곳 — place 6개 그리드용.
 *
 * 포스터와 같은 논리를 사진에 적용한다. 장소 사진은 6장 중 5장이 1.36 가로형이라
 * 4/3(1.333)에 담으면 크롭이 2%다. 정사각은 26%(최악 43%)를 잘라내고 있었다.
 */
export function PlaceCard({ place }: { place: PlaceItem }) {
  return (
    <Link to="/e/$id" params={{ id: place.id }} className="block">
      <ItemImage
        src={place.imageUrl}
        alt=""
        category={place.category}
        className="aspect-[4/3] w-full rounded-lg object-cover"
      />
      {/* 좁은 칸에서 한 줄 truncate면 "의학박물관 (구 대한…"이 된다. 두 줄까지 허용한다 */}
      <h3 className="mt-2 line-clamp-2 text-sm font-medium">{place.title}</h3>
      {place.subwayInfo && <p className="truncate text-xs text-ink-subtle">{place.subwayInfo}</p>}
    </Link>
  )
}
