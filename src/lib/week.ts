const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/

/**
 * 순간(Date)을 KST 달력 날짜로 옮긴다.
 * 반환된 Date의 UTC 필드를 읽으면 KST의 연/월/일이 나온다.
 * KST는 서머타임이 없으므로 고정 오프셋으로 정확하다.
 */
function toKstCalendarDate(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  )
}

/** 월=0 ... 일=6 (ISO 요일 인덱스) */
function isoDayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}

/** 그 날짜가 속한 ISO 주의 목요일 */
function thursdayOfWeek(d: Date): Date {
  const t = new Date(d)
  t.setUTCDate(t.getUTCDate() - isoDayIndex(d) + 3)
  return t
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function isoWeekKey(date: Date): string {
  const thursday = thursdayOfWeek(toKstCalendarDate(date))
  const isoYear = thursday.getUTCFullYear()

  // ISO 1주차는 1월 4일이 속한 주. 그 주의 목요일이 기준점.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const week1Thursday = thursdayOfWeek(jan4)

  // 목요일 간 차이는 정확히 7의 배수이므로 반올림이 안전하다
  const weekNo = Math.round((thursday.getTime() - week1Thursday.getTime()) / WEEK_MS) + 1
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`
}

function mondayOfWeekKey(key: string): Date {
  const m = WEEK_KEY_RE.exec(key)
  if (!m) throw new Error(`잘못된 주차 키: ${key} (형식: YYYY-Www)`)
  const isoYear = Number(m[1])
  const weekNo = Number(m[2])

  const week1Thursday = thursdayOfWeek(new Date(Date.UTC(isoYear, 0, 4)))
  const thursday = new Date(week1Thursday.getTime() + (weekNo - 1) * WEEK_MS)
  return new Date(thursday.getTime() - 3 * DAY_MS)
}

export function weekRange(key: string): { start: string; end: string } {
  const monday = mondayOfWeekKey(key)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  return { start: formatIsoDate(monday), end: formatIsoDate(sunday) }
}

const ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'] as const

/**
 * '2026년 8월 둘째 주'.
 * 기준은 그 주의 목요일 — ISO 주차가 목요일이 속한 해를 따르므로 일관된다.
 * 해당 월의 몇 번째 목요일인지로 순번을 매긴다.
 */
export function weekLabel(key: string): string {
  const thursday = new Date(mondayOfWeekKey(key).getTime() + 3 * DAY_MS)
  const year = thursday.getUTCFullYear()
  const month = thursday.getUTCMonth() + 1
  const nth = Math.ceil(thursday.getUTCDate() / 7)
  const ordinal = ORDINALS[nth - 1] ?? `${nth}번째`
  return `${year}년 ${month}월 ${ordinal} 주`
}

/**
 * KST 달력 기준 오늘. 과거 컷오프(`max(주 시작일, 오늘)`)의 기준값이다.
 * `now`를 인자로 받는 이유는 이 유틸을 쓰는 순수 함수들이
 * 실행 날짜에 따라 결과가 바뀌지 않게 하기 위해서다 — 호출 측이 한 번만 정한다.
 */
export function kstToday(now: Date): string {
  return formatIsoDate(toKstCalendarDate(now))
}
