import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem, Item } from '~/types/item'

/** 서울열린데이터광장 문화행사 API의 원본 행. 필드는 docs/api-findings.md 참조. */
export interface SeoulCultureRow {
  CODENAME?: string
  GUNAME?: string
  TITLE?: string
  PLACE?: string
  ORG_NAME?: string
  USE_TRGT?: string
  USE_FEE?: string
  ORG_LINK?: string
  MAIN_IMG?: string
  STRTDATE?: string
  END_DATE?: string
  LOT?: string
  LAT?: string
  IS_FREE?: string
  HMPG_ADDR?: string
  [key: string]: unknown
}

const PAGE_SIZE = 1000
const BASE = 'http://openapi.seoul.go.kr:8088'

/** '2026-08-10 00:00:00.0' → '2026-08-10'. 파싱 불가면 null. */
function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** 빈 문자열·0·NaN은 좌표 없음으로 취급한다. 0으로 채우면 아프리카 앞바다에 찍힌다. */
function toCoord(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw.trim())
  return Number.isFinite(n) && n !== 0 ? n : undefined
}

export class SeoulCultureSource implements EventSource<SeoulCultureRow, SeoulCultureRow> {
  readonly name = 'seoul-culture'

  constructor(private readonly apiKey: string) {}

  async fetchList(): Promise<SeoulCultureRow[]> {
    const rows: SeoulCultureRow[] = []
    let start = 1

    for (;;) {
      const end = start + PAGE_SIZE - 1
      const url = `${BASE}/${this.apiKey}/json/culturalEventInfo/${start}/${end}/`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`서울시 문화행사 API ${res.status}: ${url.replace(this.apiKey, '***')}`)

      const json = (await res.json()) as {
        culturalEventInfo?: { list_total_count?: number; row?: SeoulCultureRow[] }
        RESULT?: { CODE?: string; MESSAGE?: string }
      }

      if (!json.culturalEventInfo) {
        throw new Error(`서울시 문화행사 API 응답 이상: ${json.RESULT?.CODE} ${json.RESULT?.MESSAGE}`)
      }

      const page = json.culturalEventInfo.row ?? []
      rows.push(...page)

      const total = json.culturalEventInfo.list_total_count ?? rows.length
      if (rows.length >= total || page.length === 0) break
      start += PAGE_SIZE
    }

    return rows
  }

  /** 이 소스는 목록에 모든 필드가 들어 있으므로 상세 호출이 없다. */
  async hydrate(items: SeoulCultureRow[], _cache: DetailCache): Promise<SeoulCultureRow[]> {
    return items
  }

  normalize(rows: SeoulCultureRow[]): Item[] {
    const items: EventItem[] = []

    for (const row of rows) {
      const startDate = toIsoDate(row.STRTDATE)
      const endDate = toIsoDate(row.END_DATE)
      const title = row.TITLE?.trim()

      // 기간이나 제목이 없으면 이 제품에서 쓸 수 없다
      if (!startDate || !endDate || !title) continue

      const sourceId = `${row.HMPG_ADDR ?? ''}|${title}|${startDate}`
      items.push({
        id: `sc-${hashId(sourceId)}`,
        source: 'seoul-culture',
        kind: 'event',
        title,
        category: row.CODENAME?.trim() || '기타',
        district: row.GUNAME?.trim() || undefined,
        place: row.PLACE?.trim() || '장소 미상',
        lat: toCoord(row.LAT),
        lng: toCoord(row.LOT),
        imageUrl: row.MAIN_IMG?.trim() || undefined,
        linkUrl: row.HMPG_ADDR?.trim() || row.ORG_LINK?.trim() || undefined,
        isFree: row.IS_FREE?.trim() === '무료',
        fee: row.USE_FEE?.trim() || undefined,
        startDate,
        endDate,
      })
    }

    return items
  }
}

/**
 * 이 API는 안정적인 기본키를 주지 않으므로 (링크|제목|시작일)로 결정론적 id를 만든다.
 * URL-safe 문자만 나오는 32비트 FNV-1a 해시.
 */
function hashId(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}
