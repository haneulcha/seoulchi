import type { CurationPick, LlmProvider } from '~/llm/types'

/**
 * LLM 없이 후보 순서를 그대로 쓴다.
 * 후보는 selectCandidates에서 이미 점수순으로 정렬돼 있다.
 * 폴백 경로이자 테스트용이며, LLM_PROVIDER=rule로 직접 선택할 수도 있다.
 */
export class RuleOnlyProvider implements LlmProvider {
  readonly name = 'rule'

  async curate({
    candidates,
    count,
  }: {
    candidates: { id: string }[]
    count: number
    weekLabel: string
  }): Promise<CurationPick[]> {
    return candidates.slice(0, count).map((c) => ({ id: c.id, reason: '' }))
  }
}
