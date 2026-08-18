import type { ParsedHours } from '~/types/item'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * KST 기준 '지금 열려 있는가'. now는 인자다 — 내부에서 new Date()를 부르면
 * 테스트가 실행 시각에 따라 깨진다(레포 규칙). new Date()는 OpenNowBadge의
 * effect(브라우저 경계)에서만 부른다.
 *
 * 판정을 브라우저 타임존이 아니라 KST로 하는 이유: 장소는 서울에 있다.
 * 해외에서 접속해도 '서울 기준 지금'이 맞는 답이다.
 *
 * hours가 null/undefined면 false — 파싱 실패는 배지 없이 원문 노출(스펙 6장).
 */
export function isOpenNow(hours: ParsedHours | null | undefined, now: Date): boolean {
  if (!hours) return false

  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const weekday = kst.getUTCDay() // 0=일 … 6=토 — closedWeekdays와 같은 규약
  if (hours.closedWeekdays.includes(weekday)) return false

  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}` // 'HH:MM'끼리는 사전순 == 시간순

  if (hours.open < hours.close) return hours.open <= time && time < hours.close
  if (hours.open === hours.close) return false // 폭 0짜리 시간대 — 정보 없음과 같다
  // close < open: 자정을 넘기는 시간대 (예: 18:00~02:00)
  return time >= hours.open || time < hours.close
}
