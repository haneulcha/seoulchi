import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { findRootStaticFnCacheUrl, rewriteStaticFnCacheUrl } from './src/build/static-fn-base'

// GitHub Pages 프로젝트 사이트는 https://<user>.github.io/seoulchi/ 아래에 얹힌다.
// 이 값이 없으면 에셋 URL이 전부 /로 시작해 404가 난다. router.tsx의 basepath와 짝이다.
const base = '/seoulchi/'

/**
 * 정적 서버 함수 캐시 fetch에 base를 주입한다. 이게 없으면 상세로 넘어갈 때
 * /__tsr/…json을 받으러 갔다가 Pages의 404 HTML을 JSON으로 파싱해 앱이 터진다.
 * 왜 리터럴을 갈아끼우는지는 src/build/static-fn-base.ts 참고.
 */
function staticFnBasePath(): Plugin {
  return {
    name: 'seoulchi:static-fn-base-path',
    // start 플러그인이 미들웨어를 쪼개기 전에 원본 리터럴을 봐야 한다
    enforce: 'pre',
    transform(code, id) {
      // 클라이언트 번들만. 서버 쪽은 출력 디렉터리 기준 상대 경로여야 한다
      if (this.environment.name !== 'client') return
      if (!id.includes('start-static-server-functions/dist/esm/staticFunctionMiddleware')) return
      return rewriteStaticFnCacheUrl(code, base)
    },
    // 패키지가 파일을 옮겨 위 transform이 아무것도 못 잡으면 여기서 걸린다.
    // 배포된 뒤에 상세 진입이 터지는 것보다 빌드가 멈추는 게 낫다.
    generateBundle(_options, bundle) {
      if (this.environment.name !== 'client') return
      for (const [파일명, 청크] of Object.entries(bundle)) {
        if (청크.type === 'chunk' && findRootStaticFnCacheUrl(청크.code)) {
          this.error(
            `${파일명}에 base 없는 정적 서버 함수 캐시 URL이 남았습니다. ` +
              'src/build/static-fn-base.ts를 확인하세요.',
          )
        }
      }
    },
  }
}

export default defineConfig({
  base,
  server: { port: 3000 }, // 검증 단계의 curl들이 3000을 가정한다
  resolve: {
    // vitest.config.ts와 같은 수동 alias. vite-tsconfig-paths 의존성을 하나 아낀다
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    staticFnBasePath(),
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
