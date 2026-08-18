import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import type { ReactNode } from 'react'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
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
    <main className="mx-auto max-w-xl px-4 py-6">
      <ItemImage
        src={item.imageUrl}
        alt=""
        category={item.category}
        className="aspect-video w-full rounded-xl object-cover"
      />
      <h1 className="mt-4 text-2xl font-bold">{item.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {item.category}
        {item.district ? ` · ${item.district}` : ''}
      </p>

      <dl className="mt-6 space-y-3">
        {item.kind === 'event' && (
          <Fact label="기간" value={formatDateRange(item.startDate, item.endDate, today)} />
        )}
        <Fact label="장소" value={item.address ? `${item.place} (${item.address})` : item.place} />
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

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-8 block rounded-lg bg-gray-900 px-4 py-3 text-center font-medium text-white"
        >
          원문 보기
        </a>
      )}
    </main>
  )
}

/** 값이 없으면 줄 자체를 접는다 — linkUrl과 같은 태도. 빈 칸을 보여주지 않는다 */
function Fact({ label, value, badge }: { label: string; value?: string; badge?: ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-14 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0">
        {value}
        {badge}
      </dd>
    </div>
  )
}
