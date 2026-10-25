import { describe, expect, it } from 'vitest'
import { cardFacts, splitTitle } from '~/lib/card-facts'

const TODAY = '2026-10-26' // 월요일

const event = {
  kind: 'event' as const, district: '중구', place: '시립미술관',
  startDate: '2026-10-01', endDate: '2026-12-31', time: '10:00~18:00',
}

describe('cardFacts', () => {
  it('고정 층: 자치구 · 거리 · 진행 시간', () => {
    expect(cardFacts(event, { today: TODAY, km: 1.24 })).toMatchObject({
      where: '중구', distance: '1.2km', time: '10:00~18:00',
    })
  })

  it('자치구가 없으면 장소명으로 대신한다', () => {
    expect(cardFacts({ ...event, district: undefined }, { today: TODAY }).where).toBe('시립미술관')
  })

  it('자치구가 없으면 주소에서 뽑고, 장소는 장소명(=제목)으로 메우지 않는다', () => {
    const place = { kind: 'place' as const, place: '서울숲', title: '서울숲' }
    expect(cardFacts({ ...place, address: '서울 성동구 뚝섬로 273' }, {}).where).toBe('성동구')
    expect(cardFacts(place, {}).where).toBeUndefined()
    expect(cardFacts({ ...event, district: undefined, address: '서울 중구 덕수궁길 61' }, { today: TODAY }).where)
      .toBe('중구')
  })

  it('km를 모르면 거리를 생략한다', () => {
    expect(cardFacts(event, { today: TODAY }).distance).toBeUndefined()
  })

  it('오래 진행되는 행사는 남은 기간을 생략한다', () => {
    expect(cardFacts(event, { today: TODAY }).deadline).toBeUndefined()
  })

  it('종료가 6일 안이면 남은 기간을 보인다', () => {
    expect(cardFacts({ ...event, endDate: '2026-11-01' }, { today: TODAY }).deadline).toBe('11/1까지')
    expect(cardFacts({ ...event, endDate: TODAY }, { today: TODAY }).deadline).toBe('오늘까지')
    expect(cardFacts({ ...event, endDate: '2026-11-02' }, { today: TODAY }).deadline).toBeUndefined()
  })

  it('시작 전이면 시작일을 보인다', () => {
    const future = { ...event, startDate: '2026-11-02', endDate: '2026-12-31' }
    expect(cardFacts(future, { today: TODAY }).deadline).toBe('11/2 시작')
  })

  it('가격: 무료 → 요금 원문 → 생략', () => {
    expect(cardFacts({ ...event, isFree: true, fee: '무료(사전예약)' }, { today: TODAY }).price).toBe('무료')
    expect(cardFacts({ ...event, isFree: false, fee: '성인 5,000원' }, { today: TODAY }).price).toBe('성인 5,000원')
    expect(cardFacts({ ...event, isFree: false }, { today: TODAY }).price).toBeUndefined()
  })

  it('장소의 시간은 파싱된 영업시간, 파싱 실패면 생략', () => {
    const place = { kind: 'place' as const, district: '성동구' }
    expect(cardFacts({ ...place, hours: { open: '05:00', close: '22:00', closedWeekdays: [] } }, {}).time)
      .toBe('05:00~22:00')
    expect(cardFacts({ ...place, hours: null }, {}).time).toBeUndefined()
    expect(cardFacts({ ...place, hours: { open: '00:00', close: '24:00', closedWeekdays: [] } }, {}).time)
      .toBe('24시간')
  })
})

describe('splitTitle', () => {
  it('맨 앞 대괄호를 기관명으로 뗀다', () => {
    expect(splitTitle('[영등포구청] 가을 음악회')).toEqual({ title: '가을 음악회', org: '영등포구청' })
  })

  it('대괄호가 없으면 그대로', () => {
    expect(splitTitle(' 서울의 지하철 ')).toEqual({ title: '서울의 지하철' })
  })

  it('대괄호만 있는 제목은 그대로 둔다', () => {
    expect(splitTitle('[서울시립미술관]')).toEqual({ title: '[서울시립미술관]' })
  })

  it('두 번째 대괄호는 제목에 남긴다', () => {
    expect(splitTitle('[송파구] [특별전] 가을')).toEqual({ title: '[특별전] 가을', org: '송파구' })
  })
})
