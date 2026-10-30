import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { BrowseEventRow, CatalogError, CatalogSkeleton, StaleCatalog } from '~/components/browse'
import { EventPosterCard } from '~/components/cards'
import { useCatalog, useGeo, type GeoState } from '~/components/catalog-hooks'
import { DAY_LABELS, HomeControls, HomeEmpty, HomePager } from '~/components/home'
import { PAGE } from '~/components/page'
import { loadCurated, loadMeta, loadWeek } from '~/data/load'
import { resolveCurated } from '~/data/resolve'
import { applyFilters, districtsOf, isCatalogStale, sortByDistance } from '~/lib/browse-filter'
import { homeSearchSchema, type HomeSearch } from '~/lib/home-search'
import { dayRange, eventsOn, pickShelf, sortByDeadline } from '~/lib/today'
import { kstToday } from '~/lib/week'
import type { CatalogEventIndexItem, CatalogIndexFile } from '~/types/files'

/** 빌드 타임에 한 번 실행. 여기가 new Date()를 부르는 유일한 서버 경계다 */
const getHomeData = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => {
    const meta = loadMeta() // 현재 주차는 meta.weekKey — isoWeekKey(new Date()) 금지 (없는 파일을 읽게 된다)
    const week = loadWeek(meta.weekKey)
    const curated = loadCurated(meta.weekKey)
    const resolved = resolveCurated(curated, week.items, [])
    const today = kstToday(new Date()) // 오늘 = 빌드 시각의 KST 날짜. 배치 커밋 → 재배포 때 갱신된다

    return {
      today,
      // 배포는 06:30 KST라 자정~06:30에는 빌드 today가 하루 늦다 — 넉넉히 넘기고 화면이 브라우저 today로 다시 고른다
      shelf: pickShelf(resolved.picks, today, Infinity),
    }
  })

export const Route = createFileRoute('/')({
  validateSearch: homeSearchSchema,
  loader: () => getHomeData(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const { state, retry } = useCatalog()
  const near = search.near !== false
  const geo = useGeo(near)

  // 프리렌더 첫 그림은 빌드 today, 카탈로그가 준비되면 브라우저 today(useCatalog)로 다시 그린다
  const today = state.status === 'ready' ? state.today : data.today
  const shelf = pickShelf(data.shelf, today, 3)

  return (
    <main className={`${PAGE} py-page`}>
      {/*
        가로로 넘기는 작은 선반 — 모바일 첫 화면에 필터까지 들어와야 한다(스펙 4장 "필터 먼저").
        화면 끝까지 흘러야 다음 카드가 보여 넘길 수 있다는 게 읽힌다(-mx로 PAGE 여백을 상쇄)
      */}
      {shelf.length > 0 && (
        <section>
          <h2 className="text-title-section">추천</h2>
          <div className="-mx-gutter mt-150 flex snap-x snap-mandatory scroll-px-gutter gap-gutter overflow-x-auto px-gutter md:mx-0 md:px-0">
            {shelf.map((entry) => (
              <EventPosterCard key={entry.item.id} entry={entry} today={today} />
            ))}
          </div>
        </section>
      )}

      <HomeControls
        search={search}
        districts={state.status === 'ready' ? districtsOf(state.index.items.filter((i) => i.kind === 'event')) : []}
        nearDisabledReason={
          near && geo.status === 'denied'
            ? '위치를 확인하지 못해 내 주변 순을 쓸 수 없습니다 — 자치구로 좁혀 보세요'
            : undefined
        }
      />

      {state.status === 'loading' && <CatalogSkeleton />}
      {state.status === 'error' && <CatalogError message={state.message} onRetry={retry} />}
      {state.status === 'ready' &&
        (isCatalogStale(state.index.horizonEnd, state.today) ? (
          <StaleCatalog index={state.index} />
        ) : (
          <DayList index={state.index} today={state.today} now={state.now} search={search} geo={geo}
            shelfIds={new Set(shelf.map((e) => e.item.id))} />
        ))}
    </main>
  )
}

const PAGE_SIZE = 10

function DayList({
  index, today, now, search, geo, shelfIds,
}: {
  index: CatalogIndexFile
  today: string
  now: Date
  search: HomeSearch
  geo: GeoState
  shelfIds: ReadonlySet<string>
}) {
  const day = search.day ?? 'today'
  const near = search.near !== false
  const events = applyFilters(index.items, { group: search.group, district: search.district }, now)
    .filter((i): i is CatalogEventIndexItem => i.kind === 'event')
  const list = eventsOn(events, dayRange(day, today)).filter((i) => !shelfIds.has(i.id))

  if (list.length === 0) return <HomeEmpty search={search} />

  const sorted: Array<{ item: CatalogEventIndexItem; km?: number }> =
    near && geo.status === 'ok'
      ? (sortByDistance(list, geo.origin) as Array<{ item: CatalogEventIndexItem; km?: number }>)
      : sortByDeadline(list).map((item) => ({ item }))
  const pages = Math.ceil(sorted.length / PAGE_SIZE)
  const page = Math.min(search.page ?? 1, pages) // 조건이 바뀌어 페이지가 줄었으면 마지막 페이지
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // 아무것도 안 좁혔으면 첫 페이지에서 필터로 좁히라고 권한다(스펙 4장 "필터 먼저")

  return (
    <section id="list" className="mt-section scroll-mt-200">
      <div className="flex items-baseline justify-between">
        <h2 className="text-title-section">{DAY_LABELS[day]}</h2>
        <span className="text-body text-ink-muted">{list.length}건</span>
      </div>
      {near && geo.status === 'waiting' && (
        <p className="mt-100 text-body text-ink-subtle">위치 확인 중…</p>
      )}
      <div className="mt-150">
        {rows.map(({ item, km }) => (
          <BrowseEventRow key={item.id} item={item} today={today} km={km} />
        ))}
      </div>
      {pages > 1 && <HomePager search={search} page={page} pages={pages} />}
    </section>
  )
}
