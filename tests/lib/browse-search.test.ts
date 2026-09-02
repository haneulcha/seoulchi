import { describe, expect, it } from 'vitest'
import { browseSearchSchema, CHIP_GROUPS, toBrowseFilters } from '~/lib/browse-search'

describe('browseSearchSchema', () => {
  it('유효한 조합을 그대로 통과시킨다 (왕복)', () => {
    const search = {
      group: '공연' as const, district: '마포구', free: true as const, open: true as const, near: true as const,
    }
    expect(browseSearchSchema.parse(search)).toEqual(search)
  })

  it('빈 search는 빈 객체다 — 기본 상태에 파라미터를 쓰지 않는다', () => {
    expect(browseSearchSchema.parse({})).toEqual({})
  })

  it('잘못된 group은 던지지 않고 버린다 — 손으로 고친 URL이 화면을 깨면 안 된다', () => {
    expect(browseSearchSchema.parse({ group: '없는그룹' })).toEqual({})
  })

  it('기타는 칩 밖이므로 group 값으로도 받지 않는다', () => {
    expect(browseSearchSchema.parse({ group: '기타' })).toEqual({})
    expect(CHIP_GROUPS).not.toContain('기타')
  })

  it('false·이상한 타입의 토글은 버린다 — 켜짐만 URL에 남는다', () => {
    expect(browseSearchSchema.parse({ free: false })).toEqual({})
    expect(browseSearchSchema.parse({ open: 'yes' })).toEqual({})
    expect(browseSearchSchema.parse({ near: 1 })).toEqual({})
  })

  it('빈 문자열 district는 버린다', () => {
    expect(browseSearchSchema.parse({ district: '' })).toEqual({})
  })
})

describe('toBrowseFilters', () => {
  it('search를 BrowseFilters로 옮긴다 — near는 필터가 아니라 정렬이라 빠진다', () => {
    expect(
      toBrowseFilters({ group: '전시', district: '중구', free: true, open: true, near: true }),
    ).toEqual({ group: '전시', district: '중구', free: true, open: true })
  })

  it('빈 search는 빈 필터다', () => {
    expect(toBrowseFilters({})).toEqual({ group: undefined, district: undefined, free: undefined, open: undefined })
  })
})
