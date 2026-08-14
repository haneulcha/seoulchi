import { parseHours } from '~/lib/hours'
import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem, Item, PlaceItem } from '~/types/item'

const BASE = 'https://api-call.visitseoul.net/api/v1'
/**
 * 상세 호출 간 간격(ms). 배려가 아니라 필수다 —
 * 비짓서울은 레이트 리밋을 500으로 위장해 돌려준다(Task 0 실측).
 * 120ms면 성공률 50%, 400ms면 67%, 1000ms면 100%. 재시도와 함께 쓴다.
 */
const DETAIL_DELAY_MS = 400
/** 캐시 폴백도 없이 사라진 항목이 이 비율을 넘으면 배치를 깨뜨린다. */
const MAX_DETAIL_LOSS_RATIO = 0.1
/** 실측상 200까지 받는다. 초회 수집 요청 수를 기본값(50)의 1/4로 줄인다. */
const LIST_PAGE_SIZE = 200
/** 카테고리 필터 요청의 간헐적 500에 대한 재시도. */
const LIST_MAX_ATTEMPTS = 4
const RETRY_BASE_MS = 250

export interface VisitSeoulListItem {
  cid: string
  com_ctgry_sn?: string
  main_img?: string
  post_sj?: string
  sumry?: string
  updt_dt_text?: string
  [key: string]: unknown
}

export interface VisitSeoulDetail {
  cid: string
  cate_depth?: string | string[]
  main_img?: string
  post_sj?: string
  sumry?: string
  schdul_info_bgnde?: string
  schdul_info_endde?: string
  tag?: string[]
  extra?: {
    cmmn_hmpg_url?: string
    cmmn_use_time?: string
    trrsrt_use_chrge?: string
    trrsrt_use_chrge_guidance?: string
    closed_days?: string
    [key: string]: unknown
  }
  traffic?: {
    adres?: string
    new_adres?: string
    map_position_x?: string
    map_position_y?: string
    subway_info?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** '2026.08.10' 또는 '2026-08-10' → '2026-08-10'. 불가면 null. */
function toIsoDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(raw.trim())
  if (!m) return null
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
}

function toCoord(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw.trim())
  return Number.isFinite(n) && n !== 0 ? n : undefined
}

