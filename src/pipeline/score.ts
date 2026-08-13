import { weekRange } from '~/lib/week'
import type { EventItem, Item } from '~/types/item'

/**
 * 대형·주요 기관 화이트리스트.
 * 구청 문화강좌와 시립미술관 특별전을 규칙만으로 구분할 수 없으므로,
 * 손으로 관리하는 목록으로 기준선을 만든다. 실제 데이터를 보며 늘려간다.
 */
export const MAJOR_ORGS: readonly string[] = [
  '서울시립미술관', '서울역사박물관', '국립중앙박물관', '국립현대미술관',
  '예술의전당', '세종문화회관', '국립극장', '아르코예술극장',
  '동대문디자인플라자', 'DDP', '북서울미술관', '남서울미술관',
  '서울공예박물관', '서울식물원', '한가람미술관', '블루스퀘어',
  '롯데콘서트홀', '국립국악원', '정동극장', '대학로예술극장',
]

const WEIGHTS = {
  startsThisWeek: 30,
  endsThisWeek: 20,
  weekend: 15,
  free: 10,
  majorOrg: 25,
  hasImage: 8,
  hasSummary: 5,
  hasCoords: 5,
} as const

function overlaps(event: EventItem, start: string, end: string): boolean {
  return event.startDate <= end && event.endDate >= start
}

/** 주말(토·일)에 열리는가 */
function includesWeekend(event: EventItem, weekStart: string): boolean {
  const saturday = addDays(weekStart, 5)
  const sunday = addDays(weekStart, 6)
  return (
    (event.startDate <= saturday && event.endDate >= saturday) ||
    (event.startDate <= sunday && event.endDate >= sunday)
  )
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function isMajorOrg(event: EventItem): boolean {
  const haystack = `${event.place} ${event.title}`
  return MAJOR_ORGS.some((org) => haystack.includes(org))
}

export function scoreEvent(event: EventItem, weekKey: string): number {
  const { start, end } = weekRange(weekKey)
  let score = 0

  if (event.startDate >= start && event.startDate <= end) score += WEIGHTS.startsThisWeek
  if (event.endDate >= start && event.endDate <= end) score += WEIGHTS.endsThisWeek
  if (includesWeekend(event, start)) score += WEIGHTS.weekend
  if (event.isFree) score += WEIGHTS.free
  if (isMajorOrg(event)) score += WEIGHTS.majorOrg
  if (event.imageUrl) score += WEIGHTS.hasImage
  if (event.summary) score += WEIGHTS.hasSummary
  if (event.lat != null && event.lng != null) score += WEIGHTS.hasCoords

  return score
}

/**
 * 이번 주에 열리는 event만 골라 점수순 상위 N개를 반환한다.
 * 점수가 같으면 제목 순으로 안정 정렬해 빌드 재현성을 지킨다.
 *
 * `today`(KST, YYYY-MM-DD)를 인자로 받아 **이미 끝난 행사를 뺀다.**
 * 주 시작일만 기준으로 삼으면 월요일에 끝난 행사가 목요일 화면에 남는다.
 * `today`를 내부에서 만들지 않는 이유는 테스트가 실행 날짜에 따라 깨지지 않게 하기 위해서다.
 */
export function selectCandidates(
  items: Item[],
  weekKey: string,
  today: string,
  limit = 40,
): EventItem[] {
  const { start, end } = weekRange(weekKey)
  // 유효 시작일 = max(주 시작일, 오늘). 지난 주차를 넘겨도 과거 행사가 새어나오지 않는다.
  const from = today > start ? today : start

  return items
    .filter((item): item is EventItem => item.kind === 'event' && overlaps(item, from, end))
    .map((event) => ({ event, score: scoreEvent(event, weekKey) }))
    .sort((a, b) => b.score - a.score || a.event.title.localeCompare(b.event.title, 'ko'))
    .slice(0, limit)
    .map(({ event }) => event)
}
