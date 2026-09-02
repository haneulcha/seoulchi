import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCatalog, loadCurated, loadIndex, loadMeta, loadPlaces, loadWeek } from '~/data/load'

const validEvent = {
  id: 'sc-1',
  source: 'seoul-culture',
  kind: 'event',
  title: '행사',
  category: '전시/미술',
  place: '어딘가',
  startDate: '2026-08-17',
  endDate: '2026-08-23',
}

const validPlace = {
  id: 'vs-KOP1',
  source: 'visit-seoul',
  kind: 'place',
  title: '장소',
  category: '문화관광',
  place: '어딘가',
}

const validMeta = {
  updatedAt: '2026-08-14T10:59:22.232Z',
  llmProvider: 'rule',
  sourceCounts: { 'seoul-culture': 1 },
  weekKey: '2026-W34',
  counts: { events: 1, places: 1 },
}

describe('data 로더', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'seoulchi-load-'))
    await mkdir(join(dir, 'events'), { recursive: true })
    await mkdir(join(dir, 'curated'), { recursive: true })
    await writeFile(join(dir, 'meta.json'), JSON.stringify(validMeta))
    await writeFile(
      join(dir, 'events', '2026-W34.json'),
      JSON.stringify({ weekKey: '2026-W34', items: [validEvent] }),
    )
    await writeFile(join(dir, 'places.json'), JSON.stringify({ items: [validPlace] }))
    await writeFile(
      join(dir, 'curated', '2026-W34.json'),
      JSON.stringify({ weekKey: '2026-W34', picks: [{ id: 'sc-1', reason: '' }], places: ['vs-KOP1'] }),
    )
    await writeFile(
      join(dir, 'catalog.json'),
      JSON.stringify({ horizonEnd: '2026-10-26', items: [validEvent] }),
    )
    await writeFile(
      join(dir, 'index.json'),
      JSON.stringify({
        generatedAt: '2026-08-31T00:00:00.000Z',
        horizonEnd: '2026-10-26',
        items: [{
          id: 'sc-1', kind: 'event', title: '행사', group: '전시',
          place: '어딘가', startDate: '2026-08-17', endDate: '2026-08-23',
        }],
      }),
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loadMeta가 meta.json을 검증하며 읽는다', () => {
    expect(loadMeta(dir).weekKey).toBe('2026-W34')
  })

  it('loadWeek가 주차 파일을 읽는다', () => {
    const week = loadWeek('2026-W34', dir)
    expect(week.items).toHaveLength(1)
    expect(week.items[0]!.id).toBe('sc-1')
  })

  it('loadPlaces가 places.json을 읽는다', () => {
    expect(loadPlaces(dir).items[0]!.kind).toBe('place')
  })

  it('loadCurated가 큐레이션 파일을 읽는다', () => {
    const curated = loadCurated('2026-W34', dir)
    expect(curated.picks).toHaveLength(1)
    expect(curated.places).toEqual(['vs-KOP1'])
  })

  it('스키마가 어긋나면 던진다 — 조용히 이상한 화면을 만들지 않는다', async () => {
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ updatedAt: 1 }))
    expect(() => loadMeta(dir)).toThrow()
  })

  it('파일이 없으면 던진다 — 없는 주차를 읽으려는 실수가 빌드에서 드러난다', () => {
    expect(() => loadWeek('2026-W01', dir)).toThrow()
  })

  it('loadCatalog가 8주 카탈로그를 검증하며 읽는다', () => {
    expect(loadCatalog(dir).items[0]!.id).toBe('sc-1')
    expect(loadCatalog(dir).horizonEnd).toBe('2026-10-26')
  })

  it('loadIndex가 슬림 인덱스를 검증하며 읽는다', () => {
    expect(loadIndex(dir).items).toHaveLength(1)
  })

  it('인덱스 스키마가 어긋나면 던진다', async () => {
    await writeFile(join(dir, 'index.json'), JSON.stringify({ items: [] }))
    expect(() => loadIndex(dir)).toThrow()
  })
})
