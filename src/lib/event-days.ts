const DAY_CHARS = '일월화수목금토'
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

// 앞에 숫자·한글이 없고 뒤에 한글이 없을 때만(요일은 허용) 요일 — 공휴일·6월·매일을 잡지 않는다
const DAY_RE = /(?<![0-9가-힣])([일월화수목금토])(?:요일|(?![가-힣]))/g
// 11.3(화)·10.30.(금)·29일(일)은 그날 하루의 표기지 반복 요일이 아니다
const DATED_DAY_RE = /(\d일?\.?)\s*\(\s*[일월화수목금토](?:요일)?\s*\)/g
// 일 2회는 횟수지 일요일이 아니다. 토,일 2회의 일은 남긴다
const PER_DAY_RE = /(?<![,·]\s*)일\s*\d+\s*회/g
const SEGMENT_RE = /[/\n※*()]/
const CLOSED_RE = /휴관|휴무|휴장/
// 목요일 21:00까지 연장처럼 매일 여는 시간의 예외로만 요일을 말하는 마디
const EXCEPTION_RE = /연장|야간|\d\s*까지/

function daysIn(text: string): number[] {
  const days: number[] = []
  if (/평일|주중/.test(text)) days.push(1, 2, 3, 4, 5)
  if (/주말/.test(text)) days.push(0, 6)
  const matches = [...text.matchAll(DAY_RE)]
  for (const [i, m] of matches.entries()) {
    const day = DAY_CHARS.indexOf(m[1]!)
    const prev = matches[i - 1]
    const gap = prev ? text.slice(prev.index + prev[0].length, m.index) : ''
    if (prev && /^\s*(?:[-~～–]|부터)\s*$/.test(gap)) {
      // 화-일처럼 일요일을 넘어 도는 범위. 시작 요일은 이미 들어가 있다
      for (let d = (DAY_CHARS.indexOf(prev[1]!) + 1) % 7; d !== day; d = (d + 1) % 7) days.push(d)
    }
    days.push(day)
  }
  return days
}

/**
 * 행사 시간 문구(time)에서 여는 요일(0=일…6=토, 오름차순). 못 읽으면 null — 모르는 것을 쉰다고 말하지 않는다.
 * 장소용 parseHours는 "X요일"을 전부 휴무로 읽어서 쓸 수 없다.
 * 격주·둘째 주 같은 주기는 매주로 읽힌다. 남기는 쪽 오류라 받아들인다.
 */
export function eventOpenWeekdays(time?: string): number[] | null {
  if (!time) return null
  const open = new Set<number>()
  const closed = new Set<number>()
  for (const segment of time.replace(DATED_DAY_RE, '$1').replace(PER_DAY_RE, '').split(SEGMENT_RE)) {
    const hit = CLOSED_RE.exec(segment)
    // 휴관 뒤의 요일(휴관일: 매주 월요일)은 읽지 않는다
    if (hit) for (const d of daysIn(segment.slice(0, hit.index))) closed.add(d)
    else if (!EXCEPTION_RE.test(segment)) for (const d of daysIn(segment)) open.add(d)
  }
  if (open.size === 0 && closed.size === 0) return null
  const result = (open.size > 0 ? [...open] : ALL_DAYS).filter((d) => !closed.has(d)).sort((a, b) => a - b)
  // 잘못 읽어 행사를 통째로 숨기느니 남긴다
  return result.length > 0 ? result : null
}
