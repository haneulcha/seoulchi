import type { ReactNode } from 'react'

/**
 * 버튼은 <a>와 <button> 양쪽에 붙으므로 컴포넌트가 아니라 클래스로 준다.
 * outline도 solid와 같은 1px 테두리를 가져야 두 버튼을 나란히 둘 때 높이가 같다.
 */
const BUTTON_TONE = {
  solid: 'border-ink bg-ink text-surface',
  outline: 'border-neutral-border text-ink',
}
const BUTTON_SIZE = { md: 'px-300 py-150', sm: 'px-200 py-100' }

export function button(tone: keyof typeof BUTTON_TONE, size: keyof typeof BUTTON_SIZE = 'md') {
  return `rounded-100 border text-center text-label ${BUTTON_TONE[tone]} ${BUTTON_SIZE[size]}`
}

/** 칩 모양. 켜진 칩도 테두리를 유지해야 켜고 끌 때 높이가 2px 흔들리지 않는다 */
export function chip(active = false) {
  return `shrink-0 rounded-full border px-150 py-075 text-label ${
    active ? 'border-ink bg-ink text-surface' : 'border-neutral-border bg-surface text-ink-muted'
  }`
}

const CALLOUT_TONE = {
  error: { box: 'border-error-border bg-error-subtle-bg', title: 'text-error-text-strong', body: 'text-error-text' },
  warning: { box: 'border-warning-border bg-warning-subtle-bg', title: 'text-warning-text-strong', body: 'text-warning-text' },
}

/** 목록 대신 놓이는 상태 안내. 실패는 error, 오래됨은 warning이다 */
export function Callout({
  tone, title, children,
}: { tone: keyof typeof CALLOUT_TONE; title: string; children: ReactNode }) {
  const t = CALLOUT_TONE[tone]
  return (
    <div className={`mt-400 rounded-100 border p-200 ${t.box}`}>
      <p className={`text-title-card ${t.title}`}>{title}</p>
      <div className={`mt-050 space-y-050 text-body ${t.body}`}>{children}</div>
    </div>
  )
}
