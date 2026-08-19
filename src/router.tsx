import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    // vite.config.ts의 base와 짝. 라우터가 만드는 링크(<Link>)가 /seoulchi/ 아래로
    // 나가야 GitHub Pages 프로젝트 사이트에서 이동이 성립한다.
    basepath: '/seoulchi/',
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
