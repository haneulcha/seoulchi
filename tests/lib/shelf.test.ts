import { describe, expect, it } from 'vitest'
import { pickShelf, shelfBonusKm, ZONES } from '~/lib/shelf'
import type { CatalogEventIndexItem } from '~/types/files'

const today = '2026-11-04'
let n = 0
const ev = (o: Partial<CatalogEventIndexItem> = {}): CatalogEventIndexItem => ({
  id: `e${++n}`, kind: 'event', title: 't', group: 'culture', place: `p${n}`, imageUrl: 'https://img/x.jpg',
  startDate: '2026-09-01', endDate: '2026-12-31', ...o,
}) as CatalogEventIndexItem
const origin = { lat: 37.5, lng: 127 }
// 위도 0.009도 ≈ 1km
const at = (km: number) => ({ lat: 37.5 + km * 0.009, lng: 127 })

describe('shelfBonusKm', () => {
  it('가산점: 무료 1.5, 2만 원 이하 1, 동네 0.5, 신선도 1, 가격 미상 0', () => {
    expect(shelfBonusKm(ev({ minPrice: 0 }), today)).toBe(1.5)
    expect(shelfBonusKm(ev({ isFree: true }), today)).toBe(1.5)
    expect(shelfBonusKm(ev({ minPrice: 20000 }), today)).toBe(1)
    expect(shelfBonusKm(ev({ minPrice: 20001 }), today)).toBe(0)
    expect(shelfBonusKm(ev({}), today)).toBe(0)
    expect(shelfBonusKm(ev({ localVenue: true }), today)).toBe(0.5)
    expect(shelfBonusKm(ev({ startDate: '2026-11-01' }), today)).toBe(1)
    expect(shelfBonusKm(ev({ endDate: '2026-11-07' }), today)).toBe(1)
    expect(shelfBonusKm(ev({ endDate: '2026-11-07', openRun: true }), today)).toBe(0)
  })
})

describe('pickShelf', () => {
  it('후보는 오늘~이번 주말에 하루라도 갈 수 있는 행사', () => {
    const ok = ev({ ...at(1) })
    const past = ev({ ...at(1), endDate: '2026-11-03' })
    const later = ev({ ...at(1), startDate: '2026-11-09' })
    expect(pickShelf([past, later, ok], today, origin)).toEqual([ok])
  })
  it('위치가 있으면 km - 가산점 순', () => {
    const paid = ev({ ...at(1), minPrice: 50000 })
    const free = ev({ ...at(2), minPrice: 0 })
    expect(pickShelf([paid, free], today, origin)).toEqual([free, paid])
  })
  it('같은 장소는 1장', () => {
    const a = ev({ ...at(1), place: 'X' })
    const b = ev({ ...at(2), place: 'X' })
    expect(pickShelf([b, a], today, origin)).toEqual([a])
  })
  it('좌표가 소수 셋째 자리까지 같으면 장소 이름이 달라도 1장', () => {
    const a = ev({ lat: 37.58, lng: 126.83, place: '서울식물원' })
    const b = ev({ lat: 37.5801, lng: 126.8302, place: '서울식물원 온실' })
    expect(pickShelf([a, b], today, origin)).toHaveLength(1)
  })
  it('포스터 없는 행사는 빠진다', () => {
    const noImage = ev({ ...at(1), imageUrl: undefined })
    const withImage = ev({ ...at(2) })
    expect(pickShelf([noImage, withImage], today, origin)).toEqual([withImage])
    expect(pickShelf([ev({ district: ZONES[0]!.districts[0], imageUrl: undefined })], today)).toEqual([])
  })
  it('좌표 없는 행사는 뒤로', () => {
    const none = ev({ minPrice: 0 })
    const near = ev({ ...at(9) })
    expect(pickShelf([none, near], today, origin)).toEqual([near, none])
  })
  it('위치가 없으면 생활권당 1장, 점수순 앞 3개 생활권', () => {
    const d = (i: number) => ZONES[i]!.districts[0]
    const z0 = ev({ district: d(0) })
    const z0b = ev({ district: d(0), minPrice: 0 })
    const z1 = ev({ district: d(1), minPrice: 20000 })
    const z2 = ev({ district: d(2), localVenue: true })
    const z3 = ev({ district: d(3) })
    const z4 = ev({ district: d(4) })
    const got = pickShelf([z0, z0b, z1, z2, z3, z4], today)
    expect(got).toEqual([z0b, z1, z2])
  })
  it('위치가 없으면 자치구 없는 행사는 빠진다', () => {
    expect(pickShelf([ev({}), ev({ district: '없는구' })], today)).toEqual([])
  })
  it('날짜가 바뀌면 결과가 바뀐다 — 같은 날은 같다', () => {
    // 두 행사 모두 두 날짜에 후보로 남고, 신선도 가산점만 뒤집힌다
    const a = ev({ ...at(1), startDate: '2026-11-04', endDate: '2026-11-30' })
    const b = ev({ ...at(1.2), endDate: '2026-11-09' })
    const items = [a, b]
    expect(pickShelf(items, today, origin)).toEqual(pickShelf(items, today, origin))
    expect(pickShelf(items, today, origin)).toEqual([a, b])
    expect(pickShelf(items, '2026-11-08', origin)).toEqual([b, a])
  })
})
