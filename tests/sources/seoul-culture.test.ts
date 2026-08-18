import { describe, expect, it } from 'vitest'
import { SeoulCultureSource } from '~/sources/seoul-culture'
import { eventItemSchema } from '~/types/item'
import realRow from '../fixtures/seoul-culture-row.json' with { type: 'json' }

const row = {
  CODENAME: '전시/미술',
  GUNAME: '중구',
  TITLE: '서울의 지하철',
  DATE: '2026-08-10~2026-09-30',
  PLACE: '서울역사박물관',
  ORG_NAME: '서울역사박물관',
  USE_TRGT: '전체관람가',
  USE_FEE: '무료',
  PLAYER: '',
  PROGRAM: '',
  ETC_DESC: '',
  ORG_LINK: 'https://museum.seoul.go.kr/example',
  MAIN_IMG: 'https://culture.seoul.go.kr/img/example.jpg',
  STRTDATE: '2026-08-10 00:00:00.0',
  END_DATE: '2026-09-30 00:00:00.0',
  LOT: '126.9706',
  LAT: '37.5705',
  IS_FREE: '무료',
  HMPG_ADDR: 'https://culture.seoul.go.kr/detail/12345',
}

const source = new SeoulCultureSource('test-key')

describe('SeoulCultureSource.normalize', () => {
  it('id에 sc- 접두사를 붙인다', () => {
    const [item] = source.normalize([row])
    expect(item!.id).toMatch(/^sc-/)
  })

  it('모든 항목이 kind=event다', () => {
    expect(source.normalize([row])[0]!.kind).toBe('event')
  })

  it('날짜를 YYYY-MM-DD로 자른다', () => {
    const [item] = source.normalize([row])
    expect(item).toMatchObject({ startDate: '2026-08-10', endDate: '2026-09-30' })
  })

  it('좌표를 숫자로 변환한다 — LAT=위도, LOT=경도', () => {
    const [item] = source.normalize([row])
    // 서울역사박물관은 위도 37.x, 경도 126.x. 뒤바뀌면 근처 화면이 조용히 망가진다.
    expect(item!.lat).toBeCloseTo(37.5705, 4)
    expect(item!.lng).toBeCloseTo(126.9706, 4)
  })

  it('IS_FREE로 무료 여부를 판정한다', () => {
    expect(source.normalize([row])[0]!.isFree).toBe(true)
    expect(source.normalize([{ ...row, IS_FREE: '유료' }])[0]!.isFree).toBe(false)
  })

  it('좌표가 비어 있으면 lat/lng를 생략한다 (0으로 채우지 않는다)', () => {
    const [item] = source.normalize([{ ...row, LAT: '', LOT: '' }])
    expect(item!.lat).toBeUndefined()
    expect(item!.lng).toBeUndefined()
  })

  it('날짜가 없는 행은 버린다', () => {
    expect(source.normalize([{ ...row, STRTDATE: '', END_DATE: '' }])).toHaveLength(0)
  })

  it('출력이 zod 스키마를 통과한다', () => {
    expect(() => eventItemSchema.parse(source.normalize([row])[0])).not.toThrow()
  })

  it('실제 API 응답 1건도 스키마를 통과하고 좌표가 서울 범위에 든다', () => {
    // fixture는 tmp/probe/seoul-culture-sample.json에서 그대로 뽑은 실제 행이다.
    // 손으로 만든 row가 실제 응답과 어긋나면 여기서 잡힌다.
    const [item] = source.normalize([realRow])
    expect(() => eventItemSchema.parse(item)).not.toThrow()
    expect(item!.lat).toBeGreaterThan(37)
    expect(item!.lat).toBeLessThan(38)
    expect(item!.lng).toBeGreaterThan(126)
    expect(item!.lng).toBeLessThan(128)
  })
})

describe('SeoulCultureSource.hydrate', () => {
  it('목록을 그대로 통과시킨다 (상세 호출 없음)', async () => {
    expect(await source.hydrate([row], {})).toEqual([row])
  })
})
