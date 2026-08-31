import { describe, expect, it } from 'vitest'
import { districtFromAddress, selectCatalog } from '~/pipeline/select-catalog'
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
