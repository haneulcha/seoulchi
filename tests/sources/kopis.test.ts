import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KopisApiError, KopisBlockedError, parseKopisResponse, type KopisClient } from '~/sources/kopis-api'
import { KopisSource, listWindows, type KopisCache, type KopisDetail } from '~/sources/kopis'
import { eventItemSchema } from '~/types/item'

const fx = (name: string) => readFileSync(`tests/fixtures/kopis/${name}`, 'utf8')
const blocks = (name: string) => parseKopisResponse(200, fx(name))

const listBlock = (id: string) =>
  `<db><mt20id>${id}</mt20id><prfnm>공연 ${id}</prfnm><prfpdfrom>2026.11.01</prfpdfrom><prfpdto>2026.11.30</prfpdto>` +
  `<fcltynm>극장</fcltynm><genrenm>연극</genrenm><openrun>N</openrun></db>`
const detailBlock = (id: string, mt10id = `FC-${id}`) =>
  listBlock(id).replace('</db>', `<mt10id>${mt10id}</mt10id><pcseguidance>10,000원</pcseguidance></db>`)
const venueBlock = (mt10id: string) =>
  `<db><mt10id>${mt10id}</mt10id><fcltychartr>민간</fcltychartr><adres>서울특별시 종로구 대학로 1</adres><la>37.5</la><lo>127.0</lo></db>`

type Call = { path: string; params: Record<string, string | number> }

function fakeClient(handler: (path: string, params: Record<string, string | number>) => string[]) {
  const calls: Call[] = []
  const client: KopisClient = {
    async get(path, params) {
      calls.push({ path, params })
      return handler(path, params)
    },
  }
  return { client, calls }
}

/** 목록은 `list`, afterdate 목록은 `changed`, 상세·시설은 id별 블록 */
function routes(opts: { list: string[]; changed?: string[]; blockedAt?: string }) {
  return (path: string, params: Record<string, string | number>) => {
    if (path === 'pblprfr') {
      if (params.cpage !== 1) return []
      return (params.afterdate ? (opts.changed ?? []) : opts.list).map(listBlock)
    }
    const [kind, id] = path.split('/') as [string, string]
    if (id === opts.blockedAt) throw new KopisBlockedError(200)
    return kind === 'pblprfr' ? [detailBlock(id)] : [venueBlock(id)]
  }
}

const emptyCache = (): KopisCache => ({ details: {}, venues: {} })
const cachedDetail = (id: string): KopisDetail => ({
  mt20id: id, prfnm: `공연 ${id}`, prfpdfrom: '2026.11.01', prfpdto: '2026.11.30',
  fcltynm: '극장', genrenm: '연극', openrun: false, mt10id: `FC-${id}`, relateurls: [],
})

const TODAY = '2026-11-01'
const HORIZON = '2026-11-20'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('listWindows', () => {
  it('지평을 31일 이하 창으로 나눈다', () => {
    expect(listWindows('2026-11-01', '2026-12-27')).toEqual([
      { stdate: '20261101', eddate: '20261201' },
      { stdate: '20261202', eddate: '20261227' },
    ])
  })
})

