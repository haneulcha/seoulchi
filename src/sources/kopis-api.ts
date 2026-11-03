/** 호출 사이 간격(ms). KOPIS는 연속 호출을 차단 페이지로 막는다. */
export const KOPIS_INTERVAL_MS = 3000

const BASE = 'https://kopis.or.kr/openApi/restful'

export class KopisApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'KopisApiError'
  }
}

export class KopisBlockedError extends Error {
  constructor(status: number) {
    super(`KOPIS 차단 응답 (HTTP ${status})`)
    this.name = 'KopisBlockedError'
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string): string {
  return s.replace(/&(?:#(\d+)|(amp|lt|gt|quot|apos));/g, (_, n?: string, name?: string) =>
    n ? String.fromCodePoint(Number(n)) : ENTITIES[name!]!,
  )
}

/** 첫 <tag>의 텍스트. 빈 값은 undefined. */
export function xmlField(block: string, tag: string): string | undefined {
  return xmlFields(block, tag)[0]
}

/** 모든 <tag>의 텍스트. 빈 값은 건너뛴다. */
export function xmlFields(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  return [...block.matchAll(re)].map((m) => decode(m[1]!.trim())).filter(Boolean)
}

/** 본문을 `<db>` 블록 원문 배열로 자른다. 차단은 HTTP 상태와 무관하게 본문 모양으로 판정한다. */
export function parseKopisResponse(status: number, body: string): string[] {
  if (!body.trimStart().startsWith('<?xml')) throw new KopisBlockedError(status)
  const code = xmlField(body, 'returncode')
  if (code === '04') return []
  if (code) throw new KopisApiError(code, xmlField(body, 'errmsg') ?? `KOPIS 오류 ${code}`)
  if (status < 200 || status >= 300) throw new KopisApiError(`http-${status}`, `KOPIS HTTP ${status}`)
  return body.match(/<db>[\s\S]*?<\/db>/g) ?? []
}

export interface KopisClient {
  get(path: string, params: Record<string, string | number>): Promise<string[]>
}

export function createKopisClient(
  apiKey: string,
  opts: { intervalMs?: number; fetchFn?: typeof fetch } = {},
): KopisClient {
  const { intervalMs = KOPIS_INTERVAL_MS, fetchFn = fetch } = opts
  let first = true
  return {
    async get(path, params) {
      if (!first) await new Promise((r) => setTimeout(r, intervalMs))
      first = false
      const qs = new URLSearchParams({ service: apiKey, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
      const res = await fetchFn(`${BASE}/${path}?${qs}`)
      return parseKopisResponse(res.status, await res.text())
    },
  }
}
