import { OllamaProvider } from '~/llm/ollama'
import { RuleOnlyProvider } from '~/llm/rule-only'
import type { LlmProvider } from '~/llm/types'

/**
 * LLM_PROVIDER 환경변수로 provider를 고른다.
 * 알 수 없는 값이면 던진다 — 오타를 조용히 폴백으로 삼키면
 * 왜 코멘트가 비었는지 알 수 없게 된다.
 *
 * anthropic은 GitHub Actions로 이관할 때 추가한다 (Ollama는 러너에서 돌지 않는다).
 */
export function createProvider(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? 'ollama'

  switch (name) {
    case 'ollama':
      return new OllamaProvider()
    case 'rule':
      return new RuleOnlyProvider()
    default:
      throw new Error(`알 수 없는 LLM_PROVIDER: ${name} (ollama | rule)`)
  }
}
