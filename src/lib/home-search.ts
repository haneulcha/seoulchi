import { z } from 'zod'

/** 걸으러 가기는 실측상 100% 장소라 행사만 있는 홈에서는 늘 비어서 뺀다(스펙 4장) */
export const HOME_GROUPS = ['보러 가기', '해보러 가기', '놀러 가기'] as const

/** 탐색과 같은 규약: 잘못된 값은 버리고, 기본 상태(오늘·내 주변 켬)는 URL에 쓰지 않는다 */
export const homeSearchSchema = z.object({
  day: z.enum(['tomorrow', 'weekend']).optional().catch(undefined),
  group: z.enum(HOME_GROUPS).optional().catch(undefined),
  district: z.string().min(1).optional().catch(undefined),
  near: z.literal(false).optional().catch(undefined), // 내 주변은 기본으로 켜져 있다 — 끈 것만 URL에 남는다
  page: z.number().int().min(2).optional().catch(undefined),
})

export type HomeSearch = z.infer<typeof homeSearchSchema>

/** 번호 줄: 처음·끝·현재와 그 양옆. 한 칸 빈 곳은 번호로, 두 칸 이상은 줄임표로 메운다 */
export function pageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const keep = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
  const out: Array<number | '…'> = []
  for (const n of keep) {
    const prev = out.at(-1)
    if (typeof prev === 'number' && n - prev === 2) out.push(n - 1)
    else if (typeof prev === 'number' && n - prev > 2) out.push('…')
    out.push(n)
  }
  return out
}
