import { describe, expect, it } from 'vitest'
import { mergeItems } from '~/pipeline/merge'
import type { EventItem } from '~/types/item'

const scEvent: EventItem = {
  id: 'sc-abc123',
  source: 'seoul-culture',
  kind: 'event',
  title: '서울의 지하철',
  category: '전시/미술',
  place: '서울역사박물관',
  district: '종로구',
  startDate: '2026-08-10',
  endDate: '2026-09-30',
  isFree: true,
}

const vsEvent: EventItem = {
  id: 'vs-KOPsrn1p5',
  source: 'visit-seoul',
  kind: 'event',
  title: '서울의 지하철',
  category: '전시시설',
  place: '서울 역사 박물관',
  summary: '서울역사박물관 기획전시',
  imageUrl: 'https://example.com/a.jpg',
  subwayInfo: '5호선 서대문역 4번 출구',
  startDate: '2026-08-10',
  endDate: '2026-09-30',
}

describe('mergeItems', () => {
  it('겹치지 않으면 둘 다 남긴다', () => {
    const other = { ...vsEvent, id: 'vs-other', title: '완전히 다른 행사' }
    expect(mergeItems([[scEvent], [other]])).toHaveLength(2)
  })

  it('제목과 장소가 같으면 하나로 합친다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])).toHaveLength(1)
  })

  it('공백과 기호를 무시하고 장소를 비교한다', () => {
    // '서울역사박물관' vs '서울 역사 박물관'
    expect(mergeItems([[scEvent], [vsEvent]])).toHaveLength(1)
  })

  it('서울시 문화행사의 id를 남긴다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])[0]!.id).toBe('sc-abc123')
  })

  it('흡수된 id를 mergedFrom에 남긴다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])[0]!.mergedFrom).toEqual(['vs-KOPsrn1p5'])
  })

  it('비짓서울의 summary/imageUrl/subwayInfo를 얹는다', () => {
    const [merged] = mergeItems([[scEvent], [vsEvent]])
    expect(merged).toMatchObject({
      summary: '서울역사박물관 기획전시',
      imageUrl: 'https://example.com/a.jpg',
      subwayInfo: '5호선 서대문역 4번 출구',
    })
  })

  it('기준 항목에 이미 있는 값은 덮어쓰지 않는다', () => {
    const withImage = { ...scEvent, imageUrl: 'https://seoul.go.kr/own.jpg' }
    expect(mergeItems([[withImage], [vsEvent]])[0]!.imageUrl).toBe('https://seoul.go.kr/own.jpg')
  })

  it('기준 항목의 district를 유지한다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])[0]!.district).toBe('종로구')
  })

  it('kind가 다르면 합치지 않는다', () => {
    const asPlace = { ...vsEvent, kind: 'place' as const, startDate: undefined, endDate: undefined }
    delete (asPlace as any).startDate
    delete (asPlace as any).endDate
    expect(mergeItems([[scEvent], [asPlace as any]])).toHaveLength(2)
  })

  it('비짓서울에만 있는 항목은 vs- id를 그대로 쓴다', () => {
    expect(mergeItems([[], [vsEvent]])[0]!.id).toBe('vs-KOPsrn1p5')
  })

  it('입력을 제자리에서 바꾸지 않는다', () => {
    // 파이프라인 단계는 순수 함수다. 원본이 바뀌면 재실행 결과가 달라진다.
    mergeItems([[scEvent], [vsEvent]])
    expect(scEvent.mergedFrom).toBeUndefined()
    expect(scEvent.summary).toBeUndefined()
  })

  it('같은 그룹 안의 중복도 합친다', () => {
    // 서울시 소스는 한 행사를 회차별로 여러 행에 담기도 한다
    expect(mergeItems([[scEvent, { ...scEvent, id: 'sc-dup' }]])).toHaveLength(1)
  })
})