/** ' 문화관광 > 전시시설' → '전시시설' */
function lastCategorySegment(depth: string | string[] | undefined): string {
  const text = Array.isArray(depth) ? depth.join(' > ') : (depth ?? '')
  const parts = text.split('>').map((s) => s.trim()).filter(Boolean)
  return parts.at(-1) ?? '기타'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class VisitSeoulSource
  implements EventSource<VisitSeoulListItem, VisitSeoulDetail>
{
  readonly name = 'visit-seoul'

  constructor(
    private readonly apiKey: string,
    private readonly categoryIds: string[],
  ) {}

  private get headers(): Record<string, string> {
    return {
      'VISITSEOUL-API-KEY': this.apiKey,
      Accept: 'application/json;charset=UTF-8',
      'Content-Type': 'application/json;charset=UTF-8',
    }
  }

  async fetchList(): Promise<VisitSeoulListItem[]> {
    const seen = new Map<string, VisitSeoulListItem>()

    for (const categoryId of this.categoryIds) {
      for (let page = 1; ; page++) {
        // 카테고리 필터 요청은 약 30% 확률로 500을 낸다(서버 측 불안정, Task 0 실측).
        // 재시도 없이는 배치가 임의로 깨진다.
        const res = await this.postWithRetry(`${BASE}/contents/list`, {
          com_ctgry_sn: categoryId,
          lang_code_id: 'ko',
          page_no: page,
          page_size: LIST_PAGE_SIZE,
        })
        if (!res.ok) throw new Error(`비짓서울 목록 ${res.status} (카테고리 ${categoryId}, 재시도 후에도 실패)`)

        const json = (await res.json()) as {
          data?: VisitSeoulListItem[]
          paging?: { page_no: number; page_size: number; total_count: number }
        }
        const rows = json.data ?? []
        for (const row of rows) seen.set(row.cid, row)

        const paging = json.paging
        if (!paging || rows.length === 0) break
        if (paging.page_no * paging.page_size >= paging.total_count) break
      }
    }

    return [...seen.values()]
  }

  /**
   * 선형 백오프로 재시도한다. 마지막 응답을 그대로 돌려준다.
   *
   * **HTTP 상태(500)뿐 아니라 fetch가 던지는 예외도 재시도한다.**
   * 상태만 보고 예외를 놓쳤더니, 2,199건을 도는 중 커넥션 리셋 한 번에
   * 배치 전체가 죽고 20분치 수집이 날아갔다(ECONNRESET, 실측).
   *
   * 재시도를 다 쓰고도 예외면 그 예외를 던진다 — 호출 측이 판단한다.
   * 목록은 못 받으면 진행이 불가능하니 위로 던지고,
   * 상세는 그 한 건만 실패로 세고 계속 간다.
   */
  private async postWithRetry(url: string, payload: unknown): Promise<Response> {
    let res: Response | undefined
    let lastError: unknown

    for (let attempt = 1; attempt <= LIST_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await sleep(RETRY_BASE_MS * attempt)
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
        })
        lastError = undefined
        if (res.ok) return res
      } catch (error) {
        lastError = error
      }
    }

    if (lastError) throw lastError
    return res!
  }

  /**
   * cid + updt_dt_text를 키로 상세 응답을 캐시한다.
   * 갱신되지 않은 항목은 상세 호출을 생략하므로 정상 상태에서 호출량이 0에 수렴한다.
   * cache는 제자리에서 갱신되며, 호출 측이 이후 파일로 저장한다.
   */
  async hydrate(
    items: VisitSeoulListItem[],
    cache: DetailCache,
  ): Promise<VisitSeoulDetail[]> {
    const out: VisitSeoulDetail[] = []
    let fetched = 0
    let failed = 0
    /** 실패했고 캐시 구본도 없어 결과에서 아예 빠진 항목 수 */
    let lost = 0

    for (const item of items) {
      const updtDtText = item.updt_dt_text ?? ''
      const cached = cache[item.cid]

      if (cached && cached.updtDtText === updtDtText) {
        out.push(cached.detail as VisitSeoulDetail)
        continue
      }

      if (fetched > 0) await sleep(DETAIL_DELAY_MS)

      // GET은 405, 쿼리스트링 POST는 400. cid를 body에 실은 POST만 통한다(Task 0 실측).
      // 레이트 리밋이 500으로 오므로 목록과 같은 재시도를 태운다.
      let res: Response
      try {
        res = await this.postWithRetry(`${BASE}/contents/info`, {
          cid: item.cid,
          lang_code_id: 'ko',
        })
      } catch (error) {
        // 재시도를 다 쓴 네트워크 오류. 이 한 건 때문에 나머지를 버리지 않는다.
        console.warn(`비짓서울 상세 네트워크 실패: ${item.cid} — ${String(error)}`)
        fetched++
        failed++
        if (cached) out.push(cached.detail as VisitSeoulDetail)
        else lost++
        continue
      }
      fetched++

      if (!res.ok) {
        // 캐시된 구본이 있으면 쓰고, 없으면 이 항목은 사라진다 — 아래에서 비율을 따진다.
        console.warn(`비짓서울 상세 ${res.status}: ${item.cid} — 재시도 후에도 실패`)
        failed++
        if (cached) out.push(cached.detail as VisitSeoulDetail)
        else lost++
        continue
      }

      const json = (await res.json()) as { data?: VisitSeoulDetail } & VisitSeoulDetail
      const detail = json.data ?? json
      cache[item.cid] = { updtDtText, detail }
      out.push(detail)
    }

    console.log(
      `  [visit-seoul] 상세 호출 ${fetched}건 / 전체 ${items.length}건 / 실패 ${failed}건 / 유실 ${lost}건`,
    )

    // 기준은 호출 실패율이 아니라 **실제 유실률**이다.
    // 캐시 구본으로 메운 실패는 손실이 아니고, 정상 상태(대부분 캐시 적중)에서
    // 호출 실패율로 재면 한 건만 실패해도 100%가 되어 오탐한다.
    // 조용히 절반이 빈 채로 나가는 것보다 배치가 깨지는 게 낫다.
    if (items.length > 0 && lost / items.length > MAX_DETAIL_LOSS_RATIO) {
      throw new Error(
        `비짓서울 상세 유실률이 너무 높습니다: ${lost}/${items.length}건. ` +
          `레이트 리밋일 가능성이 높으니 DETAIL_DELAY_MS를 올리세요.`,
      )
    }

    return out
  }

  normalize(details: VisitSeoulDetail[]): Item[] {
    const items: Item[] = []

    for (const d of details) {
      const title = d.post_sj?.trim()
      if (!title) continue

      const base = {
        id: `vs-${d.cid}`,
        source: 'visit-seoul' as const,
        title,
        summary: d.sumry?.trim() || undefined,
        category: lastCategorySegment(d.cate_depth),
        place: title,
        address: d.traffic?.new_adres?.trim() || d.traffic?.adres?.trim() || undefined,
        lat: toCoord(d.traffic?.map_position_y),
        lng: toCoord(d.traffic?.map_position_x),
        imageUrl: d.main_img?.trim() || undefined,
        linkUrl: d.extra?.cmmn_hmpg_url?.trim() || undefined,
        isFree: d.extra?.trrsrt_use_chrge?.trim().toUpperCase() === 'F',
        fee: d.extra?.trrsrt_use_chrge_guidance?.trim() || undefined,
        subwayInfo: d.traffic?.subway_info?.trim() || undefined,
        tags: d.tag?.length ? d.tag : undefined,
      }

      const startDate = toIsoDate(d.schdul_info_bgnde)
      const endDate = toIsoDate(d.schdul_info_endde)

      if (startDate && endDate) {
        const event: EventItem = { ...base, kind: 'event', startDate, endDate }
        items.push(event)
      } else {
        const useTime = d.extra?.cmmn_use_time?.trim() || undefined
        const closedDays = d.extra?.closed_days?.trim() || undefined
        const place: PlaceItem = {
          ...base,
          kind: 'place',
          useTime,
          closedDays,
          hours: parseHours(useTime, closedDays),
        }
        items.push(place)
      }
    }

    return items
  }
}
