import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '서울치 — 이번 주 서울' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body className="bg-white text-gray-900">
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
