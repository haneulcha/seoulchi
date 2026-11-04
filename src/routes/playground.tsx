import { createFileRoute } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import { PAGE } from '~/components/page'
import { SAMPLES, type Sample } from '~/components/playground-samples'
import { button } from '~/components/ui'
import {
  type ColorToken, contrastPairs, type LengthToken, lightVars, parseDesignTokens, type Theme,
} from '~/lib/design-tokens'
import foundationCss from '~/styles/foundation.css?raw'
import themeCss from '~/styles/theme.css?raw'

/**
 * 디자인 시스템 한 장(스펙 2026-11-04-design-playground). 표는 CSS 원문에서, 견본은 실제 컴포넌트에서 나온다.
 * 어디서도 링크하지 않는다 — 주소로만 연다.
 */
export const Route = createFileRoute('/playground')({
  head: () => ({
    meta: [{ title: '디자인 시스템 — 서울치' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Playground,
})

const tokens = parseDesignTokens(themeCss, foundationCss)
const LIGHT_VARS = lightVars(tokens) as CSSProperties
const CONTRAST = {
  light: contrastPairs(tokens, 'light'),
  dark: contrastPairs(tokens, 'dark'),
}
const REPO = 'https://github.com/haneulcha/seoulchi/blob/main'

/** 길이 표기는 원문 그대로 두고 px을 곁들인다(1rem = 16px) */
function px(value: string): string {
  const rem = /^([\d.]+)rem$/.exec(value)
  return rem ? `${value} · ${Number(rem[1]) * 16}px` : value
}

function colorClass(c: ColorToken): string {
  if (c.kind === 'primitive') return `bg-${c.name}`
  if (c.name.endsWith('border')) return `border-${c.name}`
  if (/-text|on-solid|^ink/.test(c.name)) return `text-${c.name}`
  return `bg-${c.name}`
}

function Playground() {
  const scales = [...new Set(tokens.colors.flatMap((c) => (c.scale ? [c.scale] : [])))]
  return (
    <main className={`${PAGE} space-y-section py-page`}>
      <header>
        <h2 className="text-title-page">디자인 시스템</h2>
        <p className="mt-050 text-caption text-ink-subtle">
          빌드 기준 커밋 <code>{__COMMIT__}</code> · 근거{' '}
          <a className="underline" href={`${REPO}/DESIGN.md`}>DESIGN.md</a> ·{' '}
          <a className="underline" href={`${REPO}/PRODUCT.md`}>PRODUCT.md</a>
        </p>
      </header>

      <Section title="색">
        {scales.map((scale) => (
          <div key={scale} className="mt-300">
            <h4 className="text-title-row">{scale}</h4>
            <div className="mt-100 overflow-x-auto">
              <div className="grid min-w-[44rem] grid-cols-11 gap-050">
                {tokens.colors.filter((c) => c.scale === scale && c.kind === 'primitive').map((c) => (
                  <div key={c.name}>
                    <div className="h-10 rounded-050 border border-neutral-border" style={{ backgroundColor: c.value.light }} />
                    <p className="mt-050 text-caption">{c.name.slice(scale.length + 1)}</p>
                    <p className="text-caption text-ink-subtle">{c.value.light}</p>
                  </div>
                ))}
              </div>
            </div>
            <ColorTable colors={tokens.colors.filter((c) => c.scale === scale && c.kind === 'role')} />
          </div>
        ))}
        <div className="mt-300">
          <h4 className="text-title-row">표면·잉크</h4>
          <ColorTable colors={tokens.colors.filter((c) => c.kind === 'surface')} />
        </div>
      </Section>

      <Section title="글자">
        <div className="mt-200 divide-y divide-neutral-border">
          {tokens.text.map((t) => (
            <div key={t.name} className="py-150">
              <p style={{ fontSize: t.size, lineHeight: t.lineHeight, fontWeight: Number(t.weight) }}>
                이번 주 서울에서 갈 만한 곳
              </p>
              <p className="mt-050 text-caption text-ink-subtle">
                <code className="text-ink">text-{t.name}</code> · {px(t.size)} / {t.lineHeight} / {t.weight}
                {t.at.map((a) => ` · ≥${a.minWidth} ${a.size} / ${a.lineHeight}`).join('')}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="간격">
        <LengthRows items={tokens.spacing} cls={(n) => `gap-${n}`} sample={(s) => (
          <div className="h-150 rounded-050 bg-accent-solid" style={{ width: s.value }} />
        )} />
      </Section>

      <Section title="모서리">
        <div className="mt-200 flex flex-wrap gap-300">
          {tokens.radius.map((r) => (
            <div key={r.name}>
              <div className="h-14 w-14 border border-neutral-border bg-neutral-subtle-bg" style={{ borderRadius: r.value }} />
              <p className="mt-100 text-caption"><code>rounded-{r.name}</code></p>
              <p className="text-caption text-ink-subtle">{px(r.value)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="컴포넌트">
        {SAMPLES.map((s) => <SampleBlock key={`${s.source}#${s.name}`} sample={s} />)}
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-title-section">{title}</h3>
      {children}
    </section>
  )
}

function ColorTable({ colors }: { colors: ColorToken[] }) {
  return (
    <div className="mt-150 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-caption">
        <thead className="text-ink-subtle">
          <tr>
            <th className="py-050 pr-150">토큰 · 클래스</th>
            <th className="py-050 pr-150">라이트</th>
            <th className="py-050 pr-150">다크</th>
            <th className="py-050">대비</th>
          </tr>
        </thead>
        <tbody>
          {colors.map((c) => (
            <tr key={c.name} className="border-t border-neutral-border align-top">
              <td className="py-100 pr-150">
                <p>{c.name}</p>
                <code className="text-ink-subtle">{colorClass(c)}</code>
              </td>
              {(['light', 'dark'] as const).map((theme) => (
                <td key={theme} className="py-100 pr-150">
                  <div className="flex items-center gap-100">
                    <span className="h-6 w-6 shrink-0 rounded-050 border border-neutral-border" style={{ backgroundColor: c.value[theme] }} />
                    <span>
                      {c.value[theme]}
                      {c.ref[theme] && <span className="block text-ink-subtle">{c.ref[theme]}</span>}
                    </span>
                  </div>
                </td>
              ))}
              <td className="py-100"><Contrast fg={c.name} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 이 역할이 글자로 놓이는 바탕마다 라이트/다크 대비 */
function Contrast({ fg }: { fg: string }) {
  const rows = CONTRAST.light.filter((p) => p.fg === fg)
  if (rows.length === 0) return null
  const ratio = (theme: Theme, bg: string) => CONTRAST[theme].find((p) => p.fg === fg && p.bg === bg)!.ratio.toFixed(2)
  return (
    <ul>
      {rows.map((p) => (
        <li key={p.bg}>
          <span className="text-ink-subtle">on {p.bg}</span> {ratio('light', p.bg)} / {ratio('dark', p.bg)}
        </li>
      ))}
    </ul>
  )
}

function LengthRows({ items, cls, sample }: {
  items: LengthToken[]; cls: (name: string) => string; sample: (t: LengthToken) => ReactNode
}) {
  return (
    <div className="mt-200 space-y-100">
      {items.map((s) => (
        <div key={s.name} className="grid grid-cols-[7rem_1fr] items-center gap-150">
          <div className="text-caption">
            <code>{cls(s.name)}</code>
            <p className="text-ink-subtle">{px(s.value)}</p>
            {s.at.map((a) => <p key={a.minWidth} className="text-ink-subtle">≥{a.minWidth} {px(a.value)}</p>)}
          </div>
          {sample(s)}
        </div>
      ))}
    </div>
  )
}

/** 이보다 긴 호출 예시만 복사 버튼을 단다 — 짧은 건 손으로 옮기는 게 빠르다(스펙 3장) */
const COPY_MIN = 80

function SampleBlock({ sample }: { sample: Sample }) {
  return (
    <div className="mt-300">
      <h4 className="text-title-row">
        {sample.name} <span className="text-caption text-ink-subtle">{sample.source}</span>
      </h4>
      <div className="mt-100 grid gap-100 md:grid-cols-2">
        <div style={LIGHT_VARS} className="min-w-0 rounded-100 border border-neutral-border bg-surface p-200 text-ink">
          {sample.render()}
        </div>
        <div className="dark min-w-0 rounded-100 border border-neutral-border bg-surface p-200 text-ink">
          {sample.render()}
        </div>
      </div>
      <div className="mt-100 flex items-start gap-100">
        <pre className="min-w-0 flex-1 overflow-x-auto text-caption text-ink-muted"><code>{sample.code}</code></pre>
        {sample.code.length > COPY_MIN && (
          <button
            type="button"
            className={button('outline', 'sm')}
            // 실패(권한 거부 등)는 조용히 넘긴다 — 코드가 바로 옆에 보인다
            onClick={() => navigator.clipboard.writeText(sample.code).catch(() => {})}
          >
            복사
          </button>
        )}
      </div>
    </div>
  )
}
