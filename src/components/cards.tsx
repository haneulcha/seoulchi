import { Link } from '@tanstack/react-router'
import { ItemImage } from '~/components/ItemImage'
import { formatDateRange } from '~/lib/dates'
import type { HomeEntry } from '~/lib/home'
import type { EventItem, PlaceItem } from '~/types/item'

/** 요금 한 조각. fee 원문 우선(할인 안내가 들어 있다), 없고 무료면 '무료', 둘 다 없으면 생략 — 상세(Task 9)와 같은 규칙 */
function Fee({ item }: { item: EventItem }) {
  const fee = item.fee ?? (item.isFree ? '무료' : undefined)
  if (!fee) return null
  return <span className="text-green-700"> · {fee}</span>
}

/** 상위 3개 — 16:9 이미지 큰 카드. 첫 화면의 임팩트 담당(스펙 10-1) */
export function BigEventCard({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="block">
      <ItemImage
        src={e.imageUrl}
        alt=""
        category={e.category}
        className="aspect-video w-full rounded-xl object-cover"
      />
      <div className="mt-2">
        <h3 className="text-lg font-bold">{e.title}</h3>
        <p className="text-sm text-gray-600">
          {e.place} · {formatDateRange(e.startDate, e.endDate, today)}
          <Fee item={e} />
        </p>
        {/* 코멘트는 있을 때만 — 운영 배치(rule)는 reason이 빈 문자열이다. 빈 자리를 남기지 않는다 */}
        {entry.reason !== '' && <p className="mt-1 text-sm text-gray-800">{entry.reason}</p>}
      </div>
    </Link>
  )
}

/** 나머지 9개 — 썸네일 + 텍스트 컴팩트 행. 훑어보기 담당 */
export function CompactEventRow({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="flex gap-3">
      <ItemImage
        src={e.imageUrl}
        alt=""
        category={e.category}
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0">
        <h3 className="truncate font-medium">{e.title}</h3>
        <p className="truncate text-sm text-gray-600">
          {e.place} · {formatDateRange(e.startDate, e.endDate, today)}
          <Fee item={e} />
        </p>
        {entry.reason !== '' && (
          <p className="truncate text-sm text-gray-500">{entry.reason}</p>
        )}
      </div>
    </Link>
  )
}

/** 언제 가도 좋은 곳 — place 6개 그리드용 */
export function PlaceCard({ place }: { place: PlaceItem }) {
  return (
    <Link to="/e/$id" params={{ id: place.id }} className="block">
      <ItemImage
        src={place.imageUrl}
        alt=""
        category={place.category}
        className="aspect-square w-full rounded-lg object-cover"
      />
      <h3 className="mt-2 truncate text-sm font-medium">{place.title}</h3>
      {place.subwayInfo && <p className="truncate text-xs text-gray-500">{place.subwayInfo}</p>}
    </Link>
  )
}
