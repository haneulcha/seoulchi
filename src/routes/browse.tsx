import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import indexUrl from '../../data/index.json?url'
import {
  BrowseControls, BrowseEventRow, BrowsePlaceRow, CatalogError, CatalogSkeleton,
  EmptyResult, StaleCatalog, TimelineSection,
} from '~/components/browse'
import { PAGE } from '~/components/page'
import {
  applyFilters, groupByTimeline, isCatalogStale, relaxSuggestions, sortByDistance,
} from '~/lib/browse-filter'
import { browseSearchSchema, toBrowseFilters, type BrowseSearch } from '~/lib/browse-search'
import { formatUpdatedAt, formatWeekRange } from '~/lib/dates'
import type { LatLng } from '~/lib/geo'
import { kstToday } from '~/lib/week'
import {
  catalogIndexSchema,
  type CatalogEventIndexItem,
  type CatalogIndexFile,
  type CatalogPlaceIndexItem,
} from '~/types/files'

/**
 * 껍데기는 SSG, 목록만 클라이언트 fetch(스펙 8장). 홈과 달리 서버 함수를 쓰지 않는
 * 이유: 서버 함수 loader면 인덱스 240KB가 프리렌더 HTML에 통째로 박힌다.
 * ?url 임포트라 에셋 URL에 base가 자동으로 붙는다 — static-fn-base가 손으로 풀던
 * 문제(스펙 10장)를 vite가 대신 푼다. (확인 결과 #3, 계획 문서 참고)
 */
type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: CatalogIndexFile; today: string; now: Date }

type GeoState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'ok'; origin: LatLng }
  | { status: 'denied' }

export const Route = createFileRoute('/browse')({
  // 확인 목록 #4: zod v4는 Standard Schema라 스키마를 그대로 넘긴다.
  // 안 되면 (search) => browseSearchSchema.parse(search)로 바꾸고 확인 결과에 기록
  validateSearch: browseSearchSchema,
  component: Browse,
})

function Browse() {
  const search = Route.useSearch()
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  /** 접힌 월 그룹의 토글. URL에 넣지 않는다 — 필터가 아니라 목록 안 이동이다 */
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(new Set())
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetch(indexUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`인덱스를 받지 못했습니다 (HTTP ${res.status})`)
        const parsed = catalogIndexSchema.safeParse(await res.json())
        if (!parsed.success) {
          throw new Error('인덱스가 스키마와 다릅니다 — 배치와 앱 버전이 어긋났을 수 있습니다')
        }
        if (cancelled) return
        const now = new Date() // 브라우저 경계 — 여기서 한 번만. 이후 계산은 전부 이 값을 받는다
        setState({ status: 'ready', index: parsed.data, today: kstToday(now), now })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // 빈 목록으로 위장하지 않는다 — 명시적 에러 + 재시도(스펙 8장)
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  /** 위치는 near가 켜졌을 때만 묻는다 — 안 쓰는 권한을 미리 조르지 않는다 */
  useEffect(() => {
    if (search.near !== true) {
      setGeo({ status: 'idle' })
      return
    }
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'denied' })
      return
    }
    setGeo({ status: 'waiting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ status: 'ok', origin: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setGeo({ status: 'denied' }),
    )
  }, [search.near])

  return (
    <main className={`${PAGE} py-6 md:py-10`}>
      {state.status === 'ready' && (
        <header>
          {/* 범위 줄이 탭마다 다르다 — 탐색에서 '이번 주'가 거짓말이 되지 않게(스펙 7장) */}
          <p className="text-sm text-ink-subtle">
            {formatWeekRange({ start: state.today, end: state.index.horizonEnd })}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">{formatUpdatedAt(state.index.generatedAt)}</p>
        </header>
      )}

      {/* 컨트롤은 데이터 없이도 뜬다(자치구 목록만 데이터 의존) — 껍데기 즉시성(스펙 8장) */}
      <BrowseControls
        search={search}
        districts={state.status === 'ready' ? districtsOf(state.index) : []}
        nearDisabledReason={
          geo.status === 'denied'
            ? '위치 권한이 없어 가까운 순을 쓸 수 없습니다 — 자치구로 좁혀 보세요'
            : undefined
        }
      />

      {state.status === 'loading' && <CatalogSkeleton />}
      {state.status === 'error' && (
        <CatalogError message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
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

/** 자치구 셀렉트 옵션은 하드코딩하지 않고 데이터에서 도출한다 — 이번 주 없는 구는 목록에도 없다 */
function districtsOf(index: CatalogIndexFile): string[] {
  return [...new Set(index.items.map((i) => i.district).filter((d): d is string => d !== undefined))]
    .sort((a, b) => a.localeCompare(b, 'ko'))
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
      <section className="mt-6">
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
        <p className="mt-4 text-sm text-ink-subtle">위치 확인 중…</p>
      )}
      {groups.map((g) => (
        <TimelineSection key={g.key} group={g} today={today}
          collapsible={g.key.startsWith('month-')}
          expanded={!g.key.startsWith('month-') || openMonths.has(g.key)}
          onToggle={() => onToggleMonth(g.key)} />
      ))}
      {/* 장소는 시간 축에 놓지 않는다 — 시작일이 없다(스펙 7장, AGENTS.md) */}
      {places.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">언제든 갈 수 있는 곳</h2>
            <span className="text-sm text-ink-muted">{places.length}건</span>
          </div>
          <div className="mt-3">
            {places.map((p) => (
              <BrowsePlaceRow key={p.id} item={p} hoursUnknownNote={search.open === true} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
