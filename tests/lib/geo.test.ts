import { describe, expect, it } from 'vitest'
import { haversineKm } from '~/lib/geo'

const seoulCityHall = { lat: 37.5663, lng: 126.9779 }
const gangnamStation = { lat: 37.4979, lng: 127.0276 }

describe('haversineKm', () => {
  it('같은 지점은 0이다', () => {
    expect(haversineKm(seoulCityHall, seoulCityHall)).toBe(0)
  })

  it('시청~강남역은 약 8.8km다', () => {
    expect(haversineKm(seoulCityHall, gangnamStation)).toBeCloseTo(8.8, 0)
  })

  it('대칭이다', () => {
    expect(haversineKm(seoulCityHall, gangnamStation)).toBeCloseTo(
      haversineKm(gangnamStation, seoulCityHall),
      6,
    )
  })
})
