import { describe, expect, it } from 'vitest'
import { pickHomeItems } from '~/lib/home'
import type { EventItem } from '~/types/item'

const TODAY = '2026-08-18'

function ev(id: string, startDate: string, endDate: string): EventItem {
  return {
    id,
    source: 'seoul-culture',
    kind: 'event',
    title: `행사 ${id}`,
    category: '전시/미술',
    place: '어딘가',
    startDate,
    endDate,
  }
}

describe('pickHomeItems', () => {
  it('endDate < 오늘인 항목은 제외한다', () => {
    const events = [ev('sc-끝남', '2026-08-10', '2026-08-16'), ev('sc-진행', '2026-08-10', '2026-08-23')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-진행'])
  })

  it('살아 있는 pick이 curated 순서대로 먼저, reason을 유지한 채 온다', () => {
    const a = ev('sc-a', '2026-08-20', '2026-08-21')
    const b = ev('sc-b', '2026-08-19', '2026-08-19')
    const out = pickHomeItems({
      events: [a, b],
      picks: [
        { item: a, reason: '코멘트 a' },
        { item: b, reason: '' },
      ],
      today: TODAY,
    })
    // 정렬대로면 b(19일)가 먼저지만, pick 순서가 이긴다
    expect(out.map((e) => e.item.id)).toEqual(['sc-a', 'sc-b'])
    expect(out[0]!.reason).toBe('코멘트 a')
    expect(out[1]!.reason).toBe('')
  })

  it('죽은 pick은 버리고 보충한다 — 실측: W33 picks 12개 중 08-18에 2개만 생존', () => {
    const dead = ev('sc-죽음', '2026-08-15', '2026-08-16')
    const alive = ev('sc-생존', '2026-08-10', '2026-08-23')
    const filler = ev('sc-보충', '2026-08-19', '2026-08-19')
    const out = pickHomeItems({
      events: [dead, alive, filler],
      picks: [
        { item: dead, reason: 'x' },
        { item: alive, reason: 'y' },
      ],
      today: TODAY,
    })
    expect(out.map((e) => e.item.id)).toEqual(['sc-생존', 'sc-보충'])
  })

  it('아직 시작 안 한 행사는 시작일 오름차순', () => {
    const events = [ev('sc-늦게', '2026-08-22', '2026-08-23'), ev('sc-곧', '2026-08-19', '2026-08-23')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-곧', 'sc-늦게'])
  })

  it('이미 시작한 행사끼리는 마감 임박순 — max(startDate, 오늘)이 전부 오늘로 동률', () => {
    const events = [ev('sc-여유', '2026-08-01', '2026-09-30'), ev('sc-임박', '2026-08-10', '2026-08-19')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-임박', 'sc-여유'])
  })

  it('이미 시작한 행사가 아직 시작 안 한 행사보다 먼저다 — 오늘 <= 미래 시작일', () => {
    const events = [ev('sc-미래', '2026-08-19', '2026-08-30'), ev('sc-진행중', '2026-08-01', '2026-08-30')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-진행중', 'sc-미래'])
  })

  it('완전 동률이면 id 오름차순 — 같은 입력이면 항상 같은 홈 (빌드 재현성)', () => {
    const events = [ev('sc-b', '2026-08-19', '2026-08-20'), ev('sc-a', '2026-08-19', '2026-08-20')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-a', 'sc-b'])
  })

  it('기본 12개에서 자른다', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      ev(`sc-${String(i).padStart(2, '0')}`, '2026-08-19', '2026-08-23'),
    )
    expect(pickHomeItems({ events, picks: [], today: TODAY })).toHaveLength(12)
  })

  it('살아 있는 항목이 12개 미만이면 있는 만큼만 낸다', () => {
    const events = [ev('sc-1', '2026-08-19', '2026-08-23')]
    expect(pickHomeItems({ events, picks: [], today: TODAY })).toHaveLength(1)
  })

  it('보충된 항목의 reason은 빈 문자열이다', () => {
    const events = [ev('sc-1', '2026-08-19', '2026-08-23')]
    expect(pickHomeItems({ events, picks: [], today: TODAY })[0]!.reason).toBe('')
  })
})
