import { z } from 'zod'
import { CATEGORY_GROUPS } from '~/lib/category'
import { eventItemSchema, parsedHoursSchema, placeItemSchema } from '~/types/item'

export const weekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/)

export const weeklyEventsSchema = z.object({
  weekKey: weekKeySchema,
  items: z.array(eventItemSchema),
})

export const placesFileSchema = z.object({
  items: z.array(placeItemSchema),
})

export const curatedFileSchema = z.object({
  weekKey: weekKeySchema,
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
  places: z.array(z.string()),
})

export const metaSchema = z.object({
  updatedAt: z.string(),
  llmProvider: z.string(),
  sourceCounts: z.record(z.string(), z.number()),
  weekKey: weekKeySchema,
  counts: z.object({ events: z.number(), places: z.number() }),
  /** 카탈로그에서 제외한 endDate 이상치 건수. 실패를 숨기지 않는다(스펙 4장) */
  anomalies: z.number().int().optional(),
  /** 6그룹에 매핑되지 않아 '기타'로 노출 중인 원시 카테고리. 비어 있는 게 정상 */
  unmappedCategories: z.array(z.string()).optional(),
})

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const categoryGroupSchema = z.enum(CATEGORY_GROUPS)

/**
 * 탐색 카탈로그의 슬림 항목(스펙 5장). 목록·필터·거리에 필요한 필드만 담는다 —
 * 상세 정보는 SSG된 상세 페이지가 갖는다(원천은 catalog.json).
 * 좌표·hours·district는 없으면 필드 생략(0·null로 채우지 않음).
 */
export const catalogIndexItemSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(), kind: z.literal('event'), title: z.string().min(1),
    group: categoryGroupSchema, district: z.string().optional(), place: z.string(),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
    isFree: z.boolean().optional(), imageUrl: z.string().optional(),
    startDate: isoDateSchema, endDate: isoDateSchema,
  }),
  z.object({
    id: z.string(), kind: z.literal('place'), title: z.string().min(1),
    group: categoryGroupSchema, district: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
    isFree: z.boolean().optional(), imageUrl: z.string().optional(),
    hours: parsedHoursSchema.optional(),
  }),
])

export const catalogIndexSchema = z.object({
  generatedAt: z.string(),
  horizonEnd: isoDateSchema,
  items: z.array(catalogIndexItemSchema),
})

/** 8주 카탈로그 행사의 전체 필드 — 빌드 타임 전용. 상세 SSG의 원천이다 */
export const catalogEventsSchema = z.object({
  horizonEnd: isoDateSchema,
  items: z.array(eventItemSchema),
})

export type WeeklyEventsFile = z.infer<typeof weeklyEventsSchema>
export type PlacesFile = z.infer<typeof placesFileSchema>
export type CuratedFile = z.infer<typeof curatedFileSchema>
export type MetaFile = z.infer<typeof metaSchema>
export type CatalogIndexFile = z.infer<typeof catalogIndexSchema>
export type CatalogIndexItem = z.infer<typeof catalogIndexItemSchema>
export type CatalogEventIndexItem = Extract<CatalogIndexItem, { kind: 'event' }>
export type CatalogPlaceIndexItem = Extract<CatalogIndexItem, { kind: 'place' }>
export type CatalogEventsFile = z.infer<typeof catalogEventsSchema>
