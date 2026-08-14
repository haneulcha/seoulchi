import { afterEach, describe, expect, it, vi } from 'vitest'
import { OllamaProvider } from '~/llm/ollama'
import { createProvider } from '~/llm/index'
import type { CurationCandidate } from '~/llm/types'

const candidates: CurationCandidate[] = [
  {
    id: 'sc-a', title: '전시 A', category: '전시', district: '종로구',
    place: '미술관', startDate: '2026-08-10', endDate: '2026-08-16', isFree: true,
  },
  {
    id: 'sc-b', title: '공연 B', category: '공연', district: '중구',
    place: '극장', startDate: '2026-08-12', endDate: '2026-08-14', isFree: false,
  },
]

function ollamaResponse(picks: unknown) {
  return new Response(
    JSON.stringify({ message: { content: JSON.stringify({ picks }) } }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('OllamaProvider', () => {
  const provider = new OllamaProvider('http://localhost:11434', 'test-model')

  it('name이 ollama다', () => {
    expect(provider.name).toBe('ollama')
  })

  it('응답의 picks를 파싱한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ollamaResponse([{ id: 'sc-a', reason: '무료 전시' }]),
    )
    const picks = await provider.curate({ candidates, count: 1, weekLabel: '테스트 주' })
    expect(picks).toEqual([{ id: 'sc-a', reason: '무료 전시' }])
  })

  it('JSON 스키마를 format으로 강제한다', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ollamaResponse([{ id: 'sc-a', reason: 'x' }]))

    await provider.curate({ candidates, count: 1, weekLabel: 'x' })

    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.format).toBeDefined()
    expect(body.stream).toBe(false)
    expect(body.model).toBe('test-model')
  })

  it('seed를 고정해 보낸다 (출력이 커밋되므로 재현 가능해야 한다)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ollamaResponse([{ id: 'sc-a', reason: 'x' }]))

    await provider.curate({ candidates, count: 1, weekLabel: 'x' })

    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.options.seed).toBe(42)
    expect(body.options.temperature).toBe(0.3)
  })

  it('thinking을 끄지 않는다 — 끄면 40자 제약을 지키지 못한다 (실측)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ollamaResponse([{ id: 'sc-a', reason: 'x' }]))

    await provider.curate({ candidates, count: 1, weekLabel: 'x' })

    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.think).toBeUndefined()
  })

  it('프롬프트에 후보의 id와 제목을 담는다', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ollamaResponse([{ id: 'sc-a', reason: 'x' }]))

    await provider.curate({ candidates, count: 1, weekLabel: '2026년 8월 둘째 주' })

    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    const prompt = body.messages.map((m: { content: string }) => m.content).join('\n')
    expect(prompt).toContain('sc-a')
    expect(prompt).toContain('전시 A')
    expect(prompt).toContain('2026년 8월 둘째 주')
  })

  it('HTTP 오류를 던진다 (호출 측이 폴백하도록)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(provider.curate({ candidates, count: 1, weekLabel: 'x' })).rejects.toThrow()
  })

  it('JSON이 아닌 응답을 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: { content: '이건 JSON이 아님' } })),
    )
    await expect(provider.curate({ candidates, count: 1, weekLabel: 'x' })).rejects.toThrow()
  })

  it('스키마에 안 맞는 picks를 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ollamaResponse([{ nope: 1 }]))
    await expect(provider.curate({ candidates, count: 1, weekLabel: 'x' })).rejects.toThrow()
  })
})

describe('createProvider', () => {
  it('LLM_PROVIDER=rule이면 RuleOnlyProvider를 준다', () => {
    vi.stubEnv('LLM_PROVIDER', 'rule')
    expect(createProvider().name).toBe('rule')
    vi.unstubAllEnvs()
  })

  it('LLM_PROVIDER=ollama면 OllamaProvider를 준다', () => {
    vi.stubEnv('LLM_PROVIDER', 'ollama')
    expect(createProvider().name).toBe('ollama')
    vi.unstubAllEnvs()
  })

  it('알 수 없는 값이면 던진다 (조용히 폴백하지 않는다)', () => {
    vi.stubEnv('LLM_PROVIDER', 'gpt')
    expect(() => createProvider()).toThrow(/LLM_PROVIDER/)
    vi.unstubAllEnvs()
  })
})
