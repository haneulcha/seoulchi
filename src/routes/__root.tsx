import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ThemeToggle } from '~/components/ThemeToggle'
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
          홈(max-w-5xl)과 상세(max-w-4xl)가 컨테이너 폭이 다르다. 여기서 라우트를 보고
          폭을 바꾸면 "공통 자리"가 아니게 되므로 넓은 쪽에 맞춰 고정한다.
          패딩은 홈 <main>과 같아서 홈에서는 오른쪽 끝이 정확히 맞는다.
        */}
        <div className="mx-auto flex max-w-5xl justify-end px-4 pt-4 sm:px-6 lg:px-8">
          <ThemeToggle />
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** 링크되지 않은 id는 페이지를 만들지 않는다(스펙 10-5). 그 id로 들어오면 여기로 온다 */
function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-bold">없는 페이지입니다</h1>
      <a href="/" className="mt-6 inline-block underline">홈으로</a>
    </main>
  )
}
