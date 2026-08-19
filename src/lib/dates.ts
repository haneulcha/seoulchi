const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 'YYYY-MM-DD'(KST 달력 날짜) → '8/15(토)'. UTC로 만들어 읽으므로 실행 환경 타임존과 무관하다 */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  return `${m}/${d}(${WEEKDAYS[weekday]!})`
}

/**
 * 스펙 10-6. 종료일이 오늘로부터 2년을 넘으면 '상시' —
 * 원본에 2626-08-08, 2099-12-31 같은 오타가 소수 섞여 있다(실측 6건).
 * 비교는 문자열로 한다. YYYY-MM-DD는 사전순 == 시간순이고,
 * 연도에 +2만 하므로 존재하지 않는 날짜(예: 윤일)가 나와도 비교에는 지장이 없다.
 */
export function formatDateRange(start: string, end: string, today: string): string {
  const permanentLimit = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`
  if (end > permanentLimit) return '상시'
  if (start === end) return formatDay(start)
  return `${formatDay(start)} – ${formatDay(end)}`
}

/** meta.updatedAt(ISO 순간) → '8/14 19:59 갱신' (KST). 데이터가 며칠 묵으면 사용자가 알아챌 수 있어야 한다 */
export function formatUpdatedAt(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${hh}:${mm} 갱신`
}

/** 'YYYY-MM-DD' → '8/10'. 요일 없이 월/일만 — weekRange 라벨은 요일까지는 필요 없다 */
function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}

/**
 * week.ts의 weekRange({start, end})를 '8/10 – 8/16 기준'으로 표기한다.
 * 헤더의 주차 라벨이 실제 데이터가 속한 주(week.ts weekLabel 서수 표기)와
 * 어긋나 보이는 문제를 막는다 — 서수 대신 날짜 범위를 보여주면 데이터가
 * 어느 주의 것인지가 명시적이라 화면이 거짓말을 하지 않는다.
 */
export function formatWeekRange({ start, end }: { start: string; end: string }): string {
  return `${formatMonthDay(start)} – ${formatMonthDay(end)} 기준`
}
