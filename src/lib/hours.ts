import type { ParsedHours } from '~/types/item'

/** 일=0 ... 토=6 */
const WEEKDAY_INDEX: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
}

/** 'HH:MM ~ HH:MM'. 콜론을 요구해 '1000~2000원' 같은 숫자 범위를 걸러낸다. */
const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/

const CLOSED_WEEKDAY_RE = /([일월화수목금토])요일/g
const ALWAYS_OPEN_RE = /연중\s*무휴|상시\s*운영/

/**
 * 시간대가 아니라 '늘 열려 있음'으로 적힌 경우. Task 6 실측에서 파싱 실패 원문의 최빈 패턴이었다.
 *
 * '24시간'은 문장이 거기서 끝나거나(`24시간, 연중무휴`) 개방/운영/영업/이용이 뒤따를 때만 인정한다.
 * 그냥 `24시간`을 잡으면 '24시간 전 예약 필수' 같은 안내문을 영업시간으로 오해한다.
 *
 * `연중무휴`는 여기 넣지 않는다. 쉬는 날이 없다는 뜻이지 24시간이라는 뜻이 아니다
 * (연중무휴 10:00~18:00이 흔하다). 그건 closedWeekdays 쪽에서 다룬다.
 */
const ALWAYS_OPEN_TIME_RE = /24\s*시간\s*(개방|운영|영업|이용)?\s*($|[,，·/])|상시\s*개방/

function pad(n: string): string {
  return n.padStart(2, '0')
}

function isValidTime(h: number, m: number): boolean {
  return h >= 0 && h <= 24 && m >= 0 && m <= 59
}

function extractClosedWeekdays(text: string): number[] {
  if (ALWAYS_OPEN_RE.test(text)) return []
  const found = new Set<number>()
  for (const m of text.matchAll(CLOSED_WEEKDAY_RE)) {
    const idx = WEEKDAY_INDEX[m[1]!]
    if (idx !== undefined) found.add(idx)
  }
  return [...found].sort((a, b) => a - b)
}

/**
 * 한국어 자유 텍스트에서 영업시간을 best-effort로 파싱한다.
 * 실패하면 null — 호출 측은 배지를 띄우지 않고 원문을 그대로 보여준다.
 * 조용히 틀린 값을 내는 것보다 모른다고 말하는 편이 낫다.
 */
export function parseHours(useTime?: string, closedDays?: string): ParsedHours | null {
  if (!useTime?.trim()) return null

  const closedWeekdays = extractClosedWeekdays(`${useTime} ${closedDays ?? ''}`)

  const m = TIME_RANGE_RE.exec(useTime)
  if (!m) {
    // 명시된 시간대가 없을 때만 '상시 개방'으로 본다. 있으면 그쪽이 이긴다.
    if (ALWAYS_OPEN_TIME_RE.test(useTime)) {
      return { open: '00:00', close: '24:00', closedWeekdays }
    }
    return null
  }

  const openH = Number(m[1])
  const openM = Number(m[2])
  const closeH = Number(m[3])
  const closeM = Number(m[4])
  if (!isValidTime(openH, openM) || !isValidTime(closeH, closeM)) return null

  return {
    open: `${pad(String(openH))}:${pad(String(openM))}`,
    close: `${pad(String(closeH))}:${pad(String(closeM))}`,
    closedWeekdays,
  }
}
