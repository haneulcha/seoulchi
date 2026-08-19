import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3000 }, // 검증 단계의 curl들이 3000을 가정한다
  resolve: {
    // vitest.config.ts와 같은 수동 alias. vite-tsconfig-paths 의존성을 하나 아낀다
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        // 홈이 링크하는 상세 18페이지를 크롤로 줍는다 — 프리렌더 범위 "홈이 링크하는 것만"(스펙 10-5)의 구현.
        // 링크가 없는 id는 크롤되지 않으므로 자동으로 404가 된다
        crawlLinks: true,
        // 상세 한 페이지가 깨졌는데 조용히 넘어가면 배포 후에야 안다. 빌드에서 깨뜨린다
        failOnError: true,
      },
    }),
    // react 플러그인은 start 플러그인 뒤에 와야 한다 (공식 문서)
    viteReact(),
  ],
})
