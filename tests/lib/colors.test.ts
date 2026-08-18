import { describe, expect, it } from 'vitest'
import { categoryColor } from '~/lib/colors'

describe('categoryColor', () => {
  it('같은 카테고리는 항상 같은 색이다 (결정론)', () => {
    expect(categoryColor('전시/미술')).toBe(categoryColor('전시/미술'))
  })

  it('hex 색을 반환한다', () => {
    expect(categoryColor('전시/미술')).toMatch(/^#[0-9a-f]{6}$/)
    expect(categoryColor('축제')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('빈 문자열도 색을 준다 (category는 필수지만 방어)', () => {
    expect(categoryColor('')).toMatch(/^#[0-9a-f]{6}$/)
  })
})
