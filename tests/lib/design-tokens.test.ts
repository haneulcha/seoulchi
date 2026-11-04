import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastPairs, contrastRatio, lightVars, parseDesignTokens } from '~/lib/design-tokens'

const themeCss = readFileSync('src/styles/theme.css', 'utf8')
const foundationCss = readFileSync('src/styles/foundation.css', 'utf8')
const t = parseDesignTokens(themeCss, foundationCss)
const color = (name: string) => t.colors.find((c) => c.name === name)!

describe('parseDesignTokens — 색', () => {
  it('프리미티브 66 + 역할 42 + 표면 4를 원문 순서로 읽는다', () => {
    expect(t.colors).toHaveLength(112)
    expect(t.colors[0]!.name).toBe('accent-50')
    const kinds = t.colors.map((c) => c.kind)
    expect(kinds.filter((k) => k === 'primitive')).toHaveLength(66)
    expect(kinds.filter((k) => k === 'role')).toHaveLength(42)
    expect(kinds.filter((k) => k === 'surface')).toHaveLength(4)
    expect(t.colors.map((c) => c.name)).not.toContain('white')
  })

  it('별칭을 hex까지 풀고, 다크 재선언과 가리키는 이름을 함께 준다', () => {
    expect(color('accent-text')).toMatchObject({
      kind: 'role', scale: 'accent',
      value: { light: '#874c03', dark: '#ffc99b' },
      ref: { light: 'accent-800', dark: 'accent-300' },
    })
  })

  it('다크 재선언이 없는 역할은 라이트 값을 그대로 쓴다', () => {
    expect(color('accent-solid').value).toEqual({ light: '#d27800', dark: '#d27800' })
  })

  it('표면·잉크는 surface 종류다', () => {
    expect(color('ink-subtle')).toMatchObject({ kind: 'surface', value: { light: '#71717c', dark: '#9f9fa9' } })
    expect(color('ink-subtle').scale).toBeUndefined()
  })
})

describe('parseDesignTokens — 간격·글자·모서리', () => {
  it('간격은 원문 순서이고, 미디어 쿼리 재선언을 기본값으로 착각하지 않는다', () => {
    expect(t.spacing.map((s) => s.name)).toEqual([
      '0', '025', '050', '075', '100', '150', '200', '250', '300', '400', '500', '600', '700', '800', '1000',
      'gutter', 'section', 'page',
    ])
    const gutter = t.spacing.find((s) => s.name === 'gutter')!
    expect(gutter.value).toBe('1rem')
    expect(gutter.at).toEqual([{ minWidth: '40rem', value: '1.5rem' }, { minWidth: '64rem', value: '2rem' }])
    expect(t.spacing.find((s) => s.name === '100')!.at).toEqual([])
  })

  it('글자 역할 7개와 폭별 값', () => {
    expect(t.text).toHaveLength(7)
    const page = t.text.find((x) => x.name === 'title-page')!
    expect(page).toMatchObject({ size: '1.5rem', lineHeight: '2rem', weight: '700' })
    expect(page.at).toEqual([{ minWidth: '48rem', size: '1.875rem', lineHeight: '2.375rem' }])
    expect(t.text.find((x) => x.name === 'caption')).toEqual({
      name: 'caption', size: '0.75rem', lineHeight: '1rem', weight: '400', at: [],
    })
  })

  it('모서리 4개', () => {
    expect(t.radius.map((r) => r.name)).toEqual(['050', '100', '150', 'full'])
    expect(t.radius.find((r) => r.name === 'full')!.value).toBe('9999px')
  })

  it('글꼴', () => {
    expect(t.fontSans).toMatch(/^'Pretendard Variable'/)
  })
})

describe('대비', () => {
  it('WCAG 2 대비', () => {
    expect(Math.round(contrastRatio('#ffffff', '#71717c') * 100) / 100).toBe(4.82)
    expect(contrastRatio('#71717c', '#ffffff')).toBe(contrastRatio('#ffffff', '#71717c'))
  })

  it.each(['light', 'dark'] as const)('%s 33쌍이 모두 4.5 이상', (theme) => {
    const pairs = contrastPairs(t, theme)
    expect(pairs).toHaveLength(33)
    expect(pairs.filter((p) => p.ratio < 4.5)).toEqual([])
    expect(pairs).toContainEqual(expect.objectContaining({ fg: 'ink-subtle', bg: 'surface' }))
  })
})

describe('lightVars', () => {
  it('.dark가 재선언하는 이름 전부를 라이트 값으로', () => {
    const dark = /\.dark\s*\{([^}]*)\}/.exec(themeCss)![1]!
    const declared = [...dark.matchAll(/(--color-[\w-]+):/g)].map((m) => m[1]!)
    const vars = lightVars(t)
    expect(Object.keys(vars).sort()).toEqual(declared.sort())
    expect(vars['--color-surface']).toBe('#ffffff')
    expect(vars['--color-accent-text']).toBe('#874c03')
  })
})
