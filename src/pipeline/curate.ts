import { toCandidate, type CurationPick, type LlmProvider } from '~/llm/types'
import type { EventItem } from '~/types/item'

export interface CuratedEntry {
  id: string
  reason: string
}

const MAX_REASON_LENGTH = 60

/**
 * 후보를 LLM에 넘겨 최종 선별을 받는다.
 *
 * 환각 방어 2겹:
 *   (a) LLM은 후보의 id만 고른다 (프롬프트와 응답 스키마로 강제)
 *   (b) 여기서 후보에 없는 id를 버리고, 부족분을 규칙 상위로 채운다
 *
 * LLM이 죽으면 규칙 상위 count개로 폴백한다 — 화면이 절대 비지 않는다.
 */
export async function curate(
  candidates: EventItem[],
  opts: { provider: LlmProvider; count: number; weekLabel: string },
): Promise<{ entries: CuratedEntry[]; providerName: string }> {
  const { provider, count, weekLabel } = opts
  const byId = new Map(candidates.map((e) => [e.id, e]))

  let picks: CurationPick[]
  let providerName = provider.name

  try {
    picks = await provider.curate({
      candidates: candidates.map(toCandidate),
      count,
      weekLabel,
    })
  } catch (error) {
    console.warn(`  [curate] ${provider.name} 실패 — 규칙 상위로 폴백:`, error)
    picks = []
    providerName = `rule (${provider.name} 실패)`
  }

  const entries: CuratedEntry[] = []
  const used = new Set<string>()

  // (b) 실재하는 id만, 중복 없이
  for (const pick of picks) {
    if (entries.length >= count) break
    if (!byId.has(pick.id) || used.has(pick.id)) continue
    used.add(pick.id)
    entries.push({
      id: pick.id,
      reason: pick.reason.trim().slice(0, MAX_REASON_LENGTH),
    })
  }

  // 부족분은 규칙 상위(candidates는 이미 점수순)에서 채운다
  for (const event of candidates) {
    if (entries.length >= count) break
    if (used.has(event.id)) continue
    used.add(event.id)
    entries.push({ id: event.id, reason: '' })
  }

  return { entries, providerName }
}
