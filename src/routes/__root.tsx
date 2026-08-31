import { createRootRoute, HeadContent, Link, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ThemeToggle } from '~/components/ThemeToggle'
import { PAGE } from '~/components/page'
import { THEME_INIT_SCRIPT } from '~/lib/theme'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '서울치 — 이번 주 서울' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
    // <head>에서 동기로 돈다. 번들(Scripts)은 body 끝이라 여기 오면 이미 늦다 —
    // 정적 HTML의 <html>에 클래스가 없어서 다크 사용자가 흰 화면을 한 번 보게 된다
    scripts: [{ children: THEME_INIT_SCRIPT }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    /*
     * <head>의 THEME_INIT_SCRIPT가 하이드레이션 전에 여기에 .dark를 붙인다.
     * 서버 HTML에는 그 클래스가 없으므로(빌드 시각에는 사용자의 선택을 알 수 없다)
     * React가 불일치로 보고 매번 콘솔 에러를 낸다. 이 요소의 속성에 한해 경고를 끈다 —
     * 실제 동작은 문제가 없다. React는 이 불일치를 되돌리지 않는다.
     */
    <html lang="ko" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-surface text-ink">
        {/*
         * 두 화면 공통 헤더(스펙 7장). 제목 유지 + 세그먼트.
         * 범위 줄은 탭마다 달라서 여기 없다 — 각 라우트가 자기 범위 줄을 그린다.
         * 상세에서도 이 헤더가 보이므로 '돌아갈 길 없음'(크리틱 P1)이 사라진다.
         */}
        <header className={`${PAGE} pt-4`}>
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-bold md:text-3xl">
              <Link to="/">이번 주 서울</Link>
            </h1>
            <ThemeToggle />
          </div>
          <nav aria-label="화면 전환" className="mt-3 flex gap-6 border-b border-neutral-border">
            <TabLink to="/" label="추천" />
            <TabLink to="/browse" label="탐색" />
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/**
 * 세그먼트 탭. TanStack Link는 활성일 때 .active 클래스를 붙인다 —
 * activeProps의 className 병합 규칙에 기대지 않고 [&.active] 변형으로 스타일링한다.
 * 활성 표시는 뉴트럴 밑줄 — 액센트를 어디 쓸지는 DESIGN.md의 미결정이다.
 */
function TabLink({ to, label }: { to: '/' | '/browse'; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="-mb-px border-b-2 border-transparent pb-2 text-ink-muted [&.active]:border-ink [&.active]:font-bold [&.active]:text-ink"
    >
      {label}
    </Link>
  )
}

/** 링크되지 않은 id는 페이지를 만들지 않는다(스펙 10-5). 그 id로 들어오면 여기로 온다 */
function NotFound() {
  return (
    <main className={`${PAGE} py-16 text-center`}>
      {/* 루트 헤더가 shell의 h1을 갖는다 — 이건 그 안의 콘텐츠라 h2다. h1로 되돌리지 말 것 */}
      <h2 className="text-xl font-bold">없는 페이지입니다</h2>
      <Link to="/" className="mt-6 inline-block underline">홈으로</Link>
    </main>
  )
}
