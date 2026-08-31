import { addDays } from '~/lib/dates'
import { categoryGroup } from '~/lib/category'
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

/** 서울 25개 자치구. 하드코딩이 안전한 드문 경우 — 행정구역은 데이터보다 느리게 바뀐다 */
const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중랑구', '중구',
] as const

const DISTRICT_RE = new RegExp(SEOUL_DISTRICTS.join('|'))

/**
 * 주소에서 자치구를 파생한다. 장소 원본에는 district가 0/733이지만
 * address가 714/733에 있고 705건에서 자치구가 뽑힌다(2026-08-31 실측).
 * places.json은 건드리지 않는다 — 슬림 투영 시점에만 쓰는 파생값이다.
 * 실패 시 undefined — 좌표 규칙과 같은 태도(없으면 필드 생략).
 */
export function districtFromAddress(address?: string): string | undefined {
  return address ? (DISTRICT_RE.exec(address)?.[0] ?? undefined) : undefined
}

/**
 * 슬림 투영(스펙 5장). 필드가 없으면 키 자체를 만들지 않는다 —
 * JSON.stringify의 undefined 탈락에 기대지 않고 여기서 생략을 보장한다.
 * 좌표는 쌍으로만 담는다: 한쪽만 있는 좌표는 좌표가 아니다.
 */
export function buildCatalogIndex(sel: CatalogSelection, generatedAt: string): CatalogIndexFile {
  const events = sel.events.map((e): CatalogIndexItem => ({
    id: e.id, kind: 'event', title: e.title, group: categoryGroup(e.category),
    ...(e.district !== undefined && { district: e.district }),
    place: e.place,
    ...(e.lat !== undefined && e.lng !== undefined && { lat: e.lat, lng: e.lng }),
    ...(e.isFree !== undefined && { isFree: e.isFree }),
    ...(e.imageUrl !== undefined && { imageUrl: e.imageUrl }),
    startDate: e.startDate, endDate: e.endDate,
  }))

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
