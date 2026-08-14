import { afterEach, describe, expect, it, vi } from 'vitest'
import { VisitSeoulSource } from '~/sources/visit-seoul'
import { itemSchema } from '~/types/item'
import type { DetailCache } from '~/sources/types'

const listItem = {
  cid: 'KOPsrn1p5',
  com_ctgry_sn: 'Cg1x6l1',
  main_img: 'https://example.com/a.jpg',
  post_sj: '서울의 지하철',
  sumry: '서울역사박물관 기획전시',
  updt_dt_text: '2026.08.01',
}

const detail = {
  cid: 'KOPsrn1p5',
  cate_depth: ' 문화관광 > 전시시설',
  main_img: 'https://example.com/a.jpg',
  post_sj: '서울의 지하철',
  sumry: '서울역사박물관 기획전시',
  schdul_info_bgnde: '2026.08.10',
  schdul_info_endde: '2026.09.30',
  tag: ['전시', '역사'],
  extra: {
    cmmn_hmpg_url: 'https://museum.seoul.go.kr',
    cmmn_use_time: '10:00~18:00, 매주 월요일 휴관',
    trrsrt_use_chrge: 'F',
    trrsrt_use_chrge_guidance: '무료',
    closed_days: '매주 월요일',
  },
  traffic: {
    new_adres: '서울특별시 종로구 새문안로 55',
    map_position_x: '126.9706',
    map_position_y: '37.5705',
    subway_info: '5호선 서대문역 4번 출구',
  },
}

const source = new VisitSeoulSource('test-key', ['Cg1x6l1'])

// 한 테스트가 던지면 그 뒤 mockRestore가 실행되지 않아 스파이가 다음 테스트로 샌다
afterEach(() => vi.restoreAllMocks())

describe('VisitSeoulSource.normalize', () => {
  it('id에 vs- 접두사를 붙인다', () => {
    expect(source.normalize([detail])[0]!.id).toBe('vs-KOPsrn1p5')
  })

  it('행사 기간이 있으면 kind=event다', () => {
    const [item] = source.normalize([detail])
    expect(item!.kind).toBe('event')
    expect(item).toMatchObject({ startDate: '2026-08-10', endDate: '2026-09-30' })
  })

  it('행사 기간이 없으면 kind=place다', () => {
    const [item] = source.normalize([
      { ...detail, schdul_info_bgnde: '', schdul_info_endde: '' },
    ])
    expect(item!.kind).toBe('place')
  })

  it('점 구분 날짜를 ISO로 변환한다', () => {
    expect(source.normalize([detail])[0]).toMatchObject({ startDate: '2026-08-10' })
  })

  it('map_position_y를 위도, x를 경도로 읽는다', () => {
    const [item] = source.normalize([detail])
    expect(item!.lat).toBeCloseTo(37.5705, 4)
    expect(item!.lng).toBeCloseTo(126.9706, 4)
  })

  it('trrsrt_use_chrge가 F면 무료다', () => {
    expect(source.normalize([detail])[0]!.isFree).toBe(true)
    const paid = { ...detail, extra: { ...detail.extra, trrsrt_use_chrge: 'C' } }
    expect(source.normalize([paid])[0]!.isFree).toBe(false)
  })

  it('place에 파싱된 영업시간을 붙인다', () => {
    const placeDetail = { ...detail, schdul_info_bgnde: '', schdul_info_endde: '' }
    const [item] = source.normalize([placeDetail])
    expect(item).toMatchObject({ kind: 'place', hours: { open: '10:00', closedWeekdays: [1] } })
  })

  it('영업시간 파싱에 실패하면 hours가 null이고 원문이 남는다', () => {
    const placeDetail = {
      ...detail,
      schdul_info_bgnde: '',
      schdul_info_endde: '',
      // '상시 개방'은 이제 00:00~24:00으로 파싱된다. 진짜 파싱 불가 원문을 쓴다.
      extra: { ...detail.extra, cmmn_use_time: '업체별 상이' },
    }
    const [item] = source.normalize([placeDetail]) as any
    expect(item.hours).toBeNull()
    expect(item.useTime).toBe('업체별 상이')
  })

  it('cate_depth의 마지막 마디를 카테고리로 쓴다', () => {
    expect(source.normalize([detail])[0]!.category).toBe('전시시설')
  })

  it('지하철 정보를 담는다', () => {
    expect(source.normalize([detail])[0]!.subwayInfo).toBe('5호선 서대문역 4번 출구')
  })

  it('extra가 없어도 죽지 않는다 — 행사 항목엔 closed_days가 없다', () => {
    // Task 0 실측: extra의 키 구성은 항목 종류마다 다르다.
    const bare = { cid: 'KOPbare', post_sj: '이름만 있는 항목', cate_depth: ' 자연 > 공원' }
    const [item] = source.normalize([bare]) as any
    expect(item.kind).toBe('place')
    expect(item.hours).toBeNull()
    expect(() => itemSchema.parse(item)).not.toThrow()
  })

  it('출력이 zod 스키마를 통과한다', () => {
    expect(() => itemSchema.parse(source.normalize([detail])[0])).not.toThrow()
  })
})

