import { describe, expect, it } from 'vitest'
import { RuleOnlyProvider } from '~/llm/rule-only'
import { toCandidate } from '~/llm/types'
import type { EventItem } from '~/types/item'

function evt(over: Partial<EventItem> = {}): EventItem {
  return {
    id: 'sc-a',
    source: 'seoul-culture',
    kind: 'event',
    title: '행사',
    category: '전시',
    place: '어딘가',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    ...over,
  }
}

describe('toCandidate', () => {
  it('district가 없으면 "미상"으로 채운다', () => {
    expect(toCandidate(evt({ district: undefined })).district).toBe('미상')
  })

  it('isFree가 없으면 false로 채운다', () => {
    expect(toCandidate(evt({ isFree: undefined })).isFree).toBe(false)
  })

  it('있는 값은 그대로 쓴다', () => {
    expect(toCandidate(evt({ district: '종로구', isFree: true }))).toMatchObject({
      district: '종로구',
      isFree: true,
    })
  })
})

describe('RuleOnlyProvider', () => {
  const provider = new RuleOnlyProvider()

  it('name이 rule이다', () => {
    expect(provider.name).toBe('rule')
  })

  it('앞에서부터 count개를 고른다 (후보는 이미 점수순)', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map((id) => toCandidate(evt({ id: `sc-${id}` })))
    const picks = await provider.curate({ candidates, count: 2, weekLabel: '테스트 주' })
    expect(picks.map((p) => p.id)).toEqual(['sc-a', 'sc-b'])
  })

  it('후보가 count보다 적으면 있는 만큼만 반환한다', async () => {
    const candidates = [toCandidate(evt())]
    expect(await provider.curate({ candidates, count: 12, weekLabel: 'x' })).toHaveLength(1)
  })

  it('reason은 빈 문자열이다 (규칙만으로는 코멘트를 쓸 수 없다)', async () => {
    const picks = await provider.curate({
      candidates: [toCandidate(evt())],
      count: 1,
      weekLabel: 'x',
    })
    expect(picks[0]!.reason).toBe('')
  })
})
