/**
 * theme.css·foundation.css 원문을 토큰 모델로 바꾼다. 플레이그라운드(/playground)의 유일한 입력이다 —
 * 표에 나오는 이름·값·순서는 전부 여기서 나오고, 손으로 옮긴 값이 없다.
 */

export type Theme = 'light' | 'dark'
export type ColorToken = {
  name: string
  kind: 'primitive' | 'role' | 'surface'
  scale?: string
  value: Record<Theme, string>
  ref: Partial<Record<Theme, string>>
}
export type LengthToken = { name: string; value: string; at: Array<{ minWidth: string; value: string }> }
export type TextToken = {
  name: string; size: string; lineHeight: string; weight: string
  at: Array<{ minWidth: string; size: string; lineHeight: string }>
}
export type DesignTokens = {
  colors: ColorToken[]; spacing: LengthToken[]; radius: LengthToken[]; text: TextToken[]; fontSans: string
}

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

const refOf = (raw: string) => /^var\(--color-([\w-]+)\)$/.exec(raw)?.[1]

const NOT_SYSTEM = new Set(['white', 'black', 'transparent', 'current'])

export function parseDesignTokens(themeCss: string, foundationCss: string): DesignTokens {
  const light = decls(block(themeCss, /@theme static\s*\{([\s\S]*?)\n\}/))
  const dark = decls(block(themeCss, /\.dark\s*\{([^}]*)\}/))
  const base = decls(block(foundationCss, /@theme\s*\{([\s\S]*?)\n\}/))
  const media = [...foundationCss.matchAll(/@media\s*\(width\s*>=\s*([^)]+)\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/g)]
    .map((m) => ({ minWidth: m[1]!.trim(), decls: decls(m[2]!) }))
  // 미디어 쿼리 안의 별칭도 기본 스케일(@theme)을 가리킨다
  const all: Decls = new Map([...light, ...base])

  const names = [...light.keys()].filter((k) => k.startsWith('color-')).map((k) => k.slice('color-'.length))
  const scales = new Set(names.map((n) => /^([a-z]+)-\d+$/.exec(n)?.[1]).filter((s): s is string => !!s))
  const colors = names.filter((n) => !NOT_SYSTEM.has(n)).map((name): ColorToken => {
    const rawLight = light.get(`color-${name}`)!
    const rawDark = dark.get(`color-${name}`) ?? rawLight
    const scale = name.split('-')[0]!
    const kind = !scales.has(scale) ? 'surface' : /-\d+$/.test(name) ? 'primitive' : 'role'
    const ref: ColorToken['ref'] = {}
    const refLight = refOf(rawLight)
    const refDark = refOf(rawDark)
    if (refLight) ref.light = refLight
    if (refDark) ref.dark = refDark
    return {
      name, kind, ...(kind !== 'surface' && { scale }),
      value: { light: resolve(rawLight, all), dark: resolve(rawDark, all) },
      ref,
    }
  })

  const lengths = (prefix: string): LengthToken[] =>
    [...base.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({
      name: k.slice(prefix.length),
      value: resolve(base.get(k)!, all),
      at: media.flatMap((m) => (m.decls.has(k) ? [{ minWidth: m.minWidth, value: resolve(m.decls.get(k)!, all) }] : [])),
    }))

  const text = [...base.keys()].filter((k) => /^text-[\w-]+$/.test(k) && !k.includes('--')).map((k): TextToken => {
    const size = base.get(k)!
    const lineHeight = base.get(`${k}--line-height`)!
    return {
      name: k.slice('text-'.length), size, lineHeight, weight: base.get(`${k}--font-weight`)!,
      at: media.flatMap((m) =>
        m.decls.has(k) || m.decls.has(`${k}--line-height`)
          ? [{ minWidth: m.minWidth, size: m.decls.get(k) ?? size, lineHeight: m.decls.get(`${k}--line-height`) ?? lineHeight }]
          : []),
    }
  })

  return { colors, spacing: lengths('spacing-'), radius: lengths('radius-'), text, fontSans: base.get('font-sans')! }
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
  const hex = new Map(tokens.colors.map((c) => [c.name, c.value[theme]]))
  const scales = [...new Set(tokens.colors.flatMap((c) => (c.kind === 'role' ? [c.scale!] : [])))]
  const pairs: Array<[string, string]> = [
    ...scales.flatMap((s): Array<[string, string]> => [
      [`${s}-text`, 'surface'], [`${s}-text`, `${s}-subtle-bg`], [`${s}-text`, `${s}-hover-bg`],
      [`${s}-text-strong`, `${s}-subtle-bg`], [`${s}-on-solid`, `${s}-solid`],
    ]),
    ['ink', 'surface'], ['ink-muted', 'surface'], ['ink-subtle', 'surface'],
  ]
  return pairs.map(([fg, bg]) => ({ fg, bg, ratio: contrastRatio(hex.get(fg)!, hex.get(bg)!) }))
}

/**
 * 페이지가 다크일 때 라이트 칸을 되돌리는 변수 묶음. .dark를 무르는 선택자가 없으므로
 * 다크에서 값이 바뀌는 이름(= .dark가 재선언하는 이름)만 라이트 값으로 다시 선언한다(스펙 7장)
 */
export function lightVars(tokens: DesignTokens): Record<string, string> {
  return Object.fromEntries(
    tokens.colors.filter((c) => c.value.light !== c.value.dark).map((c) => [`--color-${c.name}`, c.value.light]),
  )
}
