import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import {
  FILTER_LABELS, formatDistance, type RelaxSuggestion, type TimelineGroup,
} from '~/lib/browse-filter'
import { CHIP_GROUPS, type BrowseSearch } from '~/lib/browse-search'
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

function Chip({
  active, onClick, disabled = false, children,
}: { active: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
        active ? 'bg-ink font-medium text-surface' : 'border border-neutral-border text-ink-muted'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
    </button>
  )
}

/**
 * 필터 컨트롤(스펙 7장 스케치). 칩 한 줄(가로 스크롤, 단일 선택) + 토글 줄 + 자치구 셀렉트.
 * 모든 변경이 navigate(push)라 뒤로가기가 필터를 되돌린다 — 그게 URL에 두는 이유다.
 * '기타' 13건은 칩에서 뺀다 — 칩 한 자리 값을 못 한다. 숨기는 게 아니라 '전체'에 있다.
 * 자치구 24개는 칩이 안 되므로 셀렉트다.
 */
export function BrowseControls({
  search, districts, nearDisabledReason,
}: { search: BrowseSearch; districts: string[]; nearDisabledReason?: string }) {
  const navigate = useNavigate()
  const patch = (p: Partial<BrowseSearch>) =>
    void navigate({ to: '/browse', search: { ...search, ...p } })

  return (
    <div className="mt-4 space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="카테고리">
        <Chip active={search.group === undefined} onClick={() => patch({ group: undefined })}>전체</Chip>
        {CHIP_GROUPS.map((g) => (
          <Chip key={g} active={search.group === g}
            onClick={() => patch({ group: search.group === g ? undefined : g })}>
            {g}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="정렬과 필터">
        <Chip active={search.near === true} disabled={nearDisabledReason !== undefined}
          onClick={() => patch({ near: search.near ? undefined : true })}>
          ⊙ 가까운 순
        </Chip>
        <Chip active={search.free === true}
          onClick={() => patch({ free: search.free ? undefined : true })}>
          무료만
        </Chip>
        <Chip active={search.open === true}
          onClick={() => patch({ open: search.open ? undefined : true })}>
          지금 열림
        </Chip>
        <select
          value={search.district ?? ''}
          onChange={(e) => patch({ district: e.target.value === '' ? undefined : e.target.value })}
          aria-label="자치구"
          className="rounded-full border border-neutral-border bg-surface px-3 py-1.5 text-sm text-ink-muted"
        >
          <option value="">자치구 전체</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      {nearDisabledReason !== undefined && (
        <p className="text-sm text-warning-text">{nearDisabledReason}</p>
      )}
    </div>
  )
}

/**
 * 0건의 응답(스펙 8장): 막다른 길 대신 어떤 필터를 풀면 몇 건이 나오는지.
 * 제안이 Link라 누르면 그 필터가 풀리고, 뒤로가기로 되돌아온다.
 */
export function EmptyResult({
  suggestions, search,
}: { suggestions: RelaxSuggestion[]; search: BrowseSearch }) {
  return (
    <div className="mt-12 py-8 text-center">
      <p className="font-medium">조건에 맞는 게 없습니다</p>
      {suggestions.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {suggestions.map((s) => (
            <li key={s.filter}>
              <Link to="/browse" search={{ ...search, [s.filter]: undefined }}
                className="text-ink-muted underline">
                '{FILTER_LABELS[s.filter]}'을(를) 풀면 {s.count}건
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-subtle">모든 필터를 풀어도 결과가 없습니다</p>
      )}
    </div>
  )
}
