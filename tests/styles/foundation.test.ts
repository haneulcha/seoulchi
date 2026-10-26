import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SPACING = /^-?(?:m[trblxyse]?|p[trblxyse]?|gap(?:-[xy])?|space-[xy]|scroll-[mp][trblxyse]?)-(\d[\d.]*|\[.*\])$/
const OFF = [
  /^text-(?:xs|sm|base|lg|[2-9]?xl)$/,
  /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
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

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

describe('offFoundation', () => {
  it('숫자 여백, 꺼진 글자·굵기·모서리 클래스를 잡는다', () => {
    const found = offFoundation('mt-3 md:px-6 -mx-4 gap-x-6 space-y-2 py-1.5 mt-[13px] text-sm font-bold leading-6 rounded rounded-lg rounded-t-xl', spacingNames)
    expect(found).toEqual(['mt-3', 'md:px-6', '-mx-4', 'gap-x-6', 'space-y-2', 'py-1.5', 'mt-[13px]', 'text-sm', 'font-bold', 'leading-6', 'rounded', 'rounded-lg', 'rounded-t-xl'])
  })

  it('토큰 이름과 시스템과 무관한 클래스는 통과한다', () => {
    const ok = 'mt-100 mt-0 -mx-gutter gap-gutter py-page mt-section -mb-px w-14 h-4 text-ink text-title-card text-center rounded-100 rounded-full font-sans'
    expect(offFoundation(ok, spacingNames)).toEqual([])
  })
})

describe('src', () => {
  it.each(sources('src'))('%s는 토큰 밖 간격·글자·모서리를 쓰지 않는다', (file) => {
    expect(offFoundation(readFileSync(file, 'utf8'), spacingNames)).toEqual([])
  })
})
