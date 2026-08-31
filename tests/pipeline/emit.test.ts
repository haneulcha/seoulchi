import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emit } from '~/pipeline/emit'
import type { EventItem, PlaceItem } from '~/types/item'

const event: EventItem = {
  id: 'sc-a', source: 'seoul-culture', kind: 'event', title: '행사',
  category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-16',
}

const place: PlaceItem = {
  id: 'vs-b', source: 'visit-seoul', kind: 'place', title: '장소',
  category: '문화관광', place: '장소',
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'seoulchi-emit-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const basePayload = {
  weekKey: '2026-W33',
  events: [event],
  places: [place],
  curated: [{ id: 'sc-a', reason: '무료 전시' }],
  curatedPlaces: ['vs-b'],
  providerName: 'ollama',
  cache: {},
  sourceCounts: { 'seoul-culture': 1, 'visit-seoul': 1 },
  catalog: {
    events: [event],
    places: [place],
    horizonEnd: '2026-10-26',
    anomalies: [{ id: 'sc-이상', endDate: '2626-08-08' }],
  },
  unmappedCategories: ['수수께끼분류'],
}

async function readJson(path: string) {
  return JSON.parse(await readFile(join(dir, path), 'utf8'))
}

describe('emit', () => {
  it('주간 이벤트 파일을 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('events/2026-W33.json')).toMatchObject({
      weekKey: '2026-W33',
      items: [{ id: 'sc-a' }],
    })
  })

  it('place는 주 파일이 아니라 places.json에 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    const weekly = await readJson('events/2026-W33.json')
    expect(weekly.items.map((i: { id: string }) => i.id)).not.toContain('vs-b')
    expect((await readJson('places.json')).items[0].id).toBe('vs-b')
  })

  it('큐레이션 파일에 선별과 장소를 함께 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('curated/2026-W33.json')).toMatchObject({
      weekKey: '2026-W33',
      picks: [{ id: 'sc-a', reason: '무료 전시' }],
      places: ['vs-b'],
    })
  })

  it('meta에 갱신 시각과 provider를 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('meta.json')).toMatchObject({
      updatedAt: '2026-08-13T00:00:00.000Z',
      llmProvider: 'ollama',
      sourceCounts: { 'seoul-culture': 1 },
    })
  })

  it('캐시 파일을 쓴다', async () => {
    const payload = {
      ...basePayload,
      cache: { KOP1: { updtDtText: '2026.08.01', detail: { a: 1 } } },
    }
    await emit(payload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('cache/visitseoul.json')).toMatchObject({
      KOP1: { updtDtText: '2026.08.01' },
    })
  })

  it('스키마에 안 맞는 항목이 있으면 던지고 파일을 쓰지 않는다', async () => {
    const bad = { ...basePayload, events: [{ ...event, id: 'bad:id' }] as EventItem[] }
    await expect(
      emit(bad, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') }),
    ).rejects.toThrow()
    await expect(readJson('events/2026-W33.json')).rejects.toThrow()
  })

  it('큐레이션 id가 이벤트 목록에 없으면 던진다', async () => {
    const bad = { ...basePayload, curated: [{ id: 'sc-없음', reason: 'x' }] }
    await expect(
      emit(bad, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') }),
    ).rejects.toThrow(/큐레이션/)
  })

  it('선정된 장소 id가 places에 없으면 던진다', async () => {
    const bad = { ...basePayload, curatedPlaces: ['vs-없음'] }
    await expect(
      emit(bad, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') }),
    ).rejects.toThrow(/장소/)
  })

  it('참조 무결성 위반이면 어떤 파일도 쓰지 않는다', async () => {
    // 검증은 전부 통과했더라도 참조가 깨지면 한 글자도 쓰면 안 된다.
    // 앞의 스키마 테스트는 events만 확인하므로 places.json/meta.json까지 본다.
    const bad = { ...basePayload, curated: [{ id: 'sc-없음', reason: 'x' }] }
    await expect(
      emit(bad, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') }),
    ).rejects.toThrow()
    for (const f of ['events/2026-W33.json', 'places.json', 'curated/2026-W33.json', 'meta.json']) {
      await expect(readJson(f)).rejects.toThrow()
    }
  })
})

describe('emit: 탐색 카탈로그', () => {
  const NOW = new Date('2026-08-13T00:00:00Z')

  it('catalog.json에 8주 행사의 전체 필드를 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: NOW })
    expect(await readJson('catalog.json')).toMatchObject({
      horizonEnd: '2026-10-26',
      items: [{ id: 'sc-a', source: 'seoul-culture' }], // source가 있다 = 전체 필드
    })
  })

  it('index.json에 슬림 항목을 쓰고 generatedAt은 meta.updatedAt과 같은 now다', async () => {
    await emit(basePayload, { dataDir: dir, now: NOW })
    const index = await readJson('index.json')
    expect(index.generatedAt).toBe('2026-08-13T00:00:00.000Z')
    expect(index.items).toHaveLength(2) // 행사 1 + 장소 1
    expect(index.items[0]).not.toHaveProperty('source') // 슬림이다
  })

  it('meta에 이상치 건수와 미매핑 카테고리를 남긴다 — 실패를 숨기지 않는다', async () => {
    await emit(basePayload, { dataDir: dir, now: NOW })
    expect(await readJson('meta.json')).toMatchObject({
      anomalies: 1,
      unmappedCategories: ['수수께끼분류'],
    })
  })

  it('카탈로그에 스키마 위반이 있으면 어떤 파일도 쓰지 않는다', async () => {
    const bad = {
      ...basePayload,
      catalog: { ...basePayload.catalog, events: [{ ...event, id: 'bad:id' }] as EventItem[] },
    }
    await expect(emit(bad, { dataDir: dir, now: NOW })).rejects.toThrow()
    for (const f of ['events/2026-W33.json', 'places.json', 'catalog.json', 'index.json', 'meta.json']) {
      await expect(readJson(f)).rejects.toThrow()
    }
  })
})
