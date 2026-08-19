import type { CuratedFile } from '~/types/files'
import type { EventItem, PlaceItem } from '~/types/item'

export interface ResolvedCurated {
  picks: Array<{ item: EventItem; reason: string }>
  places: PlaceItem[]
}

/**
 * curated의 id를 실제 아이템으로 해석한다. 못 찾는 id는 조용히 버린다 —
 * emit의 참조 무결성은 같은 배치 세대 안에서만 보장되므로,
 * 세대가 어긋난 체크아웃에서도 홈이 깨지지 않게 한다.
 * 부족분은 pickHomeItems가 정렬 순으로 채운다(화면은 절대 비지 않는다).
 */
export function resolveCurated(
  curated: CuratedFile,
  events: EventItem[],
  places: PlaceItem[],
): ResolvedCurated {
  const eventById = new Map(events.map((e) => [e.id, e]))
  const placeById = new Map(places.map((p) => [p.id, p]))

  return {
    picks: curated.picks.flatMap((pick) => {
      const item = eventById.get(pick.id)
      return item ? [{ item, reason: pick.reason }] : []
    }),
    places: curated.places.flatMap((id) => {
      const item = placeById.get(id)
      return item ? [item] : []
    }),
  }
}
