import { useEffect, useState } from 'react'
import {
  nextTheme,
  readTheme,
  systemPrefersDark,
  type Theme,
  themeLabel,
  writeTheme,
} from '~/lib/theme'

/**
 * 테마 전환 버튼. system → light → dark → system으로 순환한다.
 *
 * 서버는 사용자의 저장값을 모르므로 첫 렌더에서는 글자를 비운다 —
 * OpenNowBadge와 같은 이유, 같은 방법이다. 다만 배지와 달리 여기서는
 * 폭을 미리 잡아 둔다. 글자가 나중에 들어오면서 줄이 흔들리면 안 된다.
 *
 * 실제 색은 <head>의 THEME_INIT_SCRIPT가 이미 칠해 놨다. 이 컴포넌트는
 * 그 상태를 읽어서 라벨로 보여주고 바꾸는 일만 한다.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(readTheme())
  }, [])

  // system일 때만 OS 설정 변경을 따라간다. light/dark로 고정해 뒀으면 무시한다
  useEffect(() => {
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => writeTheme('system', mq.matches)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [theme])

  function cycle() {
    const next = nextTheme(theme ?? 'system')
    writeTheme(next, systemPrefersDark())
    setTheme(next)
  }

  const label = theme ? themeLabel(theme) : ''
  return (
    <button
      type="button"
      onClick={cycle}
      // 라벨이 비어 있는 첫 렌더에도 폭이 잡히도록 w를 고정한다(가장 긴 라벨 '시스템'·'라이트' 기준)
      className="w-20 rounded-full border border-neutral-border px-3 py-1.5 text-xs text-ink-muted"
      aria-label={theme ? `테마: ${label}. 누르면 다음 테마로 바뀝니다` : '테마 전환'}
    >
      {label}
    </button>
  )
}
