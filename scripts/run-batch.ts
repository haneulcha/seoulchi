import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
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

const CACHE_PATH = 'data/cache/visitseoul.json'
/** 중간 저장 주기. 죽었을 때 잃는 양의 상한이다. */
const CACHE_SAVE_INTERVAL_MS = 30_000

async function loadCache(path: string): Promise<DetailCache> {
  try {
    const cache = JSON.parse(await readFile(path, 'utf8')) as DetailCache
    console.log(`캐시 ${Object.keys(cache).length}건 로드`)
    return cache
  } catch {
    console.log('캐시 없음 — 처음부터 수집합니다')
    return {}
  }
}

async function saveCache(path: string, cache: DetailCache): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    // emit과 같은 pretty 형식으로 쓴다. 형식이 엇갈리면 실패한 실행이 compact를 남기고
    // 다음 성공 실행이 pretty로 되돌리면서 파일 전체가 바뀐 diff가 잡힌다.
    await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  } catch (error) {
    // 중간 저장 실패가 배치를 멈추게 하지는 않는다
    console.warn('캐시 중간 저장 실패:', error)
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

const cache = await loadCache(CACHE_PATH)
const provider = createProvider()
console.log(`LLM provider: ${provider.name}\n`)

/**
 * 초회 hydrate는 25분 넘게 걸린다(2,199건 × 레이트 리밋 간격).
 * 캐시를 emit에서만 저장하면 그 사이 어떤 실패에도 전부 날아간다 — 실제로 겪었다.
 * hydrate가 cache를 제자리에서 갱신하므로, 주기적으로 스냅샷만 떠두면
 * 다음 실행이 거기서 이어받는다.
 */
const cacheSaver = setInterval(() => {
  void saveCache(CACHE_PATH, cache)
}, CACHE_SAVE_INTERVAL_MS)

let payload
try {
  payload = await runPipeline({
    sources: [
      new SeoulCultureSource(requireEnv('SEOUL_API_KEY')),
      new VisitSeoulSource(requireEnv('VISITSEOUL_API_KEY'), VISIT_SEOUL_CATEGORIES),
    ],
    provider,
    weekKey,
    today,
    cache,
  })
} catch (error) {
  clearInterval(cacheSaver)
  // 죽더라도 여기까지 받아둔 상세는 남긴다. 다음 실행이 이어받는다.
  await saveCache(CACHE_PATH, cache)
  console.error(`\n실패. 수집한 상세 ${Object.keys(cache).length}건은 캐시에 남겼습니다.`)
  throw error
}
clearInterval(cacheSaver)

await emit(payload)

console.log(`
완료. ${payload.providerName}로 선별.
  이벤트 ${payload.events.length}건 → 선별 ${payload.curated.length}건
  장소 ${payload.places.length}건 → 노출 ${payload.curatedPlaces.length}건`)
