import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  curatedFileSchema,
  metaSchema,
  placesFileSchema,
  weeklyEventsSchema,
  type CuratedFile,
  type MetaFile,
  type PlacesFile,
  type WeeklyEventsFile,
} from '~/types/files'

/**
 * 빌드 타임 전용. 정적 서버 함수 핸들러와 테스트에서만 import할 것.
 * 클라이언트 코드가 import하면 node:fs 때문에 번들이 깨진다 — 의도된 안전장치다.
 *
 * dataDir 기본값 'data'는 레포 루트 기준 상대 경로다(resolve가 cwd 기준으로 푼다).
 * 빌드는 항상 레포 루트에서 돌므로 성립한다. 테스트는 절대 경로를 넘긴다.
 */
function readJson(dataDir: string, ...segments: string[]): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, ...segments), 'utf8'))
}

export function loadMeta(dataDir = 'data'): MetaFile {
  return metaSchema.parse(readJson(dataDir, 'meta.json'))
}

export function loadWeek(weekKey: string, dataDir = 'data'): WeeklyEventsFile {
  return weeklyEventsSchema.parse(readJson(dataDir, 'events', `${weekKey}.json`))
}

export function loadPlaces(dataDir = 'data'): PlacesFile {
  return placesFileSchema.parse(readJson(dataDir, 'places.json'))
}

export function loadCurated(weekKey: string, dataDir = 'data'): CuratedFile {
  return curatedFileSchema.parse(readJson(dataDir, 'curated', `${weekKey}.json`))
}
