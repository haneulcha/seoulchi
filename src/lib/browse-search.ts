import { z } from 'zod'
import type { BrowseFilters } from '~/lib/browse-filter'

/**
 * 카테고리 칩 6개. '기타'(13건)는 칩 한 자리 값을 못 해서 뺀다 —
 * 숨기는 게 아니라 '전체'에 그대로 있다(스펙 7장).
 */
export const CHIP_GROUPS = ['전시', '체험·배움', '공원·자연', '역사·명소', '축제', '공연'] as const

/**
 * 필터 상태 = URL search params. 이유는 공유가 아니라 뒤로가기다(스펙 7장).
 * 잘못된 값은 던지지 않고 기본값(없음)으로 복구한다 — 화면을 깨는 대신 필터가 풀린다.
 * 토글은 z.literal(true): 켜짐만 URL에 남긴다. free=false는 free 없음과 같은 상태다.
 */
export const browseSearchSchema = z.object({
  group: z.enum(CHIP_GROUPS).optional().catch(undefined),
  district: z.string().min(1).optional().catch(undefined),
  free: z.literal(true).optional().catch(undefined),
  open: z.literal(true).optional().catch(undefined),
  near: z.literal(true).optional().catch(undefined),
})

export type BrowseSearch = z.infer<typeof browseSearchSchema>

/** near는 필터가 아니라 정렬 축이라 BrowseFilters로 넘기지 않는다 */
export function toBrowseFilters(search: BrowseSearch): BrowseFilters {
  return { group: search.group, district: search.district, free: search.free, open: search.open }
}
