import { Link } from '@tanstack/react-router'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import { formatDistance, type TimelineGroup } from '~/lib/browse-filter'
import { formatUpdatedAt, relativeDateLabel } from '~/lib/dates'
import type {
  CatalogEventIndexItem, CatalogIndexFile, CatalogPlaceIndexItem,
} from '~/types/files'

/** '2026-09-05' → '9/5'. 그룹 헤더의 범위 표기 전용 */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

/**
 * 탐색 행사 행. 메타 한 줄은 자치구 · (거리) · (무료) · 상대 날짜 —
 * 스케치의 "성동 · 1.2km · 무료 · 오늘까지" 순서다. 값이 없는 조각은 접는다.
 * ItemImage의 category에는 그룹을 넘긴다(슬림 항목에 원시 카테고리가 없다) —
 * 같은 그룹은 같은 폴백 색이므로 결정론은 유지된다.
 */
export function BrowseEventRow({
  item, today, km,
}: { item: CatalogEventIndexItem; today: string; km?: number }) {
  const pieces = [
    item.district,
    km !== undefined ? formatDistance(km) : undefined,
    item.isFree ? '무료' : undefined,
    relativeDateLabel(item.startDate, item.endDate, today),
  ].filter(Boolean)
  return (
    <Link to="/e/$id" params={{ id: item.id }} className="flex gap-3 border-t border-neutral-border py-3">
      <ItemImage
        src={item.imageUrl} alt="" category={item.group}
        className="aspect-[3/4] w-14 shrink-0 self-start rounded object-cover"
      />
      <div className="min-w-0">
        <h3 className="line-clamp-2 font-medium">{item.title}</h3>
        <p className="mt-0.5 truncate text-sm text-ink-muted">{pieces.join(' · ')}</p>
      </div>
    </Link>
  )
}

/**
 * 탐색 장소 행. '지금 열림' 배지는 OpenNowBadge 재사용(hydration-후 계산 그대로).
 * hoursUnknownNote: '지금 열림' 필터가 켜졌을 때 hours 미상 장소를 버리는 대신
 * "영업시간 미상"으로 남긴다(스펙 8장) — 조용히 없애면 화면이 '안 열려 있다'고 거짓말한다.
 */
export function BrowsePlaceRow({
  item, km, hoursUnknownNote = false,
}: { item: CatalogPlaceIndexItem; km?: number; hoursUnknownNote?: boolean }) {
  const pieces = [
    item.district,
    km !== undefined ? formatDistance(km) : undefined,
    item.isFree ? '무료' : undefined,
  ].filter(Boolean)
  return (
    <Link to="/e/$id" params={{ id: item.id }} className="flex gap-3 border-t border-neutral-border py-3">
      <ItemImage
        src={item.imageUrl} alt="" category={item.group}
        className="aspect-[4/3] w-20 shrink-0 self-start rounded object-cover"
      />
      <div className="min-w-0">
        <h3 className="line-clamp-2 font-medium">{item.title}</h3>
        <p className="mt-0.5 truncate text-sm text-ink-muted">
          {pieces.join(' · ')}
          <OpenNowBadge hours={item.hours ?? null} />
          {hoursUnknownNote && !item.hours && (
            <span className="ml-2 text-xs text-ink-subtle">영업시간 미상</span>
          )}
        </p>
      </div>
    </Link>
  )
}

/**
 * 시간 축 그룹 하나. 빈 그룹은 그리지 않는다.
 * collapsible(월 그룹)은 헤더가 버튼이고, 접힌 채 시작한다 — 스케치의 '9월 112건 ›'.
 */
export function TimelineSection({
  group, today, collapsible, expanded, onToggle,
}: {
  group: TimelineGroup
  today: string
  collapsible: boolean
  expanded: boolean
  onToggle: () => void
}) {
  if (group.items.length === 0) return null
  const header = (
    <>
      <h2 className="text-lg font-bold">
        {group.label}
        <span className="ml-2 text-sm font-normal text-ink-subtle">{md(group.start)}–{md(group.end)}</span>
      </h2>
      <span className="text-sm text-ink-muted">
        {group.items.length}건{collapsible && <span className="ml-1">{expanded ? '⌄' : '›'}</span>}
      </span>
    </>
  )
  return (
    <section className="mt-8">
      {collapsible ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded}
          className="flex w-full items-baseline justify-between text-left">
          {header}
        </button>
      ) : (
        <div className="flex items-baseline justify-between">{header}</div>
      )}
      {expanded && (
        <div className="mt-3">
          {group.items.map((item) => (
            <BrowseEventRow key={item.id} item={item} today={today} />
          ))}
        </div>
      )}
    </section>
  )
}

/** 목록 스켈레톤. 껍데기(세그먼트·칩)는 SSG라 즉시 뜨고 목록만 이걸 본다(스펙 8장) */
export function CatalogSkeleton() {
  return (
    <div aria-hidden className="mt-8 space-y-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="aspect-[3/4] w-14 animate-pulse rounded bg-neutral-subtle-bg" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-subtle-bg" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-subtle-bg" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** fetch 실패의 명시적 표면. 빈 목록으로 위장하지 않는다(스펙 8장, 크리틱 휴리스틱 9) */
export function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-8 rounded-lg border border-error-border bg-error-subtle-bg p-4">
      <p className="font-medium text-error-text-strong">목록을 불러오지 못했습니다</p>
      <p className="mt-1 text-sm text-error-text">{message}</p>
      <button type="button" onClick={onRetry}
        className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface">
        다시 시도
      </button>
    </div>
  )
}

/**
 * 묵은 카탈로그의 명시적 표면 — 2층 방어의 두 번째 층(사용자 룰링, Task 6 리뷰 결함 대응).
 *
 * `groupByTimeline`은 `horizonEnd < today`면 던진다(커밋 `6a7198f`) — 인덱스가
 * 8주 넘게 묵었다는 뜻이다. 이 컴포넌트는 그 호출 *이전에* 걸려 화면을 대체한다:
 * 목록(행사 시간 축이든 장소 섹션이든)을 하나도 그리지 않는다 — 빈 목록으로
 * 위장하면 "행사가 없다"는 거짓말이 된다(PRODUCT.md, 크리틱 휴리스틱 9).
 *
 * 어조는 안내판이다 — 사과·변명 없이 사실만 놓는다. 에러(`CatalogError`, error-*)와
 * 시각적으로 구분한다: 이건 실패가 아니라 **오래됨**이라 warning-*를 쓴다.
 */
export function StaleCatalog({ index }: { index: CatalogIndexFile }) {
  return (
    <div className="mt-8 rounded-lg border border-warning-border bg-warning-subtle-bg p-4">
      <p className="font-medium text-warning-text-strong">목록이 오래됐습니다</p>
      <p className="mt-1 text-sm text-warning-text">
        이 카탈로그는 {index.horizonEnd}까지를 담고 있고 오늘은 그 뒤입니다.
      </p>
      <p className="mt-1 text-xs text-warning-text">{formatUpdatedAt(index.generatedAt)}</p>
    </div>
  )
}
