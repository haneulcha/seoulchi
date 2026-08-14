import type { EventItem } from '~/types/item'

export interface CurationCandidate {
  id: string
  title: string
  category: string
  district: string
  place: string
  startDate: string
  endDate: string
  isFree: boolean
  target?: string
  org?: string
}

export interface CurationPick {
  /** 반드시 candidates 안의 id */
  id: string
  /** 한 줄 코멘트 (40자 내외). 규칙 폴백일 때는 빈 문자열. */
  reason: string
}

export interface LlmProvider {
  /** meta.json에 기록된다 */
  readonly name: string
  curate(input: {
    candidates: CurationCandidate[]
    count: number
    weekLabel: string
  }): Promise<CurationPick[]>
}

/**
 * EventItem → CurationCandidate.
 * 결측값은 항목을 버리지 않고 기본값으로 채운다 —
 * 자치구가 비었다는 이유로 좋은 행사를 후보에서 떨어뜨리면 선별 품질이 떨어진다.
 */
export function toCandidate(event: EventItem): CurationCandidate {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    district: event.district ?? '미상',
    place: event.place,
    startDate: event.startDate,
    endDate: event.endDate,
    isFree: event.isFree ?? false,
    org: event.place || undefined,
  }
}
