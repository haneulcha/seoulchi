import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  BrowseControls, BrowseEventRow, BrowsePlaceRow, CatalogError, CatalogSkeleton,
  EmptyResult, StaleCatalog, TimelineSection,
} from '~/components/browse'
import { useCatalog, useGeo, type GeoState } from '~/components/catalog-hooks'
import { PAGE } from '~/components/page'
import {
  applyFilters, districtsOf, groupByTimeline, isCatalogStale, relaxSuggestions, sortByDistance,
} from '~/lib/browse-filter'
import { browseSearchSchema, toBrowseFilters, type BrowseSearch } from '~/lib/browse-search'
import { formatUpdatedAt, formatWeekRange } from '~/lib/dates'
import {
  type CatalogEventIndexItem,
  type CatalogIndexFile,
  type CatalogPlaceIndexItem,
} from '~/types/files'

export const Route = createFileRoute('/browse')({
  // 확인 목록 #4: zod v4는 Standard Schema라 스키마를 그대로 넘긴다.
  // 안 되면 (search) => browseSearchSchema.parse(search)로 바꾸고 확인 결과에 기록
  validateSearch: browseSearchSchema,
  component: Browse,
})

function Browse() {
  const search = Route.useSearch()
  const { state, retry } = useCatalog()
  /** 접힌 월 그룹의 토글. URL에 넣지 않는다 — 필터가 아니라 목록 안 이동이다 */
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(new Set())
  const geo = useGeo(search.near === true)

  return (
    <main className={`${PAGE} py-page`}>
      {state.status === 'ready' && (
        <header>
          {/* 범위 줄이 탭마다 다르다 — 탐색에서 '이번 주'가 거짓말이 되지 않게(스펙 7장) */}
          <p className="text-body text-ink-subtle">
            {formatWeekRange({ start: state.today, end: state.index.horizonEnd })}
          </p>
          <p className="mt-050 text-caption text-ink-subtle">{formatUpdatedAt(state.index.generatedAt)}</p>
        </header>
      )}

      {/* 컨트롤은 데이터 없이도 뜬다(자치구 목록만 데이터 의존) — 껍데기 즉시성(스펙 8장) */}
      <BrowseControls
        search={search}
        districts={state.status === 'ready' ? districtsOf(state.index.items) : []}
        nearDisabledReason={
          // near가 꺼져 있으면 geo.status가 어떤 값이든(레이스로 뒤늦게 denied가
          // 와도) 사유를 보이지 않는다 — 꺼진 필터에 대한 실패 사유는 존재하지
          // 않는다. cancelled 가드와 이중 방어: 지우면 안 되는 자리다.
          search.near === true && geo.status === 'denied'
            ? '위치를 확인하지 못해 가까운 순을 쓸 수 없습니다 — 자치구로 좁혀 보세요'
            : undefined
        }
      />

      {state.status === 'loading' && <CatalogSkeleton />}
      {state.status === 'error' && (
        <CatalogError message={state.message} onRetry={retry} />
      )}
      {state.status === 'ready' &&
        // 2층 방어의 두 번째 층(사용자 룰링) — groupByTimeline(6a7198f)은
        // isCatalogStale이 참이면 던진다. 그 호출은 BrowseResults 안에 있으므로,
        // BrowseResults를 아예 마운트하지 않고 여기서 갈라 막는다. groupByTimeline의
        // throw와 여기 가드가 같은 술어(isCatalogStale)를 쓰므로 둘이 어긋날 수 없다.
        (isCatalogStale(state.index.horizonEnd, state.today) ? (
          <StaleCatalog index={state.index} />
        ) : (
          <BrowseResults
            index={state.index} today={state.today} now={state.now} search={search} geo={geo}
            openMonths={openMonths}
            onToggleMonth={(key) =>
              setOpenMonths((prev) => {
                const next = new Set(prev)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }
          />
        ))}
    </main>
  )
}

function BrowseResults({
  index, today, now, search, geo, openMonths, onToggleMonth,
}: {
  index: CatalogIndexFile
  today: string
  now: Date
  search: BrowseSearch
  geo: GeoState
  openMonths: ReadonlySet<string>
  onToggleMonth: (key: string) => void
}) {
  const filters = toBrowseFilters(search)
  const filtered = applyFilters(index.items, filters, now)

  if (filtered.length === 0) {
    return <EmptyResult suggestions={relaxSuggestions(index.items, filters, now)} search={search} />
  }

  // 가까운 순: 시간 축이 사라지고 행사·장소가 거리 하나로 선다(스펙 7장)
  if (search.near === true && geo.status === 'ok') {
    return (
      <section className="mt-300">
        {sortByDistance(filtered, geo.origin).map(({ item, km }) =>
          item.kind === 'event' ? (
            <BrowseEventRow key={item.id} item={item} today={today} km={km} />
          ) : (
            <BrowsePlaceRow key={item.id} item={item} km={km}
              hoursUnknownNote={search.open === true} />
          ),
        )}
      </section>
    )
  }

  const events = filtered.filter((i): i is CatalogEventIndexItem => i.kind === 'event')
  const places = filtered
    .filter((i): i is CatalogPlaceIndexItem => i.kind === 'place')
    .sort((a, b) => a.title.localeCompare(b.title, 'ko')) // 위치를 안 쓰는 기본 상태는 이름순(스펙 7장)
  const groups = groupByTimeline(events, today, index.horizonEnd)

  return (
    <>
      {search.near === true && geo.status === 'waiting' && (
        <p className="mt-200 text-body text-ink-subtle">위치 확인 중…</p>
      )}
      {groups.map((g) => (
        <TimelineSection key={g.key} group={g} today={today}
          collapsible={g.key.startsWith('month-')}
          expanded={!g.key.startsWith('month-') || openMonths.has(g.key)}
          onToggle={() => onToggleMonth(g.key)} />
      ))}
      {/* 장소는 시간 축에 놓지 않는다 — 시작일이 없다(스펙 7장, AGENTS.md) */}
      {places.length > 0 && (
        <section className="mt-section">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title-section">언제든 갈 수 있는 곳</h2>
            <span className="text-body text-ink-muted">{places.length}건</span>
          </div>
          <div className="mt-150">
            {places.map((p) => (
              <BrowsePlaceRow key={p.id} item={p} hoursUnknownNote={search.open === true} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
