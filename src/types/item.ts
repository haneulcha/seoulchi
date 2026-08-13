import { z } from 'zod'

export const sourceNameSchema = z.enum(['seoul-culture', 'visit-seoul'])

/** 상세 라우트 /e/[id]에 인코딩 없이 들어가야 하므로 URL-safe 문자만 허용 */
const idSchema = z.string().regex(/^(sc|vs)-[A-Za-z0-9_-]+$/, 'id는 sc- 또는 vs- 접두사와 URL-safe 문자만 허용')
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식')

export const baseItemSchema = z.object({
  id: idSchema,
  source: sourceNameSchema,
  title: z.string().min(1),
  summary: z.string().optional(),
  category: z.string(),
  district: z.string().optional(),
  place: z.string(),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  imageUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  isFree: z.boolean().optional(),
  fee: z.string().optional(),
  subwayInfo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** merge에서 흡수된 다른 소스의 id */
  mergedFrom: z.array(z.string()).optional(),
})

export const eventItemSchema = baseItemSchema.extend({
  kind: z.literal('event'),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
})

/** 0=일요일 ... 6=토요일 */
const weekdaySchema = z.number().int().min(0).max(6)

export const parsedHoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  closedWeekdays: z.array(weekdaySchema),
})

export const placeItemSchema = baseItemSchema.extend({
  kind: z.literal('place'),
  useTime: z.string().optional(),
  closedDays: z.string().optional(),
  /** null = 파싱 실패. 배지를 띄우지 않고 원문(useTime)을 그대로 보여준다 */
  hours: parsedHoursSchema.nullable().optional(),
})

export const itemSchema = z.discriminatedUnion('kind', [eventItemSchema, placeItemSchema])

export type SourceName = z.infer<typeof sourceNameSchema>
export type BaseItem = z.infer<typeof baseItemSchema>
export type EventItem = z.infer<typeof eventItemSchema>
export type PlaceItem = z.infer<typeof placeItemSchema>
export type ParsedHours = z.infer<typeof parsedHoursSchema>
export type Item = z.infer<typeof itemSchema>
