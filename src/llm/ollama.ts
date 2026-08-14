import { z } from 'zod'
import type { CurationCandidate, CurationPick, LlmProvider } from '~/llm/types'

const pickResponseSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
})

/** Ollama의 format 필드에 넣을 JSON 스키마. Anthropic의 output_config.format과 같은 모양. */
const RESPONSE_FORMAT = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['picks'],
} as const

/** 빌드 재현성을 위한 고정 시드. 바꾸면 같은 데이터에서도 다른 선정이 나온다. */
const CURATION_SEED = 42

const SYSTEM_PROMPT = `당신은 서울의 문화행사를 고르는 편집자입니다.

주어진 후보 목록에서 이번 주에 가장 볼 만한 행사를 골라주세요.

규칙:
- 반드시 후보 목록에 있는 id만 고릅니다. 새로운 행사를 지어내지 마세요.
- 카테고리와 지역이 한쪽에 쏠리지 않게 다양하게 고릅니다.
- reason은 40자 내외의 한 줄 코멘트입니다. "왜 이번 주에 볼 만한가"를 씁니다.
- reason에 행사 제목을 그대로 반복하지 마세요. 읽는 사람이 이미 제목을 봅니다.
- 요청한 개수만큼 고릅니다.`

function buildUserPrompt(candidates: CurationCandidate[], count: number, weekLabel: string): string {
  const lines = candidates.map((c) =>
    [
      `- id: ${c.id}`,
      `  제목: ${c.title}`,
      `  분류: ${c.category} / ${c.district}`,
      `  장소: ${c.place}`,
      `  기간: ${c.startDate} ~ ${c.endDate}`,
      `  요금: ${c.isFree ? '무료' : '유료'}`,
    ].join('\n'),
  )

  return `${weekLabel}입니다. 아래 후보 ${candidates.length}개 중 ${count}개를 골라주세요.

${lines.join('\n')}`
}

/**
 * Ollama 스트리밍 응답(NDJSON)에서 message.content 조각을 이어붙인다.
 * 한 줄이 `{"message":{"content":"..."},"done":false}` 꼴이고 마지막에 done:true가 온다.
 * 추론은 message.thinking으로 따로 오므로 여기서 걸러진다 — content는 순수 JSON이 된다.
 */
async function readStreamedContent(res: Response): Promise<string> {
  const body = res.body
  // 스트림이 없는 응답(구버전 Ollama, 테스트 더블)은 통째로 읽어 같은 경로로 처리한다
  const raw = body ? null : await res.text()
  const parts: string[] = []
  let buffer = ''

  const consume = (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as { message?: { content?: string } }
        if (obj.message?.content) parts.push(obj.message.content)
      } catch {
        // 조각난 줄은 buffer에 남아 다음 청크와 합쳐진다
      }
    }
  }

  if (raw !== null) {
    consume(raw)
  } else {
    const decoder = new TextDecoder()
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      consume(decoder.decode(chunk, { stream: true }))
    }
  }
  if (buffer.trim()) consume('\n')

  return parts.join('')
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama'

  constructor(
    private readonly host = process.env.OLLAMA_HOST ?? 'http://localhost:11434',
    private readonly model = process.env.OLLAMA_MODEL ?? 'qwen3:30b',
  ) {}

  async curate({
    candidates,
    count,
    weekLabel,
  }: {
    candidates: CurationCandidate[]
    count: number
    weekLabel: string
  }): Promise<CurationPick[]> {
    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        // stream:false면 생성이 끝나야 헤더가 온다. undici 기본 headersTimeout이 300초인데
        // 실측 생성이 224초 + 모델 로딩 40초라 정상 경로에서 UND_ERR_HEADERS_TIMEOUT이 났다.
        // 스트리밍은 헤더가 즉시 오므로 생성이 얼마나 길든 끊기지 않는다.
        stream: true,
        format: RESPONSE_FORMAT,
        // seed 고정 = 재현성. 이 출력이 data/*.json으로 커밋되므로
        // 데이터가 안 바뀐 날에는 diff도 없어야 한다.
        // thinking은 끄지 않는다 — 끄면 40자 제약을 지키지 못한다(실측).
        options: { temperature: 0.3, seed: CURATION_SEED },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(candidates, count, weekLabel) },
        ],
      }),
    })

    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const content = await readStreamedContent(res)
    if (!content) throw new Error('Ollama 응답에 message.content가 없습니다')

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error(`Ollama가 JSON이 아닌 응답을 반환했습니다: ${content.slice(0, 200)}`)
    }

    return pickResponseSchema.parse(parsed).picks
  }
}
