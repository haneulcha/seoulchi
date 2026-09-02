import { describe, expect, it } from 'vitest'
import { buildCatalogIndex, districtFromAddress, selectCatalog } from '~/pipeline/select-catalog'
import { catalogIndexSchema } from '~/types/files'
import type { EventItem, PlaceItem } from '~/types/item'

const TODAY = '2026-08-31'

function ev(id: string, startDate: string, endDate: string): EventItem {
  return {
    id, source: 'seoul-culture', kind: 'event', title: `행사 ${id}`,
    category: '전시/미술', place: '어딘가', startDate, endDate,
  }
}

const somePlace: PlaceItem = {
  id: 'vs-1', source: 'visit-seoul', kind: 'place', title: '장소',
  category: '도시공원', place: '장소',
}

describe('selectCatalog', () => {
  it('horizonEnd는 today + 8주다', () => {
    expect(selectCatalog([], [], TODAY).horizonEnd).toBe('2026-10-26')
  })

  it('horizonWeeks 인자로 지평을 바꿀 수 있다', () => {
    expect(selectCatalog([], [], TODAY, 1).horizonEnd).toBe('2026-09-07')
  })

  it('경계 안쪽: 오늘 끝나는 것, 지평 마지막 날 시작하는 것 — 둘 다 담는다', () => {
    const events = [ev('sc-오늘끝', '2026-08-01', '2026-08-31'), ev('sc-지평끝시작', '2026-10-26', '2026-12-01')]
    expect(selectCatalog(events, [], TODAY).events.map((e) => e.id)).toEqual([
      'sc-오늘끝', 'sc-지평끝시작',
    ])
  })

  it('경계 바깥쪽: 어제 끝난 것, 지평 다음 날 시작하는 것 — 둘 다 뺀다', () => {
    const events = [ev('sc-어제끝', '2026-08-01', '2026-08-30'), ev('sc-지평밖', '2026-10-27', '2026-12-01')]
    expect(selectCatalog(events, [], TODAY).events).toEqual([])
  })

  it('endDate > today+3년은 이상치로 제외하고 id·원본 값을 남긴다 — 조용히 버리지 않는다', () => {
    const events = [ev('sc-2626', '2026-08-01', '2626-08-08'), ev('sc-정상', '2026-08-01', '2026-12-31')]
    const out = selectCatalog(events, [], TODAY)
    expect(out.events.map((e) => e.id)).toEqual(['sc-정상'])
    expect(out.anomalies).toEqual([{ id: 'sc-2626', endDate: '2626-08-08' }])
  })

  it('정확히 today+3년은 이상치가 아니다 — 초과만 이상치다', () => {
    const out = selectCatalog([ev('sc-3년', '2026-08-01', '2029-08-31')], [], TODAY)
    expect(out.events.map((e) => e.id)).toEqual(['sc-3년'])
    expect(out.anomalies).toEqual([])
  })

  it('장소는 시간 조건 없이 전부 통과한다 — 장소는 주에 묶이지 않는다', () => {
    expect(selectCatalog([], [somePlace], TODAY).places).toEqual([somePlace])
  })

  it('today는 인자다 — 같은 입력이면 실행 날짜와 무관하게 같은 결과', () => {
    const events = [ev('sc-a', '2026-09-01', '2026-09-02')]
    expect(selectCatalog(events, [], '2026-08-31').events).toHaveLength(1)
    expect(selectCatalog(events, [], '2026-12-01').events).toHaveLength(0)
  })
})

describe('districtFromAddress', () => {
  it('주소에서 자치구를 뽑는다', () => {
    expect(districtFromAddress('서울 용산구 녹사평대로 150 (이태원동)')).toBe('용산구')
    expect(districtFromAddress('서울 종로구 삼청로 71-7')).toBe('종로구')
  })

  it('중구와 중랑구를 섞지 않는다', () => {
    expect(districtFromAddress('서울 중랑구 망우로 353')).toBe('중랑구')
    expect(districtFromAddress('서울 중구 세종대로 110')).toBe('중구')
  })

  it('주소가 없거나 자치구가 없으면 undefined — 0이나 빈 문자열로 채우지 않는다', () => {
    expect(districtFromAddress(undefined)).toBeUndefined()
    expect(districtFromAddress('경기 고양시 일산동구')).toBeUndefined()
  })
})

