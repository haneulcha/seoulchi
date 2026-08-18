import type { Item } from '~/types/item'

/** 비짓서울 상세 응답 캐시. cid → { 마지막으로 본 updt_dt_text, 응답 } */
export type DetailCache = Record<string, { updtDtText: string; detail: unknown }>

export interface EventSource<TListItem = unknown, TItem = unknown> {
  readonly name: string

  /** 원본 목록 수집 */
  fetchList(): Promise<TListItem[]>

  /**
   * 상세가 필요한 소스만 구현. 필요 없으면 목록을 그대로 반환한다.
   * 캐시를 제자리에서 갱신한다 — 호출 측이 이후 저장한다.
   */
  hydrate(items: TListItem[], cache: DetailCache): Promise<TItem[]>

  /** 공통 스키마로 변환. 소스별 지식이 사는 유일한 곳. */
  normalize(items: TItem[]): Item[]
}