describe('fetchList', () => {
  it('창 두 개에 걸친 공연은 한 번만', async () => {
    const { client, calls } = fakeClient(routes({ list: ['A', 'B'] }))
    const rows = await new KopisSource(client, emptyCache(), '2026-11-01', '2026-12-27').fetchList()
    expect(calls.filter((c) => c.params.cpage === 1)).toHaveLength(2)
    expect(rows.map((r) => r.mt20id)).toEqual(['A', 'B'])
    expect(calls[0]!.params).toMatchObject({ stdate: '20261101', eddate: '20261201', rows: 100, signgucode: 11 })
  })

  it('쪽은 rows보다 적게 올 때까지 넘긴다', async () => {
    const full = Array.from({ length: 100 }, (_, i) => `P${i}`)
    const { client, calls } = fakeClient((_, p) => (p.cpage === 1 ? full : ['X', 'Y', 'Z']).map(listBlock))
    const rows = await new KopisSource(client, emptyCache(), TODAY, HORIZON).fetchList()
    expect(calls.map((c) => c.params.cpage)).toEqual([1, 2])
    expect(rows).toHaveLength(103)
  })

  it('목록이 차단되면 캐시에서 지평 안 공연을 내보내고, 단건은 부르지 않고, lastRun은 그대로 둔다', async () => {
    const ended = { ...cachedDetail('Z'), prfpdfrom: '2026.10.01', prfpdto: '2026.10.20' }
    const cache: KopisCache = { lastRun: '20261031', details: { A: cachedDetail('A'), Z: ended }, venues: {} }
    const { client, calls } = fakeClient(() => {
      throw new KopisBlockedError(400)
    })
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const details = await source.hydrate(await source.fetchList(), {})
    expect(details.map((d) => d.mt20id)).toEqual(['A'])
    expect(calls).toHaveLength(1)
    expect(source.stats).toEqual({ listed: 1, fetched: 0, missing: 0, blocked: true })
    expect(cache.lastRun).toBe('20261031')
  })

  it('afterdate 목록만 차단되면 전체 목록은 쓰고 단건은 부르지 않는다', async () => {
    const cache: KopisCache = { lastRun: '20261031', details: { A: cachedDetail('A') }, venues: { 'FC-A': {} } }
    const { client, calls } = fakeClient((path, p) => {
      if (p.afterdate) throw new KopisBlockedError(400)
      return p.cpage === 1 ? ['A', 'B'].map(listBlock) : []
    })
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const details = await source.hydrate(await source.fetchList(), {})
    expect(details.map((d) => d.mt20id)).toEqual(['A'])
    expect(calls.some((c) => c.path !== 'pblprfr')).toBe(false)
    expect(source.stats).toMatchObject({ listed: 2, missing: 1, blocked: true })
    expect(cache.lastRun).toBe('20261031')
  })

  it('차단이 아닌 목록 오류는 던진다 — 키 만료가 여기서 드러난다', async () => {
    const { client } = fakeClient(() => {
      throw new KopisApiError('02', '키 미등록')
    })
    await expect(new KopisSource(client, emptyCache(), TODAY, HORIZON).fetchList()).rejects.toThrow(KopisApiError)
  })

  it('목록 필드가 바뀌면 던진다', async () => {
    const { client } = fakeClient(() => [listBlock('A').replace('<openrun>N</openrun>', '')])
    await expect(new KopisSource(client, emptyCache(), TODAY, HORIZON).fetchList()).rejects.toThrow()
  })

  it('openrun과 poster를 읽는다', async () => {
    const { client } = fakeClient((_, p) => (p.cpage === 1 ? blocks('list.xml') : []))
    const rows = await new KopisSource(client, emptyCache(), TODAY, HORIZON).fetchList()
    expect(rows.map((r) => r.openrun)).toEqual([false, false, true])
    expect(rows[1]!.prfnm).toBe('제4회 앙상블 음이랑 정기연주회: Roots & Resonance')
  })
})

describe('hydrate', () => {
  it('캐시에 없는 상세와 afterdate 변경분만 부른다', async () => {
    const cache: KopisCache = {
      lastRun: '20261031',
      details: { A: cachedDetail('A'), B: cachedDetail('B') },
      venues: { 'FC-A': {}, 'FC-B': {}, 'FC-C': {} },
    }
    const { client, calls } = fakeClient(routes({ list: ['A', 'B', 'C'], changed: ['B'] }))
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const rows = await source.fetchList()
    const details = await source.hydrate(rows, {})
    expect(calls.filter((c) => c.path.startsWith('pblprfr/')).map((c) => c.path)).toEqual(['pblprfr/B', 'pblprfr/C'])
    expect(calls.find((c) => c.params.afterdate)?.params.afterdate).toBe('20261030') // 경계를 모르니 하루 앞부터
    expect(details.map((d) => d.mt20id)).toEqual(['A', 'B', 'C'])
  })

  it('lastRun이 없으면 afterdate 호출을 하지 않는다', async () => {
    const { client, calls } = fakeClient(routes({ list: ['A'] }))
    await new KopisSource(client, emptyCache(), TODAY, HORIZON).fetchList()
    expect(calls.some((c) => 'afterdate' in c.params)).toBe(false)
  })

  it('차단되면 단건 호출을 멈추고 받은 것은 캐시에 남긴다', async () => {
    const cache: KopisCache = { lastRun: '20261031', details: {}, venues: { 'FC-C': {} } }
    const { client, calls } = fakeClient(routes({ list: ['C', 'D', 'E'], blockedAt: 'D' }))
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const details = await source.hydrate(await source.fetchList(), {})
    expect(calls.some((c) => c.path === 'pblprfr/E')).toBe(false)
    expect(Object.keys(cache.details)).toEqual(['C'])
    expect(details.map((d) => d.mt20id)).toEqual(['C'])
    expect(source.stats).toEqual({ listed: 3, fetched: 1, missing: 2, blocked: true })
    expect(cache.lastRun).toBe('20261031')
  })

  it('단건 오류는 그 한 건만 빼고 넘어간다', async () => {
    const { client } = fakeClient((path, p) => {
      if (path === 'pblprfr') return p.cpage === 1 ? ['A', 'B'].map(listBlock) : []
      if (path === 'pblprfr/A') return ['<db><mt20id>A</mt20id></db>'] // prfnm 없음
      return path.startsWith('pblprfr/') ? [detailBlock('B')] : [venueBlock(path.split('/')[1]!)]
    })
    const source = new KopisSource(client, emptyCache(), TODAY, HORIZON)
    const details = await source.hydrate(await source.fetchList(), {})
    expect(details.map((d) => d.mt20id)).toEqual(['B'])
    expect(source.stats).toMatchObject({ fetched: 1, missing: 1, blocked: false })
  })

  it('차단 없이 끝나면 lastRun을 오늘로 옮긴다', async () => {
    const cache = emptyCache()
    const { client } = fakeClient(routes({ list: ['A'] }))
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    await source.hydrate(await source.fetchList(), {})
    expect(cache.lastRun).toBe('20261101')
  })

  it('변경분 재조회가 실패하면 캐시 구본을 내보내고 lastRun은 그대로 둔다', async () => {
    const cache: KopisCache = { lastRun: '20261031', details: { A: cachedDetail('A') }, venues: { 'FC-A': {} } }
    const { client } = fakeClient((path, p) => {
      if (path === 'pblprfr') return p.cpage === 1 ? [listBlock('A')] : []
      return ['<db><mt20id>A</mt20id></db>'] // prfnm 없음
    })
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const details = await source.hydrate(await source.fetchList(), {})
    expect(details).toEqual([cachedDetail('A')])
    expect(source.stats.blocked).toBe(false)
    expect(cache.lastRun).toBe('20261031')
  })

  it('시설은 캐시에 없을 때만 부른다', async () => {
    const cache: KopisCache = { details: {}, venues: { 'FC-A': { adres: '이미 있음' } } }
    const { client, calls } = fakeClient(routes({ list: ['A', 'B'] }))
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    await source.hydrate(await source.fetchList(), {})
    expect(calls.filter((c) => c.path.startsWith('prfplc/')).map((c) => c.path)).toEqual(['prfplc/FC-B'])
    expect(cache.venues['FC-B']).toMatchObject({ lat: 37.5, lng: 127, fcltychartr: '민간' })
  })
})

