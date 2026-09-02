import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// 상대 경로(별칭 '~' 아님): vite.config.ts가 catalogPagePaths() 위해 이 파일을 직접 import한다.
// vite는 자기 자신의 config 파일을 로드할 때 tsconfig paths/별칭을 풀지 않는다(rolldown에
// tsconfig:false 하드코딩, bundle·runner 로더 모두 동일 — 실측 확인). static-fn-base.ts가
// import를 아예 안 갖는 것과 같은 이유다.
import {
  catalogEventsSchema,
  catalogIndexSchema,
  curatedFileSchema,
  metaSchema,
  placesFileSchema,
  weeklyEventsSchema,
  type CatalogEventsFile,
  type CatalogIndexFile,
  type CuratedFile,
  type MetaFile,
  type PlacesFile,
  type WeeklyEventsFile,
} from '../types/files'

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

export function loadCatalog(dataDir = 'data'): CatalogEventsFile {
  return catalogEventsSchema.parse(readJson(dataDir, 'catalog.json'))
}

export function loadIndex(dataDir = 'data'): CatalogIndexFile {
  return catalogIndexSchema.parse(readJson(dataDir, 'index.json'))
}
