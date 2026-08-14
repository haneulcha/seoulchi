import { readFile } from 'node:fs/promises'
import { isoWeekKey, kstToday } from '~/lib/week'
import { createProvider } from '~/llm/index'
import { emit } from '~/pipeline/emit'
import { runPipeline } from '~/pipeline/run'
import { SeoulCultureSource } from '~/sources/seoul-culture'
import type { DetailCache } from '~/sources/types'
import { VisitSeoulSource } from '~/sources/visit-seoul'

/** docs/api-findings.md에서 확정한 수집 대상 카테고리로 교체할 것 */
const VISIT_SEOUL_CATEGORIES = process.env.VISITSEOUL_CATEGORIES?.split(',').filter(Boolean) ?? []

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`환경변수 ${name}이 필요합니다`)
  return value
}

async function loadCache(path: string): Promise<DetailCache> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as DetailCache
  } catch {
    console.log('캐시 없음 — 처음부터 수집합니다')
    return {}
  }
}

const now = new Date()
const today = kstToday(now)
const weekKey = process.argv[2] ?? isoWeekKey(now)

// 과거 데이터는 쌓지 않기로 했다. 지난 주차 요청은 조용히 빈 파일을 내는 대신 거절한다.
if (weekKey < isoWeekKey(now)) {
  throw new Error(
    `지난 주차(${weekKey})는 지원하지 않습니다. 과거 데이터를 쌓지 않는 것이 이 배치의 전제입니다.\n` +
      `정말 필요하면 계획의 "과거 컷오프" 제약을 먼저 되돌리세요.`,
  )
}

console.log(`대상 주차: ${weekKey} (오늘 ${today} 이후만 수집)\n`)

const cache = await loadCache('data/cache/visitseoul.json')
const provider = createProvider()
console.log(`LLM provider: ${provider.name}\n`)

const payload = await runPipeline({
  sources: [
    new SeoulCultureSource(requireEnv('SEOUL_API_KEY')),
    new VisitSeoulSource(requireEnv('VISITSEOUL_API_KEY'), VISIT_SEOUL_CATEGORIES),
  ],
  provider,
  weekKey,
  today,
  cache,
})

await emit(payload)

console.log(`
완료. ${payload.providerName}로 선별.
  이벤트 ${payload.events.length}건 → 선별 ${payload.curated.length}건
  장소 ${payload.places.length}건 → 노출 ${payload.curatedPlaces.length}건`)
