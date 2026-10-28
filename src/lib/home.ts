import type { EventItem } from '~/types/item'

export interface HomeEntry {
  item: EventItem
  /** 큐레이션 코멘트. 규칙 배치(LLM_PROVIDER=rule)에서는 빈 문자열 — 렌더 측이 그 줄을 접는다 */
  reason: string
}
