import { describe, expect, it } from 'vitest'
import { isOpenNow } from '~/lib/open-now'
import type { ParsedHours } from '~/types/item'

const daytime: ParsedHours = { open: '10:00', close: '18:00', closedWeekdays: [1] }

/** KST 2026-08-18(화) 14:00 = UTC 05:00 — 테스트는 순간(UTC)으로 고정한다 */
const TUE_14_KST = new Date('2026-08-18T05:00:00Z')

describe('isOpenNow', () => {
  it('영업시간 안이면 true', () => {
    expect(isOpenNow(daytime, TUE_14_KST)).toBe(true)
  })

  it('개점 전이면 false', () => {
    // KST 화 09:59 = UTC 00:59
    expect(isOpenNow(daytime, new Date('2026-08-18T00:59:00Z'))).toBe(false)
  })

  it('폐점 시각 정각은 false (close는 배타)', () => {
    // KST 화 18:00 = UTC 09:00
    expect(isOpenNow(daytime, new Date('2026-08-18T09:00:00Z'))).toBe(false)
  })

  it('휴무 요일이면 시간과 무관하게 false', () => {
    // KST 2026-08-17(월) 14:00 = UTC 05:00, closedWeekdays=[1]=월
    expect(isOpenNow(daytime, new Date('2026-08-17T05:00:00Z'))).toBe(false)
  })

  it('요일 판정도 KST다 — UTC로는 화요일 저녁이 KST로는 수요일 새벽', () => {
    const closedWed: ParsedHours = { open: '00:00', close: '24:00', closedWeekdays: [3] }
    // KST 2026-08-19(수) 01:00 = UTC 2026-08-18(화) 16:00
    expect(isOpenNow(closedWed, new Date('2026-08-18T16:00:00Z'))).toBe(false)
  })

  it("상시 개방('00:00'~'24:00')은 밤 늦게도 true", () => {
    const always: ParsedHours = { open: '00:00', close: '24:00', closedWeekdays: [] }
    // KST 화 23:59 = UTC 14:59
    expect(isOpenNow(always, new Date('2026-08-18T14:59:00Z'))).toBe(true)
  })

  it('null이면 false — 파싱 실패는 배지를 띄우지 않고 원문을 보여준다', () => {
    expect(isOpenNow(null, TUE_14_KST)).toBe(false)
    expect(isOpenNow(undefined, TUE_14_KST)).toBe(false)
  })

  describe('자정을 넘기는 시간대 (18:00~02:00)', () => {
    const overnight: ParsedHours = { open: '18:00', close: '02:00', closedWeekdays: [] }

    it('밤이면 true', () => {
      // KST 화 20:00 = UTC 11:00
      expect(isOpenNow(overnight, new Date('2026-08-18T11:00:00Z'))).toBe(true)
    })

    it('자정 지난 새벽이면 true', () => {
      // KST 수 01:00 = UTC 화 16:00
      expect(isOpenNow(overnight, new Date('2026-08-18T16:00:00Z'))).toBe(true)
    })

    it('낮이면 false', () => {
      expect(isOpenNow(overnight, TUE_14_KST)).toBe(false)
    })
  })
})
