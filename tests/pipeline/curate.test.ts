import { describe, expect, it, vi } from 'vitest'
import { curate } from '~/pipeline/curate'
import type { LlmProvider } from '~/llm/types'
import type { EventItem } from '~/types/item'

function evt(id: string): EventItem {
  return {
    id, source: 'seoul-culture', kind: 'event', title: `행사 ${id}`,
    category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-16',
  }
}

const events = ['sc-a', 'sc-b', 'sc-c', 'sc-d'].map(evt)

function fakeProvider(picks: { id: string; reason: string }[]): LlmProvider {
  return { name: 'fake', curate: vi.fn().mockResolvedValue(picks) }
}

function throwingProvider(): LlmProvider {
  return { name: 'fake', curate: vi.fn().mockRejectedValue(new Error('죽음')) }
}

describe('curate — 정상 경로', () => {
  it('provider가 고른 순서를 유지한다', async () => {
    const provider = fakeProvider([
      { id: 'sc-c', reason: '좋음' },
      { id: 'sc-a', reason: '괜찮음' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries.map((e) => e.id)).toEqual(['sc-c', 'sc-a'])
  })

  it('사용된 provider 이름을 반환한다', async () => {
    const { providerName } = await curate(events, {
      provider: fakeProvider([{ id: 'sc-a', reason: 'x' }]),
      count: 1,
      weekLabel: 'x',
    })
    expect(providerName).toBe('fake')
  })
})

describe('curate — 환각 방어', () => {
  it('후보에 없는 id를 버린다', async () => {
    const provider = fakeProvider([
      { id: 'sc-a', reason: '진짜' },
      { id: 'sc-지어냄', reason: '가짜' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries.map((e) => e.id)).not.toContain('sc-지어냄')
  })

  it('버린 만큼 규칙 상위에서 채운다', async () => {
    const provider = fakeProvider([
      { id: 'sc-c', reason: '진짜' },
      { id: 'sc-없음', reason: '가짜' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries).toHaveLength(2)
    expect(entries[0]!.id).toBe('sc-c')
    // 후보 순서(sc-a가 맨 앞)에서 아직 안 쓰인 것으로 채운다
    expect(entries[1]!.id).toBe('sc-a')
  })

  it('중복 id를 한 번만 쓴다', async () => {
    const provider = fakeProvider([
      { id: 'sc-a', reason: '1' },
      { id: 'sc-a', reason: '2' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(new Set(entries.map((e) => e.id)).size).toBe(2)
  })

  it('reason이 너무 길면 자른다', async () => {
    const provider = fakeProvider([{ id: 'sc-a', reason: '아'.repeat(200) }])
    const { entries } = await curate(events, { provider, count: 1, weekLabel: 'x' })
    expect(entries[0]!.reason.length).toBeLessThanOrEqual(60)
  })
})

describe('curate — 폴백', () => {
  it('provider가 던지면 규칙 상위로 채운다', async () => {
    const { entries, providerName } = await curate(events, {
      provider: throwingProvider(),
      count: 3,
      weekLabel: 'x',
    })
    expect(entries.map((e) => e.id)).toEqual(['sc-a', 'sc-b', 'sc-c'])
    expect(providerName).toBe('rule (fake 실패)')
  })

  it('폴백된 항목의 reason은 빈 문자열이다', async () => {
    const { entries } = await curate(events, {
      provider: throwingProvider(),
      count: 1,
      weekLabel: 'x',
    })
    expect(entries[0]!.reason).toBe('')
  })

  it('후보가 count보다 적으면 있는 만큼만 반환한다', async () => {
    const { entries } = await curate([evt('sc-a')], {
      provider: throwingProvider(),
      count: 12,
      weekLabel: 'x',
    })
    expect(entries).toHaveLength(1)
  })

  it('후보가 아예 없어도 죽지 않는다', async () => {
    // 컷오프가 이번 주 행사를 전부 걸러낸 주에 실제로 일어날 수 있다
    const { entries } = await curate([], {
      provider: fakeProvider([{ id: 'sc-a', reason: 'x' }]),
      count: 12,
      weekLabel: 'x',
    })
    expect(entries).toEqual([])
  })
})

describe('curate — 개수 상한', () => {
  it('LLM이 count보다 많이 골라도 count에서 자른다', async () => {
    const provider = fakeProvider(
      ['sc-a', 'sc-b', 'sc-c', 'sc-d'].map((id) => ({ id, reason: 'x' })),
    )
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries).toHaveLength(2)
  })
})
