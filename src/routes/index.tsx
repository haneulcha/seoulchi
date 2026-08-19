import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { BigEventCard, CompactEventRow, PlaceCard } from '~/components/cards'
import { loadCurated, loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { resolveCurated } from '~/data/resolve'
import { formatUpdatedAt, formatWeekRange } from '~/lib/dates'
import { pickHomeItems } from '~/lib/home'
import { kstToday, weekRange } from '~/lib/week'

/** 빌드 타임에 한 번 실행. 여기가 new Date()를 부르는 유일한 서버 경계다 */
const getHomeData = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => {
    const meta = loadMeta() // 현재 주차는 meta.weekKey — isoWeekKey(new Date()) 금지 (없는 파일을 읽게 된다)
    const week = loadWeek(meta.weekKey)
    const curated = loadCurated(meta.weekKey)
    const places = loadPlaces()
    const resolved = resolveCurated(curated, week.items, places.items)
    const today = kstToday(new Date()) // 오늘 = 빌드 시각의 KST 날짜. 배치 커밋 → 재배포 때 갱신된다

    return {
      weekRangeLabel: formatWeekRange(weekRange(meta.weekKey)),
      updatedLabel: formatUpdatedAt(meta.updatedAt),
      today,
      entries: pickHomeItems({ events: week.items, picks: resolved.picks, today }),
      places: resolved.places,
    }
  })

export const Route = createFileRoute('/')({
  loader: () => getHomeData(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  const big = data.entries.slice(0, 3)
  const rest = data.entries.slice(3)

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6">
        <p className="text-sm text-gray-500">{data.weekRangeLabel}</p>
        <h1 className="text-2xl font-bold">이번 주 서울</h1>
        <p className="mt-1 text-xs text-gray-400">{data.updatedLabel}</p>
      </header>

      <section aria-label="이번 주 추천" className="space-y-6">
        {big.map((entry) => (
          <BigEventCard key={entry.item.id} entry={entry} today={data.today} />
        ))}
      </section>

      <section aria-label="이번 주 나머지" className="mt-8 space-y-4">
        {rest.map((entry) => (
          <CompactEventRow key={entry.item.id} entry={entry} today={data.today} />
        ))}
      </section>

      <section aria-label="언제 가도 좋은 곳" className="mt-12">
        <h2 className="text-lg font-bold">언제 가도 좋은 곳</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {data.places.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      </section>
      {/* "전체 둘러보기 →"는 넣지 않는다 — /explore가 아직 없다 (스펙 10-1) */}
    </main>
  )
}
