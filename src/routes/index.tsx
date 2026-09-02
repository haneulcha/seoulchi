import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { CompactEventRow, EventPosterCard, PlaceCard } from '~/components/cards'
import { PAGE } from '~/components/page'
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
    <main className={`${PAGE} py-6 md:py-10`}>
      <header className="mb-6 md:mb-10">
        <p className="text-sm text-ink-subtle">{data.weekRangeLabel}</p>
        <p className="mt-1 text-xs text-ink-subtle">{data.updatedLabel}</p>
      </header>

      {/* 3개라 md 이상에서 3단이 딱 한 줄로 떨어진다. 고아 칸이 없고 셋을 한 세트로 읽게 한다 */}
      <section>
        <h2 className="text-lg font-bold">이번 주 추천</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {big.map((entry) => (
            <EventPosterCard key={entry.item.id} entry={entry} today={data.today} />
          ))}
        </div>
      </section>

      {/*
        열 수를 브레이크포인트가 아니라 콘텐츠가 정한다 — 컴팩트 행은 300px 밑으로 내려가면
        제목이 잘려서 읽을 게 없어진다. auto-fit이면 폭에 따라 1 → 2 → 3열로 알아서 간다.
        min(300px,100%)인 이유: 그냥 300px로 두면 320px 기기(안쪽 288px)에서
        트랙이 300px으로 고정돼 12px 넘친다. 실측으로 확인했다.
      */}
      <section className="mt-10 md:mt-14">
        <h2 className="text-lg font-bold">이번 주에 더 있는 것</h2>
        {/* 행마다 border-t가 붙으므로 세로 간격은 행이 스스로 갖는다(gap-y 없음) */}
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-6">
          {rest.map((entry) => (
            <CompactEventRow key={entry.item.id} entry={entry} today={data.today} />
          ))}
        </div>
      </section>

      {/* 6개라 2·3·6으로만 나눠떨어진다. lg에서 한 줄 선반이 되면 행사 영역과 무게가 안 겹친다 */}
      <section className="mt-12 md:mt-16">
        <h2 className="text-lg font-bold">언제 가도 좋은 곳</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {data.places.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      </section>
    </main>
  )
}
