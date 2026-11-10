/**
 * theme.css·foundation.css 원문을 토큰 모델로 바꾼다. 플레이그라운드(/playground)와 색 가드 테스트의 입력이다 —
 * 표에 나오는 이름·값·순서는 전부 여기서 나오고, 손으로 옮긴 값이 없다.
 */

export type Theme = 'light' | 'dark'
export type ColorProperty = 'background' | 'text' | 'border'
export const CLASS_PREFIX: Record<ColorProperty, string> = { background: 'bg', text: 'text', border: 'border' }
export type Primitive = { name: string; hue: string; value: string }
export type Semantic = {
  name: string
  property: ColorProperty
  role: string
  value: Record<Theme, string>
  ref: Partial<Record<Theme, string>>
}
export type LengthToken = { name: string; value: string; at: Array<{ minWidth: string; value: string }> }
export type TextScale = { name: string; size: string; lineHeight: string }
export type FontWeight = { name: string; value: string }
export type TextToken = {
  name: string; size: string; lineHeight: string; weight: string; sizeRef: string; weightRef: string
  at: Array<{ minWidth: string; size: string; lineHeight: string }>
}
export type DesignTokens = {
  primitives: Primitive[]; semantics: Semantic[]; spacing: LengthToken[]; radius: LengthToken[]
  textScale: TextScale[]; fontWeight: FontWeight[]; text: TextToken[]; fontSans: string
}

export const className = (s: Semantic) => `${CLASS_PREFIX[s.property]}-${s.name}`
export const cssVar = (s: Semantic) => `--${s.property}-color-${s.name}`

type Decls = Map<string, string>

function block(css: string, re: RegExp): string {
  const m = re.exec(css)
  if (!m) throw new Error(`블록을 찾지 못했습니다: ${re}`)
  return m[1]!
}