describe('normalize', () => {
  async function normalized(detailFixture: string) {
    const cache = emptyCache()
    const detail = blocks(detailFixture)[0]!
    const { client } = fakeClient((path) => (path.startsWith('prfplc/') ? blocks('venue.xml') : [detail]))
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const id = /<mt20id>(\w+)</.exec(detail)![1]!
    const details = await source.hydrate([{ ...cachedDetail(id) }], {})
    return source.normalize(details)
  }

  it('정규화', async () => {
    const [item] = await normalized('detail.xml')
    expect(item).toEqual({
      id: 'kp-PF304841',
      source: 'kopis',
      kind: 'event',
      title: '서울시발레단, 어텀 발레데이: Last Dance',
      category: '무용(서양/한국무용)',
      place: '노들섬 (리허설스튜디오)',
      startDate: '2026-10-31',
      endDate: '2026-11-14',
      time: '토요일 ~ 일요일(10:00,13:00)',
      fee: '열매(심화) 70,000원, 잎새(초급) 50,000원, 줄기(중급) 50,000원, 새싹(입문) 30,000원',
      isFree: false,
      district: '용산구',
      lat: 37.5170464,
      lng: 126.9602196,
      address: '서울특별시 용산구 양녕로 445 (이촌동)',
      localVenue: true,
      imageUrl: 'https://kopis.or.kr/upload/pfmPoster/PF_PF304841_261029_140113.png',
      linkUrl: 'https://www.sejongpac.or.kr/portal/performance/performance/performTicket.do?performIdx=37788&menuNo=200320',
    })
    expect(eventItemSchema.parse(item)).toEqual(item)
  })

  it('전석무료는 isFree', async () => {
    const [item] = await normalized('detail-free.xml')
    expect(item).toMatchObject({ isFree: true, fee: '전석무료' })
  })

  it('정규화 결과가 0건이면 던진다', () => {
    const { client } = fakeClient(() => [])
    expect(() => new KopisSource(client, emptyCache(), TODAY, HORIZON).normalize([])).toThrow(/0건/)
  })

  it('openrun Y만 openRun, 좌표 0은 비운다', async () => {
    const cache = emptyCache()
    const { client } = fakeClient((path) =>
      path.startsWith('prfplc/')
        ? [venueBlock('V').replace('<la>37.5</la>', '<la>0</la>')]
        : [detailBlock('A', 'V').replace('<openrun>N</openrun>', '<openrun>Y</openrun>')],
    )
    const source = new KopisSource(client, cache, TODAY, HORIZON)
    const [item] = source.normalize(await source.hydrate([cachedDetail('A')], {}))
    expect(item).toMatchObject({ openRun: true })
    expect((item as { lat?: number }).lat).toBeUndefined()
    expect((item as { localVenue?: boolean }).localVenue).toBeUndefined()
  })
})