function fullEvent(): EventItem {
  return {
    id: 'sc-full', source: 'seoul-culture', kind: 'event', title: '전시',
    category: '전시/미술', place: '시립미술관', district: '중구',
    startDate: '2026-09-03', endDate: '2026-11-30',
    lat: 37.56, lng: 126.97, isFree: true, imageUrl: 'https://example.com/p.jpg',
    // 슬림에서 빠져야 하는 필드들
    address: '서울 중구 덕수궁길 61', linkUrl: 'https://example.com', fee: '무료',
    summary: '요약', subwayInfo: '시청역',
  }
}

function fullPlace(): PlaceItem {
  return {
    id: 'vs-full', source: 'visit-seoul', kind: 'place', title: '서울숲',
    category: '도시공원', place: '서울숲', address: '서울 성동구 뚝섬로 273',
    lat: 37.54, lng: 127.04, isFree: true, imageUrl: 'https://example.com/s.jpg',
    useTime: '05:00~22:00', hours: { open: '05:00', close: '22:00', closedWeekdays: [] },
  }
}

describe('buildCatalogIndex', () => {
  const GENERATED = '2026-08-31T12:00:00.000Z'

  function build(events: EventItem[], places: PlaceItem[]) {
    return buildCatalogIndex(selectCatalog(events, places, TODAY), GENERATED)
  }

  it('스키마를 통과하는 파일을 만든다', () => {
    const file = build([fullEvent()], [fullPlace()])
    expect(() => catalogIndexSchema.parse(file)).not.toThrow()
    expect(file.generatedAt).toBe(GENERATED)
    expect(file.horizonEnd).toBe('2026-10-26')
    expect(file.items).toHaveLength(2)
  })

  it('행사 항목은 목록·필터에 필요한 필드만 담고 group을 계산한다', () => {
    const [item] = build([fullEvent()], []).items
    expect(item).toEqual({
      id: 'sc-full', kind: 'event', title: '전시', group: '전시', district: '중구',
      place: '시립미술관', lat: 37.56, lng: 126.97, isFree: true,
      imageUrl: 'https://example.com/p.jpg', startDate: '2026-09-03', endDate: '2026-11-30',
    })
    // 상세 전용 필드는 슬림에 없다 — payload 61KB가 200KB가 되는 것을 막는 결정(스펙 2장)
    expect(item).not.toHaveProperty('address')
    expect(item).not.toHaveProperty('linkUrl')
    expect(item).not.toHaveProperty('summary')
  })

  it('장소 항목은 자치구를 주소에서 파생하고 hours를 담는다', () => {
    const [item] = build([], [fullPlace()]).items
    expect(item).toEqual({
      id: 'vs-full', kind: 'place', title: '서울숲', group: '공원·자연', district: '성동구',
      lat: 37.54, lng: 127.04, isFree: true, imageUrl: 'https://example.com/s.jpg',
      hours: { open: '05:00', close: '22:00', closedWeekdays: [] },
    })
  })

  it('좌표가 없으면 필드를 생략한다 — 0으로 채우지 않는다', () => {
    const noCoords: PlaceItem = { ...fullPlace(), lat: undefined, lng: undefined }
    const [item] = build([], [noCoords]).items
    expect(item).not.toHaveProperty('lat')
    expect(item).not.toHaveProperty('lng')
  })

  it('hours 파싱 실패(null)는 필드 생략 — 생략이 곧 영업시간 미상이다', () => {
    const unparsed: PlaceItem = { ...fullPlace(), hours: null }
    const [item] = build([], [unparsed]).items
    expect(item).not.toHaveProperty('hours')
  })

  it('주소에서 자치구를 못 뽑으면 district를 생략한다', () => {
    const noAddr: PlaceItem = { ...fullPlace(), address: undefined }
    const [item] = build([], [noAddr]).items
    expect(item).not.toHaveProperty('district')
  })

  it('행사도 주소에서 자치구를 파생한다', () => {
    // fullEvent()는 이미 district: '중구'를 갖고 있어 이 경로를 안 태운다 —
    // district가 없는 별도 픽스처로 파생 경로 자체를 확인한다(차단 1 회귀)
    const noDistrict: EventItem = { ...fullEvent(), district: undefined, address: '서울 성동구 뚝섬로 273' }
    const [item] = build([noDistrict], []).items
    expect(item).toHaveProperty('district', '성동구')
  })
})
