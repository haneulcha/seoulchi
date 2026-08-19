import { z } from 'zod'
import { eventItemSchema, placeItemSchema } from '~/types/item'

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
})

export type WeeklyEventsFile = z.infer<typeof weeklyEventsSchema>
export type PlacesFile = z.infer<typeof placesFileSchema>
export type CuratedFile = z.infer<typeof curatedFileSchema>
export type MetaFile = z.infer<typeof metaSchema>
