import { addDays } from '~/lib/dates'
import { categoryGroup } from '~/lib/category'
import { districtFromAddress } from '~/lib/district'
import type { CatalogIndexFile, CatalogIndexItem } from '~/types/files'
import type { EventItem, PlaceItem } from '~/types/item'

export interface CatalogAnomaly {
  id: string
  endDate: string
}

export interface CatalogSelection {
  events: EventItem[]
  places: PlaceItem[]
  horizonEnd: string
  anomalies: CatalogAnomaly[]
}

/**
 * 탐색 카탈로그 선정(스펙 4장): startDate <= today+8주 && endDate >= today.
 * today는 인자다 — 내부 new Date() 금지(레포 규칙).
 *
 * endDate > today+3년은 데이터 오류로 판정해 제외한다. 조건만 쓰면
 * 2626-08-08 같은 원본 오타가 목록 끝에 영원히 남는다(실측 3건).
 * dates.ts의 '상시'(+2년)와 기준이 다르다 — 그쪽은 표기 방어, 여기는 오류 판정.
 * 조용히 버리지 않는다: anomalies로 반환하고 배치가 stderr + meta에 남긴다(Task 5).
 *
 * 장소는 시간 조건 없이 전부 통과한다 — 장소는 주에 묶이지 않는다(AGENTS.md).
 */
export function selectCatalog(
  events: EventItem[],
  places: PlaceItem[],
  today: string,
  horizonWeeks = 8,
): CatalogSelection {
  const horizonEnd = addDays(today, horizonWeeks * 7)
  // YYYY-MM-DD는 사전순 == 시간순. 연도에 +3만 하므로 윤일이 나와도 비교에는 지장이 없다
  const anomalyLimit = `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`

  const anomalies: CatalogAnomaly[] = []
  const selected: EventItem[] = []
  for (const e of events) {
    if (e.endDate > anomalyLimit) {
      anomalies.push({ id: e.id, endDate: e.endDate })
      continue
    }
    if (e.startDate <= horizonEnd && e.endDate >= today) selected.push(e)
  }
  return { events: selected, places, horizonEnd, anomalies }
}

/**
 * 슬림 투영(스펙 5장). 필드가 없으면 키 자체를 만들지 않는다 —
 * JSON.stringify의 undefined 탈락에 기대지 않고 여기서 생략을 보장한다.
 * 좌표는 쌍으로만 담는다: 한쪽만 있는 좌표는 좌표가 아니다.
 */
export function buildCatalogIndex(sel: CatalogSelection, generatedAt: string): CatalogIndexFile {
  const events = sel.events.map((e): CatalogIndexItem => {
    // 행사도 장소와 같은 모양으로 파생한다 — 원본 district가 비면 address에서 뽑는다
    const district = e.district ?? districtFromAddress(e.address)
    return {
      id: e.id, kind: 'event', title: e.title, group: categoryGroup(e.category),
      ...(district !== undefined && { district }),
      place: e.place,
      ...(e.lat !== undefined && e.lng !== undefined && { lat: e.lat, lng: e.lng }),
      ...(e.isFree !== undefined && { isFree: e.isFree }),
      ...(e.imageUrl !== undefined && { imageUrl: e.imageUrl }),
      startDate: e.startDate, endDate: e.endDate,
      ...(e.time !== undefined && { time: e.time }),
      ...(e.fee !== undefined && { fee: e.fee }),
    }
  })

  const places = sel.places.map((p): CatalogIndexItem => {
    // 장소 원본에는 district가 없다(0/733). 주소에서 파생한다 — 원본은 건드리지 않는다
    const district = p.district ?? districtFromAddress(p.address)
    return {
      id: p.id, kind: 'place', title: p.title, group: categoryGroup(p.category),
      ...(district !== undefined && { district }),
      ...(p.lat !== undefined && p.lng !== undefined && { lat: p.lat, lng: p.lng }),
      ...(p.isFree !== undefined && { isFree: p.isFree }),
      ...(p.imageUrl !== undefined && { imageUrl: p.imageUrl }),
      // hours: null(파싱 실패)도 undefined(원문 없음)도 생략 — 생략이 곧 '영업시간 미상'
      ...(p.hours != null && { hours: p.hours }),
    }
  })

  return { generatedAt, horizonEnd: sel.horizonEnd, items: [...events, ...places] }
}
