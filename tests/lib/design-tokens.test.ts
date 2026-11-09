import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { className, contrastPairs, contrastRatio, lightVars, parseDesignTokens } from '~/lib/design-tokens'

const themeCss = readFileSync('src/styles/theme.css', 'utf8')
const foundationCss = readFileSync('src/styles/foundation.css', 'utf8')
const t = parseDesignTokens(themeCss, foundationCss)
const sem = (cls: string) => t.semantics.find((s) => className(s) === cls)!

describe('parseDesignTokens — 색', () => {
  it('원시 색 66개를 hue 순서로 읽는다', () => {
    expect(t.primitives).toHaveLength(66)
    expect(t.primitives[0]).toEqual({ name: 'orange-50', hue: 'orange', value: '#fff6ee' })
    expect([...new Set(t.primitives.map((p) => p.hue))]).toEqual(['orange', 'gray', 'red', 'yellow', 'green', 'blue'])
    expect(t.primitives.filter((p) => /^(accent|neutral|error|warning|success|info)-/.test(p.name))).toEqual([])
  })

  it('시맨틱 50개는 바탕 19, 글자 19, 선 12이고 클래스 이름이 겹치지 않는다', () => {
    expect(t.semantics).toHaveLength(50)
    const count = (p: string) => t.semantics.filter((s) => s.property === p).length
    expect([count('background'), count('text'), count('border')]).toEqual([19, 19, 12])
    expect(new Set(t.semantics.map(className)).size).toBe(50)
  })

  it('별칭을 hex까지 풀고, 다크 재선언과 가리키는 원시 색을 함께 준다', () => {
    expect(sem('text-danger')).toMatchObject({
      role: 'danger',
      value: { light: '#98010e', dark: '#ffa8a8' },
      ref: { light: 'red-800', dark: 'red-300' },
    })
  })

  it('다크 재선언이 없으면 라이트 값을 그대로 쓴다', () => {
    expect(sem('bg-accent-solid').value).toEqual({ light: '#fa9216', dark: '#fa9216' })
    expect(sem('border-accent-solid').value).toEqual({ light: '#d27800', dark: '#d27800' })
  })

  it('neutral-solid와 on-neutral은 다크에서 뒤집힌다', () => {
    expect(sem('bg-neutral-solid').value).toEqual({ light: '#18181c', dark: '#f4f4f5' })
    expect(sem('text-on-neutral').value).toEqual({ light: '#ffffff', dark: '#09080b' })
    expect(sem('border-neutral-solid').value).toEqual(sem('bg-neutral-solid').value)
  })

  it('base와 neutral 글자는 neutral 역할이다', () => {
    expect(sem('text-neutral-subtle')).toMatchObject({ role: 'neutral', value: { light: '#71717c', dark: '#9f9fa9' } })
    expect(sem('bg-base').role).toBe('neutral')
  })

  it('역할은 정확히 6개다 — 오타 난 역할은 플레이그라운드 고정 목록에서 조용히 빠진다', () => {
    expect(new Set(t.semantics.map((s) => s.role))).toEqual(new Set(['accent', 'neutral', 'danger', 'warning', 'success', 'info']))
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

  it.each(['light', 'dark'] as const)('%s 29쌍이 모두 4.5 이상', (theme) => {
    const pairs = contrastPairs(t, theme)
    expect(pairs).toHaveLength(29)
    expect(pairs.filter((p) => p.ratio < 4.5)).toEqual([])
    expect(pairs).toContainEqual(expect.objectContaining({ fg: 'text-neutral-subtle', bg: 'bg-base' }))
    expect(pairs).toContainEqual(expect.objectContaining({ fg: 'text-on-neutral', bg: 'bg-neutral-solid' }))
  })
})

describe('lightVars', () => {
  it('.dark가 재선언하는 시맨틱 전부를 라이트 값으로', () => {
    const dark = /\.dark\s*\{([^}]*)\}/.exec(themeCss)![1]!
    const declared = [...dark.matchAll(/(--[\w-]+-color-[\w-]+):/g)].map((m) => m[1]!)
    const vars = lightVars(t)
    expect(declared).toHaveLength(35)
    expect(Object.keys(vars).sort()).toEqual(declared.sort())
    expect(vars['--background-color-base']).toBe('#ffffff')
  })
})
