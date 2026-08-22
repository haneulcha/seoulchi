import { describe, expect, it } from 'vitest'
import {
  nextTheme,
  parseTheme,
  resolveDark,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  themeLabel,
} from '~/lib/theme'

describe('parseTheme', () => {
  it('저장된 값이 없으면 system', () => {
    expect(parseTheme(null)).toBe('system')
  })

  it('모르는 값은 system으로 떨어진다 — 손으로 고친 localStorage가 앱을 깨지 않는다', () => {
    expect(parseTheme('purple')).toBe('system')
  })

  it('아는 값은 그대로 통과', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('system')).toBe('system')
  })
})

describe('nextTheme', () => {
  it('system → light → dark → system으로 순환한다', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })
})

describe('resolveDark', () => {
  it('명시된 테마는 시스템 설정을 무시한다', () => {
    expect(resolveDark('dark', false)).toBe(true)
    expect(resolveDark('light', true)).toBe(false)
  })

  it('system이면 시스템 설정을 따른다', () => {
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
  })
})

describe('themeLabel', () => {
  it('세 상태 모두 사람 말로 나온다', () => {
    expect(themeLabel('system')).toBe('시스템')
    expect(themeLabel('light')).toBe('라이트')
    expect(themeLabel('dark')).toBe('다크')
  })
})

/**
 * 인라인 스크립트는 <head>에서 첫 페인트 전에 도는 별개의 코드라 lib을 import할 수 없다.
 * 규칙이 갈라지면 깜빡임 대신 "틀린 테마가 뜨는" 더 나쁜 버그가 되므로,
 * 문자열을 실제로 실행해서 resolveDark와 같은 답을 내는지 확인한다.
 */
describe('THEME_INIT_SCRIPT', () => {
  /** 스크립트가 참조하는 브라우저 전역만 주입해 실행하고, .dark가 켜졌는지 돌려준다 */
  function run(stored: string | null, prefersDark: boolean): boolean {
    let dark = false
    const localStorage = { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) }
    const matchMedia = (q: string) => ({ matches: q.includes('dark') ? prefersDark : false })
    const document = {
      documentElement: {
        classList: {
          toggle: (name: string, on: boolean) => {
            if (name === 'dark') dark = on
          },
        },
      },
    }
    new Function('localStorage', 'matchMedia', 'document', THEME_INIT_SCRIPT)(
      localStorage,
      matchMedia,
      document,
    )
    return dark
  }

  const cases: Array<[string | null, boolean]> = [
    [null, true],
    [null, false],
    ['system', true],
    ['system', false],
    ['light', true],
    ['light', false],
    ['dark', true],
    ['dark', false],
    ['purple', true],
    ['purple', false],
  ]

  it.each(cases)('저장값 %s · 시스템 다크 %s에서 resolveDark와 답이 같다', (stored, prefersDark) => {
    expect(run(stored, prefersDark)).toBe(resolveDark(parseTheme(stored), prefersDark))
  })

  it('localStorage가 막혀 있어도 던지지 않는다 — 사파리 프라이빗에서 앱 전체가 죽으면 안 된다', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    const matchMedia = () => ({ matches: false })
    const document = { documentElement: { classList: { toggle: () => {} } } }
    expect(() =>
      new Function('localStorage', 'matchMedia', 'document', THEME_INIT_SCRIPT)(
        blocked,
        matchMedia,
        document,
      ),
    ).not.toThrow()
  })
})
