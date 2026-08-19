import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CuratedEntry } from '~/pipeline/curate'
import type { DetailCache } from '~/sources/types'
import { type EventItem, type PlaceItem } from '~/types/item'
import {
  curatedFileSchema,
  metaSchema,
  placesFileSchema,
  weeklyEventsSchema,
} from '~/types/files'

export interface EmitPayload {
  weekKey: string
  events: EventItem[]
  places: PlaceItem[]
  curated: CuratedEntry[]
  curatedPlaces: string[]
  providerName: string
  cache: DetailCache
  sourceCounts: Record<string, number>
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/**
 * 모든 파일을 쓰기 **전에** 전부 검증한다.
 * 하나라도 실패하면 아무것도 쓰지 않고 던진다 —
 * 조용히 빈 화면이 나가는 것보다 배치가 깨지는 게 낫다.
 */
export async function emit(
  payload: EmitPayload,
  opts: { dataDir?: string; now?: Date } = {},
): Promise<void> {
  const dataDir = opts.dataDir ?? 'data'
  const now = opts.now ?? new Date()

  const weekly = weeklyEventsSchema.parse({
    weekKey: payload.weekKey,
    items: payload.events,
  })
  const places = placesFileSchema.parse({ items: payload.places })

  // 참조 무결성: 큐레이션이 가리키는 id가 실제로 존재해야 한다
  const eventIds = new Set(weekly.items.map((i) => i.id))
  const placeIds = new Set(places.items.map((i) => i.id))

  for (const pick of payload.curated) {
    if (!eventIds.has(pick.id)) {
      throw new Error(`큐레이션이 존재하지 않는 이벤트를 가리킵니다: ${pick.id}`)
    }
  }
  for (const id of payload.curatedPlaces) {
    if (!placeIds.has(id)) {
      throw new Error(`큐레이션이 존재하지 않는 장소를 가리킵니다: ${id}`)
    }
  }

  const curated = curatedFileSchema.parse({
    weekKey: payload.weekKey,
    picks: payload.curated,
    places: payload.curatedPlaces,
  })

  const meta = metaSchema.parse({
    updatedAt: now.toISOString(),
    llmProvider: payload.providerName,
    sourceCounts: payload.sourceCounts,
    weekKey: payload.weekKey,
    counts: { events: weekly.items.length, places: places.items.length },
  })

  // 여기까지 왔으면 전부 유효하다. 이제 쓴다.
  await writeJson(join(dataDir, 'events', `${payload.weekKey}.json`), weekly)
  await writeJson(join(dataDir, 'places.json'), places)
  await writeJson(join(dataDir, 'curated', `${payload.weekKey}.json`), curated)
  await writeJson(join(dataDir, 'meta.json'), meta)
  await writeJson(join(dataDir, 'cache', 'visitseoul.json'), payload.cache)
}
