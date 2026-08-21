/**
 * 테마는 세 상태다. `system`은 "고르지 않음"이지 네 번째 색이 아니다 —
 * 화면에 실제로 적용되는 건 언제나 라이트 아니면 다크이고, 그 판정이 resolveDark다.
 */
export type Theme = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'seoulchi:theme'

const THEMES: readonly Theme[] = ['system', 'light', 'dark']

/** localStorage에서 읽은 원문 → Theme. 모르는 값은 system으로 떨어진다 */
export function parseTheme(raw: string | null): Theme {
  return THEMES.includes(raw as Theme) ? (raw as Theme) : 'system'
}

/** 버튼을 누를 때마다 system → light → dark → system */
export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!
}

/** 실제로 .dark를 켤지. system일 때만 시스템 설정을 본다 */
export function resolveDark(theme: Theme, prefersDark: boolean): boolean {
  return theme === 'system' ? prefersDark : theme === 'dark'
}

export function themeLabel(theme: Theme): string {
  return theme === 'system' ? '시스템' : theme === 'dark' ? '다크' : '라이트'
}

/**
 * <head>에서 첫 페인트 전에 도는 스크립트.
 *
 * GitHub Pages가 내보내는 정적 HTML의 <html>에는 클래스가 없다. 하이드레이션 뒤에
 * .dark를 붙이면 다크 사용자는 매번 흰 화면을 한 번 본다. 그래서 번들이 아니라
 * <head> 안에서 동기로 돌려야 한다 — 그 대가로 이 파일의 다른 함수를 쓸 수 없다.
 *
 * 규칙이 resolveDark와 갈라지면 깜빡임 대신 틀린 테마가 뜬다.
 * tests/lib/theme.test.ts가 이 문자열을 실제로 실행해 두 답이 같은지 검사한다.
 *
 * try/catch는 localStorage가 막힌 환경(사파리 프라이빗)을 위한 것이다.
 * 여기서 던지면 스크립트가 <head>에 있어서 페이지 전체가 멈춘다.
 */
export const THEME_INIT_SCRIPT = `try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark",d);
}catch(e){}`

/** 저장값을 읽는다. 브라우저 밖이거나 localStorage가 막혔으면 system */
export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

/** 저장하고 <html>에 반영한다. 저장이 막혀도 이번 세션의 화면은 바뀐다 */
export function writeTheme(theme: Theme, prefersDark: boolean): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 저장만 실패한다. 아래 적용은 그대로 간다
  }
  document.documentElement.classList.toggle('dark', resolveDark(theme, prefersDark))
}

/** 시스템이 지금 다크인지. 브라우저 밖에서는 false */
export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}
