import { z } from 'zod'
import { addDays } from '~/lib/dates'
import { districtFromAddress } from '~/lib/district'
import { parseMinPrice } from '~/lib/price'
import { KopisBlockedError, xmlField, xmlFields, type KopisClient } from '~/sources/kopis-api'
import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem } from '~/types/item'

export interface KopisListRow {
  mt20id: string
  prfnm: string
  prfpdfrom: string
  prfpdto: string
  fcltynm: string
  poster?: string
  genrenm: string
  openrun: boolean
}
export interface KopisDetail extends KopisListRow {
  mt10id?: string
  pcseguidance?: string
  dtguidance?: string
  relateurls: string[]
}
export interface KopisVenue {
  adres?: string
  lat?: number
  lng?: number
  fcltychartr?: string
}
export interface KopisCache {
  /** YYYYMMDD. 다음 실행의 afterdate */
  lastRun?: string
  details: Record<string, KopisDetail>
  venues: Record<string, KopisVenue>
}
export interface KopisStats {
  listed: number
  fetched: number
  missing: number
  blocked: boolean
}

const ROWS = 100
const SEOUL = 11
/** KOPIS 목록은 기간을 31일까지만 받는다 */
const WINDOW_DAYS = 31
const LOCAL_VENUES = new Set(['공공(문예회관)', '공공(기타)'])

const kopisDate = z.string().regex(/^\d{4}\.\d{2}\.\d{2}$/)
const listRowSchema = z.object({
  mt20id: z.string().min(1),
  prfnm: z.string().min(1),
  prfpdfrom: kopisDate,
  prfpdto: kopisDate,
  fcltynm: z.string().min(1),
  poster: z.string().optional(),
  genrenm: z.string().min(1),
  openrun: z.enum(['Y', 'N']).transform((v) => v === 'Y'),
})
const detailSchema = z.object({
  mt20id: z.string().min(1),
  prfnm: z.string().min(1),
  prfpdfrom: kopisDate,
  prfpdto: kopisDate,
  fcltynm: z.string().default(''),
  poster: z.string().optional(),
  genrenm: z.string().default(''),
  openrun: z.enum(['Y', 'N']).optional().transform((v) => v === 'Y'),
  mt10id: z.string().optional(),
  pcseguidance: z.string().optional(),
  dtguidance: z.string().optional(),
  relateurls: z.array(z.string()),
})
const coord = z.string().optional().transform((v) => {
  const n = Number(v)
  return v && Number.isFinite(n) && n !== 0 ? n : undefined
})
const venueSchema = z.object({
  adres: z.string().optional(),
  lat: coord,
  lng: coord,
  fcltychartr: z.string().optional(),
})

const fields = (block: string, tags: string[]) => Object.fromEntries(tags.map((t) => [t, xmlField(block, t)]))
const LIST_TAGS = ['mt20id', 'prfnm', 'prfpdfrom', 'prfpdto', 'fcltynm', 'poster', 'genrenm', 'openrun']

const parseRow = (block: string): KopisListRow => listRowSchema.parse(fields(block, LIST_TAGS))
const parseDetail = (block: string): KopisDetail =>
  detailSchema.parse({
    ...fields(block, [...LIST_TAGS, 'mt10id', 'pcseguidance', 'dtguidance']),
    relateurls: xmlFields(block, 'relateurl'),
  })
const parseVenue = (block: string): KopisVenue => {
  const v = venueSchema.parse({ ...fields(block, ['adres', 'fcltychartr']), lat: xmlField(block, 'la'), lng: xmlField(block, 'lo') })
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))
}

const compact = (iso: string) => iso.replaceAll('-', '')
const toIso = (kopis: string) => kopis.replaceAll('.', '-')

/** [today, horizonEnd]를 31일 이하 창으로 나눈다 */
export function listWindows(today: string, horizonEnd: string): Array<{ stdate: string; eddate: string }> {
  const windows: Array<{ stdate: string; eddate: string }> = []
  for (let start = today; start <= horizonEnd; start = addDays(start, WINDOW_DAYS)) {
    const end = addDays(start, WINDOW_DAYS - 1)
    windows.push({ stdate: compact(start), eddate: compact(end < horizonEnd ? end : horizonEnd) })
  }
  return windows
}

export class KopisSource implements EventSource<KopisListRow, KopisDetail> {
  readonly name = 'kopis'
  stats: KopisStats = { listed: 0, fetched: 0, missing: 0, blocked: false }
  private changed = new Set<string>()

  constructor(
    private readonly client: KopisClient,
    private readonly cache: KopisCache,
    private readonly today: string,
    private readonly horizonEnd: string,
  ) {}