/** `--x-*: initial` 같은 와일드카드는 이름 패턴에 안 걸려 빠진다 */
function decls(body: string): Decls {
  return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

function resolve(value: string, base: Decls): string {
  return value.replace(/var\(--([\w-]+)\)/g, (_, name: string) => {
    const v = base.get(name)
    if (v === undefined) throw new Error(`정의되지 않은 변수: --${name}`)
    return resolve(v, base)
  })
}

const refOf = (raw: string) => /^var\(--([a-z]+-\d+)\)$/.exec(raw)?.[1]

const roleOf = (name: string) => (name === 'base' ? 'neutral' : name.replace(/^on-/, '').split('-')[0]!)

export function parseDesignTokens(themeCss: string, foundationCss: string): DesignTokens {
  const prim = decls(block(themeCss, /:root\s*\{([^}]*)\}/))
  const light = decls(block(themeCss, /@theme static\s*\{([\s\S]*?)\n\}/))
  const dark = decls(block(themeCss, /\.dark\s*\{([^}]*)\}/))
  const base = decls(block(foundationCss, /@theme\s*\{([\s\S]*?)\n\}/))
  const media = [...foundationCss.matchAll(/@media\s*\(width\s*>=\s*([^)]+)\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/g)]
    .map((m) => ({ minWidth: m[1]!.trim(), decls: decls(m[2]!) }))
  // 미디어 쿼리 안의 별칭도 기본 스케일(@theme)을 가리킨다
  const all: Decls = new Map([...prim, ...light, ...base])

  const primitives = [...prim].map(([name, value]): Primitive => ({ name, hue: name.replace(/-\d+$/, ''), value }))

  const semantics = [...light].flatMap(([key, rawLight]): Semantic[] => {
    const m = /^(background|text|border)-color-([\w-]+)$/.exec(key)
    if (!m) return []
    const name = m[2]!
    const rawDark = dark.get(key) ?? rawLight
    const ref: Semantic['ref'] = {}
    const refLight = refOf(rawLight)
    const refDark = refOf(rawDark)
    if (refLight) ref.light = refLight
    if (refDark) ref.dark = refDark
    return [{
      name, property: m[1] as ColorProperty, role: roleOf(name),
      value: { light: resolve(rawLight, all), dark: resolve(rawDark, all) },
      ref,
    }]
  })

  const lengths = (prefix: string): LengthToken[] =>
    [...base.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({
      name: k.slice(prefix.length),
      value: resolve(base.get(k)!, all),
      at: media.flatMap((m) => (m.decls.has(k) ? [{ minWidth: m.minWidth, value: resolve(m.decls.get(k)!, all) }] : [])),
    }))

  const textKeys = [...base.keys()].filter((k) => /^text-[\w-]+$/.test(k) && !k.includes('--'))
  const textScale = textKeys.filter((k) => /^text-\d+$/.test(k)).map((k): TextScale => ({
    name: k.slice('text-'.length), size: base.get(k)!, lineHeight: base.get(`${k}--line-height`)!,
  }))
  const fontWeight = [...base.keys()].filter((k) => k.startsWith('font-weight-'))
    .map((k): FontWeight => ({ name: k.slice('font-weight-'.length), value: base.get(k)! }))

  const text = textKeys.filter((k) => !/^text-\d+$/.test(k)).map((k): TextToken => {
    const size = resolve(base.get(k)!, all)
    const lineHeight = resolve(base.get(`${k}--line-height`)!, all)
    const rawWeight = base.get(`${k}--font-weight`)!
    return {
      name: k.slice('text-'.length), size, lineHeight, weight: resolve(rawWeight, all),
      sizeRef: /^var\(--text-(\d+)\)$/.exec(base.get(k)!)![1]!,
      weightRef: /^var\(--font-weight-(\w+)\)$/.exec(rawWeight)![1]!,
      at: media.flatMap((m) =>
        m.decls.has(k) || m.decls.has(`${k}--line-height`)
          ? [{ minWidth: m.minWidth, size: resolve(m.decls.get(k) ?? size, all), lineHeight: resolve(m.decls.get(`${k}--line-height`) ?? lineHeight, all) }]
          : []),
    }
  })

  return { primitives, semantics, spacing: lengths('spacing-'), radius: lengths('radius-'), textScale, fontWeight, text, fontSans: base.get('font-sans')! }
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 0xff, n & 0xff].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** DESIGN.md "대비" 장의 검사 쌍. 글자 역할을 그 역할이 놓이는 바탕 위에서 잰다 */
export function contrastPairs(tokens: DesignTokens, theme: Theme): Array<{ fg: string; bg: string; ratio: number }> {
  const hex = new Map(tokens.semantics.map((s) => [className(s), s.value[theme]]))
  const roles = [...new Set(tokens.semantics.map((s) => s.role))].filter((r) => r !== 'neutral')
  const pairs: Array<[string, string]> = [
    ...roles.flatMap((r): Array<[string, string]> => [
      [`text-${r}`, 'bg-base'], [`text-${r}`, `bg-${r}-subtle`], [`text-${r}`, `bg-${r}-subtle-hover`],
      [`text-${r}-strong`, `bg-${r}-subtle`], [`text-on-${r}`, `bg-${r}-solid`],
    ]),
    ['text-neutral', 'bg-base'], ['text-neutral-muted', 'bg-base'], ['text-neutral-subtle', 'bg-base'],
    ['text-on-neutral', 'bg-neutral-solid'],
  ]
  return pairs.map(([fg, bg]) => ({ fg, bg, ratio: contrastRatio(hex.get(fg)!, hex.get(bg)!) }))
}

/**
 * 페이지가 다크일 때 라이트 칸을 되돌리는 변수 묶음. .dark를 무르는 선택자가 없으므로
 * 다크에서 값이 바뀌는 이름(= .dark가 재선언하는 이름)만 라이트 값으로 다시 선언한다(스펙 7장)
 */
export function lightVars(tokens: DesignTokens): Record<string, string> {
  return Object.fromEntries(
    tokens.semantics.filter((s) => s.value.light !== s.value.dark).map((s) => [cssVar(s), s.value.light]),
  )
}
