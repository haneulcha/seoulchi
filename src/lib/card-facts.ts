import { formatDistance } from '~/lib/browse-filter'
import { addDays, relativeDateLabel } from '~/lib/dates'
import { districtFromAddress } from '~/lib/district'
import type { ParsedHours } from '~/types/item'

/**
 * 카드 한 장의 사실(계획 2026-10-26-card-facts). 고정 층은 늘 같은 자리에,
 * 조건부 층은 값이 있을 때만 나온다. 조각마다 아이콘을 붙일 예정이라 배열이 아니라 이름 붙은 객체다.
 */
export type CardFacts = {
  where?: string
  distance?: string
  time?: string
  price?: string
  deadline?: string
}

/** EventItem·PlaceItem·카탈로그 슬림 항목이 모두 들어맞는 최소 모양 */
export type CardFactsInput = {
  district?: string
  address?: string
  place?: string
  isFree?: boolean
  fee?: string
} & (
  | { kind: 'event'; startDate: string; endDate: string; time?: string }
  | { kind: 'place'; hours?: ParsedHours | null }
)

/** 진행 중 행사의 종료가 이 창 안이면 '…까지'를 띄운다. 기본값 — 화면을 보고 조정한다 */
const DEADLINE_WINDOW_DAYS = 6

export function cardFacts(
  item: CardFactsInput,
  { today, km }: { today?: string; km?: number },
): CardFacts {
  const district = item.district ?? districtFromAddress(item.address)
  const facts: CardFacts = {
    distance: km !== undefined ? formatDistance(km) : undefined,
    price: item.isFree ? '무료' : item.fee,
  }
  if (item.kind === 'place') {
    // 장소 원본은 place === title이다 — 자치구가 없을 때 place로 메우면 제목이 한 번 더 찍힌다
    facts.where = district
    // 파서는 '상시개방'을 00:00~24:00으로 읽는다(api-findings) — 사람 말로 되돌린다
    if (item.hours) {
      const { open, close } = item.hours
      facts.time = open === '00:00' && close === '24:00' ? '24시간' : `${open}~${close}`
    }
    return facts
  }
  facts.where = district ?? item.place
  facts.time = item.time
  // 오래 진행되는 행사의 'M/D까지'는 결정에 쓸모가 없다 — 곧 끝나거나 아직 시작 전일 때만 말한다
  if (today && (item.startDate > today || item.endDate <= addDays(today, DEADLINE_WINDOW_DAYS))) {
    facts.deadline = relativeDateLabel(item.startDate, item.endDate, today)
  }
  return facts
}

/** 맨 앞 대괄호 하나('[영등포구청] …')를 기관명으로 떼어 낸다. 대괄호만 있는 제목은 그대로 둔다 */
export function splitTitle(title: string): { title: string; org?: string } {
  const m = /^\s*\[([^\]]*)\]\s*(.*)$/s.exec(title)
  if (!m || m[2]!.trim() === '') return { title: title.trim() }
  const org = m[1]!.trim()
  return org ? { title: m[2]!.trim(), org } : { title: m[2]!.trim() }
}