  /** 목록 호출의 차단·오류·필드 변경은 그대로 던진다 — 키 만료와 파라미터 오류가 여기서 드러난다 */
  private async listAll(extra: Record<string, string> = {}): Promise<KopisListRow[]> {
    const rows: KopisListRow[] = []
    for (const window of listWindows(this.today, this.horizonEnd)) {
      for (let cpage = 1; ; cpage++) {
        const blocks = await this.client.get('pblprfr', { ...window, cpage, rows: ROWS, signgucode: SEOUL, ...extra })
        rows.push(...blocks.map(parseRow))
        if (blocks.length < ROWS) break
      }
    }
    return rows
  }

  async fetchList(): Promise<KopisListRow[]> {
    const seen = new Map((await this.listAll()).map((r) => [r.mt20id, r]))
    if (this.cache.lastRun) {
      // afterdate 경계가 포함인지 모른다 — 하루 앞부터 받는다
      const r = this.cache.lastRun
      const afterdate = compact(addDays(`${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6)}`, -1))
      this.changed = new Set((await this.listAll({ afterdate })).map((row) => row.mt20id))
    }
    this.stats.listed = seen.size
    return [...seen.values()]
  }

  /** 단건 호출. 차단은 던지고, 그 밖의 실패는 경고하고 undefined */
  private async getOne<T>(path: string, parse: (block: string) => T): Promise<T | undefined> {
    try {
      const [block] = await this.client.get(path, {})
      if (block) return parse(block)
      console.warn(`[kopis] ${path} 빈 응답`)
    } catch (error) {
      if (error instanceof KopisBlockedError) throw error
      console.warn(`[kopis] ${path} 실패 — ${String(error)}`)
    }
    return undefined
  }

  /** `_cache`는 쓰지 않는다. 생성자의 KopisCache를 제자리에서 갱신한다 */
  async hydrate(rows: KopisListRow[], _cache: DetailCache): Promise<KopisDetail[]> {
    const { details, venues } = this.cache
    let fetched = 0
    let blocked = false
    let stale = false

    for (const row of rows) {
      const id = row.mt20id
      try {
        if (!details[id] || this.changed.has(id)) {
          const detail = await this.getOne(`pblprfr/${id}`, parseDetail)
          if (detail) {
            details[id] = detail
            fetched++
          } else if (this.changed.has(id)) stale = true
        }
        const mt10id = details[id]?.mt10id
        if (mt10id && !venues[mt10id]) {
          const venue = await this.getOne(`prfplc/${mt10id}`, parseVenue)
          if (venue) venues[mt10id] = venue
        }
      } catch (error) {
        // 차단. 남은 단건은 다음 실행으로 넘긴다. 받은 것은 캐시에 남아 있다
        console.warn(`[kopis] 단건 호출 중단 — ${String(error)}`)
        blocked = true
        break
      }
    }

    // 차단·실패로 다시 못 받은 변경분은 캐시 구본으로 내보낸다 — 빠지는 것보다 낫다. lastRun을 안 옮기므로 다음 실행이 다시 받는다
    const out = rows.flatMap((r) => details[r.mt20id] ?? [])
    this.stats = { listed: this.stats.listed, fetched, missing: rows.length - out.length, blocked }
    console.error(
      `[kopis] 목록 ${this.stats.listed} / 상세 호출 ${fetched} / 상세 없음 ${this.stats.missing} / 차단 ${blocked ? '예' : '아니오'}`,
    )
    if (!blocked && !stale) this.cache.lastRun = compact(this.today)
    return out
  }

  normalize(details: KopisDetail[]): EventItem[] {
    const items = details.map((d): EventItem => {
      const venue = (d.mt10id && this.cache.venues[d.mt10id]) || {}
      const fee = d.pcseguidance
      return {
        id: `kp-${d.mt20id}`,
        source: 'kopis',
        kind: 'event',
        title: d.prfnm,
        category: d.genrenm,
        place: d.fcltynm,
        startDate: toIso(d.prfpdfrom),
        endDate: toIso(d.prfpdto),
        time: d.dtguidance,
        fee,
        isFree: parseMinPrice(fee) === 0,
        district: districtFromAddress(venue.adres),
        lat: venue.lat,
        lng: venue.lng,
        address: venue.adres,
        localVenue: LOCAL_VENUES.has(venue.fcltychartr ?? '') || undefined,
        openRun: d.openrun || undefined,
        imageUrl: d.poster?.replace(/^http:\/\/www\.kopis\.or\.kr\//, 'https://kopis.or.kr/'),
        linkUrl: d.relateurls[0],
      }
    })
    if (items.length === 0) throw new Error('KOPIS 공연이 0건입니다 — 키 만료나 차단을 확인하세요')
    return items
  }
}
