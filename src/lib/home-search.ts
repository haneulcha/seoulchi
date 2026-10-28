import { z } from 'zod'

/** 걸으러 가기는 실측상 100% 장소라 행사만 있는 홈에서는 늘 비어서 뺀다(스펙 4장) */
export const HOME_GROUPS = ['보러 가기', '해보러 가기', '놀러 가기'] as const

/** 탐색과 같은 규약: 잘못된 값은 버리고, 기본 상태(오늘)는 URL에 쓰지 않는다 */
export const homeSearchSchema = z.object({
  day: z.enum(['tomorrow', 'weekend']).optional().catch(undefined),
  group: z.enum(HOME_GROUPS).optional().catch(undefined),
  district: z.string().min(1).optional().catch(undefined),
  near: z.literal(true).optional().catch(undefined),
})

export type HomeSearch = z.infer<typeof homeSearchSchema>
