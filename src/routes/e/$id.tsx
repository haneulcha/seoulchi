import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import type { ReactNode } from 'react'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import { PAGE } from '~/components/page'
import { loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { formatDateRange } from '~/lib/dates'
import { kstToday } from '~/lib/week'
import type { Item } from '~/types/item'

/**
 * 정적 서버 함수 — 빌드 타임에 실행되고 결과가 정적 JSON으로 캐시된다.
 * 프리렌더 범위(19페이지)는 홈이 링크하는 id에서 결정되고, 여기는 id를 찾을 뿐이다.
 * 링크되지 않은 id는 애초에 페이지가 생성되지 않아 404다(스펙 10-5).
 *
 * `.validator`는 설치된 @tanstack/start-client-core 기준 이름이다.
 * `.inputValidator`도 같은 함수를 가리키지만 타입 정의에 @deprecated가 붙어 있다.
 */
const getDetail = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .middleware([staticFunctionMiddleware])
  .handler(({ data: id }): { item: Item; today: string } | null => {
    const meta = loadMeta() // 현재 주차는 meta.weekKey — isoWeekKey(new Date()) 금지
    const week = loadWeek(meta.weekKey)
    const places = loadPlaces()
    const item: Item | undefined =
      week.items.find((i) => i.id === id) ?? places.items.find((i) => i.id === id)
    if (!item) return null
    return { item, today: kstToday(new Date()) } // 오늘 = 빌드 시각의 KST 날짜
  })

export const Route = createFileRoute('/e/$id')({
  loader: async ({ params }) => {
    const data = await getDetail({ data: params.id })
    if (!data) throw notFound()
    return data
  },
  component: Detail,
})

function Detail() {
  const { item, today } = Route.useLoaderData()
  // 요금: fee 원문이 있으면 그쪽(할인 안내가 들어 있다), 없고 무료면 '무료'
  const fee = item.fee ?? (item.isFree ? '무료' : undefined)

  return (
    /*
     * 홈과 달리 1024까지 넓히지 않는다 — 여기는 사실 목록과 본문이라
     * 폭을 다 쓰면 줄이 길어져서 읽기가 나빠진다. 대신 md 이상에서 2단으로 갈라
     * 이미지와 내용을 나란히 놓는 쪽으로 폭을 쓴다.
     */
    /*
     * 폭은 `PAGE`(상한 1024)를 그대로 쓴다. 여기가 사실 목록과 본문인데도 줄이 길어지지 않는 건
     * 아래 2단 그리드 덕이다 — 1024 안쪽 960에서 7fr 칸이 약 541px이다.
     * 단이 갈라지는 시점(md=768)이 상한이 걸리는 시점(1024)보다 앞서므로 1단에서는 넓어지지 않는다.
     */
    <main className={`${PAGE} py-6 md:py-10`}>
      <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-8">
        <ItemImage
          src={item.imageUrl}
          alt=""
          category={item.category}
          className="aspect-video w-full rounded-xl object-cover"
        />
        <div className="min-w-0">
          <h1 className="mt-4 text-2xl font-bold md:mt-0 md:text-3xl">{item.title}</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            {item.category}
            {item.district ? ` · ${item.district}` : ''}
          </p>

          <dl className="mt-6 space-y-3">
            {item.kind === 'event' && (
              <Fact label="기간" value={formatDateRange(item.startDate, item.endDate, today)} />
            )}
            {item.kind === 'event' && (
              <Fact
                label="장소"
                value={item.address ? `${item.place} (${item.address})` : item.place}
              />
            )}
            {item.kind === 'place' && <Fact label="주소" value={item.address} />}
            <Fact label="요금" value={fee} />
            <Fact label="지하철" value={item.subwayInfo} />
            {item.kind === 'place' && <Fact label="휴무일" value={item.closedDays} />}
            {item.kind === 'place' && (
              <Fact
                label="이용시간"
                value={item.useTime}
                badge={<OpenNowBadge hours={item.hours ?? null} />}
              />
            )}
          </dl>

          {/* 모바일에서는 엄지로 누르는 전폭 버튼, md 이상에서는 내용에 맞춘 폭 */}
          {item.linkUrl && (
            <a
              href={item.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 block rounded-lg bg-ink px-6 py-3 text-center font-medium text-surface md:inline-block"
            >
              원문 보기
            </a>
          )}
        </div>
      </div>
    </main>
  )
}

/** 값이 없으면 줄 자체를 접는다 — linkUrl과 같은 태도. 빈 칸을 보여주지 않는다 */
function Fact({ label, value, badge }: { label: string; value?: string; badge?: ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-14 shrink-0 text-ink-subtle">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line">
        {value}
        {badge}
      </dd>
    </div>
  )
}