describe('VisitSeoulSource.hydrate', () => {
  it('updt_dt_text가 같으면 상세를 호출하지 않는다', async () => {
    const cache: DetailCache = {
      KOPsrn1p5: { updtDtText: '2026.08.01', detail },
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const out = await source.hydrate([listItem], cache)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(out).toEqual([detail])
    fetchSpy.mockRestore()
  })

  it('updt_dt_text가 바뀌면 상세를 호출하고 캐시를 갱신한다', async () => {
    const cache: DetailCache = {
      KOPsrn1p5: { updtDtText: '2026.07.01', detail: { stale: true } },
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: detail, result_code: 200 })))

    const out = await source.hydrate([listItem], cache)

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(out).toEqual([detail])
    expect(cache.KOPsrn1p5).toEqual({ updtDtText: '2026.08.01', detail })
    fetchSpy.mockRestore()
  })

  it('상세를 POST + body로 부른다 — GET은 405다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: detail })))

    await source.hydrate([listItem], {})

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://api-call.visitseoul.net/api/v1/contents/info')
    expect(init!.method).toBe('POST')
    expect(JSON.parse(String(init!.body))).toEqual({ cid: 'KOPsrn1p5', lang_code_id: 'ko' })
    fetchSpy.mockRestore()
  })

  it('post_desc의 HTML을 걷어내고 캐시에 넣는다', async () => {
    // 캐시가 git에 커밋되므로 스마트에디터 CSS와 base64 이미지를 그대로 쌓으면 안 된다.
    // 제품에서 외부 HTML을 렌더링할 일도 없다.
    const withHtml = {
      ...detail,
      post_desc:
        '<style type="text/css">.se-contents{overflow-x:auto;}</style><p>서울의 여름 축제입니다.</p>',
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: withHtml })))

    const cache: DetailCache = {}
    const [out] = await source.hydrate([listItem], cache)

    expect((out as { post_desc?: string }).post_desc).toBe('서울의 여름 축제입니다.')
    expect(JSON.stringify(cache)).not.toContain('se-contents')
    fetchSpy.mockRestore()
  })

  it('post_desc가 없어도 죽지 않는다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: detail })))

    const [out] = await source.hydrate([listItem], {})

    expect(out).toMatchObject({ cid: 'KOPsrn1p5' })
    expect((out as { post_desc?: string }).post_desc).toBeUndefined()
    fetchSpy.mockRestore()
  })

  it('상세도 500이면 재시도한다 — 레이트 리밋이 500으로 위장돼 온다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: detail })))

    const out = await source.hydrate([listItem], {})

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(out).toEqual([detail])
    fetchSpy.mockRestore()
  })

  it('fetch가 예외를 던져도 재시도한다 — ECONNRESET으로 배치가 죽었다', async () => {
    // 실측: 2,199건을 도는 중 커넥션 리셋 한 번에 배치 전체가 죽었다.
    // postWithRetry가 HTTP 상태만 보고 예외는 안 잡았기 때문이다.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: detail })))

    const out = await source.hydrate([listItem], {})

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(out).toEqual([detail])
    fetchSpy.mockRestore()
  })

  it('재시도를 다 써도 예외면 그 건만 실패로 세고 계속 간다', async () => {
    // 20건 중 1건만 상세 호출이 필요하고 그게 네트워크로 죽는 경우.
    // 한 건 때문에 나머지 19건을 버리면 안 된다.
    const items = Array.from({ length: 20 }, (_, i) => ({ ...listItem, cid: `KOP${i}` }))
    const cache: DetailCache = Object.fromEntries(
      items.slice(1).map((i) => [i.cid, { updtDtText: '2026.08.01', detail: { cid: i.cid } }]),
    )
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    const out = await source.hydrate(items, cache)

    expect(out).toHaveLength(19)
    fetchSpy.mockRestore()
  })

  it('재시도 후에도 유실된 비율이 높으면 배치를 깨뜨린다', async () => {
    // 조용히 데이터의 절반이 빠진 채로 나가는 것보다 깨지는 게 낫다.
    // 실측에서 120ms 간격일 때 상세의 60%가 500이었다.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 500 }))

    await expect(source.hydrate([listItem], {})).rejects.toThrow(/유실률/)
    fetchSpy.mockRestore()
  })

  it('실패해도 캐시된 구본이 있으면 그걸 쓰고 넘어간다', async () => {
    // 실패율이 가드(10%) 아래여야 폴백 경로를 볼 수 있으므로 20건 중 1건만 실패시킨다.
    const items = Array.from({ length: 20 }, (_, i) => ({ ...listItem, cid: `KOP${i}` }))
    const cache: DetailCache = {
      // 0번만 갱신됐고(상세 호출 필요) 실패한다. 나머지는 캐시 적중이라 호출조차 없다.
      KOP0: { updtDtText: '옛날', detail: { cid: 'KOP0', post_sj: '구본' } },
      ...Object.fromEntries(
        items.slice(1).map((i) => [i.cid, { updtDtText: '2026.08.01', detail: { cid: i.cid } }]),
      ),
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 500 }))

    const out = await source.hydrate(items, cache)

    // 호출은 1건뿐이고 그게 실패했지만, 구본이 결과에 남는다
    expect(out).toHaveLength(20)
    expect(out[0]).toMatchObject({ post_sj: '구본' })
    fetchSpy.mockRestore()
  })
})

describe('VisitSeoulSource.fetchList', () => {
  it('목록이 500이면 재시도한다 — 카테고리 필터는 간헐적으로 500이다', async () => {
    const ok = JSON.stringify({
      data: [listItem],
      paging: { page_no: 1, page_size: 200, total_count: 1 },
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(ok))

    const out = await source.fetchList()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(out.map((i) => i.cid)).toEqual(['KOPsrn1p5'])
    fetchSpy.mockRestore()
  })

  it('page_size 200으로 요청한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], paging: { page_no: 1, page_size: 200, total_count: 0 } }),
      ),
    )

    await source.fetchList()

    expect(JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body))).toMatchObject({
      com_ctgry_sn: 'Cg1x6l1',
      lang_code_id: 'ko',
      page_no: 1,
      page_size: 200,
    })
    fetchSpy.mockRestore()
  })
})
