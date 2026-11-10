import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { className, parseDesignTokens } from '~/lib/design-tokens'

const SPACING = /^-?(?:m[trblxyse]?|p[trblxyse]?|gap(?:-[xy])?|space-[xy]|scroll-[mp][trblxyse]?)-(\d[\d.]*|\[.*\])$/
const OFF = [
  /^text-(?:xs|sm|base|lg|[2-9]?xl)$/,
  /^font-(?:thin|extralight|light|normal|semibold|extrabold|black)$/,
  /^leading-/,
  /^rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:none|xs|sm|md|lg|xl|[2-4]xl))?$/,
]

/** 클래스처럼 생긴 토큰 중 DESIGN.md 시스템 밖의 것. 변형 접두사(md:, [&.active]:)는 떼고 본다 */
function offFoundation(source: string, spacingNames: Set<string>): string[] {
  return source.split(/[\s"'`{}()]+/).filter((raw) => {
    const cls = raw.slice(raw.lastIndexOf(':') + 1)
    const spacing = SPACING.exec(cls)
    if (spacing) return !spacingNames.has(spacing[1]!)
    return OFF.some((re) => re.test(cls))
  })
}

const tokens = readFileSync('src/styles/foundation.css', 'utf8')
const spacingNames = new Set([...tokens.matchAll(/--spacing-([\w]+):/g)].map((m) => m[1]!))

// 템플릿 조각(`text-on-${r}`)은 끝이 [\w-]가 아니라 걸리지 않는다 — 문자열로는 판정할 수 없다
const COLOR = /^(?:bg|text|border|divide|outline|ring|fill|stroke|decoration|shadow|placeholder|caret)-(?:accent|neutral|danger|warning|success|info|on-|base|ink|surface|error|orange|gray|red|yellow|green|blue)[\w-]*$/

/** 색 역할·옛 이름·원시 hue로 시작하는데 시맨틱 토큰에 없는 클래스. 정의가 없으면 Tailwind가 조용히 버린다 */
function offColor(source: string, known: Set<string>): string[] {
  return source.split(/[\s"'`{}()]+/).filter((raw) => {
    const cls = raw.slice(raw.lastIndexOf(':') + 1).replace(/\/.*$/, '')
    return COLOR.test(cls) && !known.has(cls.replace(/^divide-/, 'border-'))
  })
}

const parsed = parseDesignTokens(readFileSync('src/styles/theme.css', 'utf8'), tokens)
const known = new Set(parsed.semantics.map(className))

const TEXT_ROLE = /^text-(?:display|heading|title|body|label|caption)(?:-[\w-]+)?$/
const textNames = new Set([...parsed.text.map((x) => `text-${x.name}`), ...parsed.textScale.map((x) => `text-${x.name}`)])

/** 글자 역할 범주·옛 이름으로 시작하는데 역할·원시에 없는 클래스. 정의가 없으면 Tailwind가 조용히 버린다 */
function offText(source: string, names: Set<string>): string[] {
  return source.split(/[\s"'`{}()]+/).filter((raw) => {
    const cls = raw.slice(raw.lastIndexOf(':') + 1)
    return TEXT_ROLE.test(cls) && !names.has(cls)
  })
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

describe('offFoundation', () => {
  it('숫자 여백, 꺼진 글자·굵기·모서리 클래스를 잡는다', () => {
    const found = offFoundation('mt-3 md:px-6 -mx-4 gap-x-6 space-y-2 py-1.5 mt-[13px] text-sm font-semibold leading-6 rounded rounded-lg rounded-t-xl', spacingNames)
    expect(found).toEqual(['mt-3', 'md:px-6', '-mx-4', 'gap-x-6', 'space-y-2', 'py-1.5', 'mt-[13px]', 'text-sm', 'font-semibold', 'leading-6', 'rounded', 'rounded-lg', 'rounded-t-xl'])
  })

  it('토큰 이름과 시스템과 무관한 클래스는 통과한다', () => {
    const ok = 'mt-100 mt-0 -mx-gutter gap-gutter py-page mt-section -mb-px w-14 h-4 text-neutral text-title-l text-100 font-medium text-center rounded-100 rounded-full font-sans'
    expect(offFoundation(ok, spacingNames)).toEqual([])
  })
})

describe('offColor', () => {
  it('정의된 시맨틱 클래스와 색 아닌 클래스는 통과한다', () => {
    expect(offColor('bg-base text-neutral-muted md:border-danger [&.active]:border-neutral-solid bg-neutral-solid/50 divide-neutral text-body-s text-center border-b-2', known)).toEqual([])
  })

  it('옛 이름, 없는 단계, 원시 hue를 잡는다', () => {
    const src = 'text-ink bg-surface text-danger-muted bg-orange-500 [&.active]:border-ink border-neutral-border bg-ink/50 focus-visible:outline-neutral-solid ring-danger'
    expect(offColor(src, known)).toEqual(['text-ink', 'bg-surface', 'text-danger-muted', 'bg-orange-500', '[&.active]:border-ink', 'border-neutral-border', 'bg-ink/50', 'focus-visible:outline-neutral-solid', 'ring-danger'])
  })
})

describe('offText', () => {
  it('없는 글자 역할을 잡는다', () => {
    expect(offText('text-caption text-title-row md:text-title-page text-body-s text-heading-l text-center', textNames))
      .toEqual(['text-caption', 'text-title-row', 'md:text-title-page'])
  })
})

describe('src', () => {
  it.each(sources('src'))('%s는 정의되지 않은 글자 역할을 쓰지 않는다', (file) => {
    expect(offText(readFileSync(file, 'utf8'), textNames)).toEqual([])
  })

  it.each(sources('src'))('%s는 정의되지 않은 색 클래스를 쓰지 않는다', (file) => {
    expect(offColor(readFileSync(file, 'utf8'), known)).toEqual([])
  })

  it.each(sources('src'))('%s는 토큰 밖 간격·글자·모서리를 쓰지 않는다', (file) => {
    expect(offFoundation(readFileSync(file, 'utf8'), spacingNames)).toEqual([])
  })
})
