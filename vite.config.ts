import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { findRootStaticFnCacheUrl, rewriteStaticFnCacheUrl } from './src/build/static-fn-base'

/**
 * 카탈로그 전량 프리렌더(스펙 4장). 탐색이 카탈로그 전부로 링크를 걸므로
 * 상세 페이지가 전부 있어야 한다. 페이지당 0.017초 실측 — 975페이지면 +17초 안팎.
 * config 로드 시점에 데이터를 읽는다: 빌드는 항상 레포 루트에서 돈다(Plan 2 전례).
 *
 * 키는 `prerender.pages`가 아니라 플러그인 옵션 최상위 `pages` —
 * @tanstack/start-plugin-core/dist/esm/schema.d.ts:708(입력) · :130(해석 타입) 확인.
 * 항목은 `{ path }` 객체 배열이다(문자열 배열이 아님).
 *
 * crawlLinks는 유지한다 — 같은 큐에 병행되는 두 번째 시드다(prerender.js:57, :97-107).
 * 실측(2026-08-30 스냅샷): 홈이 실제로 링크하는 id는 이 명시 목록의 부분집합이었다 —
 * pickHomeItems(src/lib/home.ts)가 curated pick을 `endDate >= today`로 한 번 더 거르므로,
 * 카탈로그에서 같은 기준으로 빠진 id는 홈에도 나타나지 않는다(크롤이 추가로 주울 게 없었다).
 * 그래도 유지하는 이유는 방어선이다: 데이터 스냅샷이 바뀌어 홈이 인덱스 밖 id를 링크하게 되면
 * (예: 필터 기준이 어긋나는 미래 변경) crawlLinks 없이는 그 자리가 그대로 404가 되고
 * failOnError 빌드가 깨진다 — 링크 대상은 항상 페이지가 있어야 한다는 불변식의 안전망이다.
 */
const catalogPages = (
  JSON.parse(readFileSync('data/index.json', 'utf8')) as { items: Array<{ id: string }> }
).items.map((item) => ({ path: `/e/${item.id}` }))

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
      pages: catalogPages,
      prerender: {
        enabled: true,
        // 명시 목록(catalogPages)과 병행되는 두 번째 시드. 홈이 링크하지만 인덱스에는
        // 없는 id(이상치·필터링된 curated)를 여기서 잡는다 — 링크가 전혀 없는 id는
        // 여전히 크롤되지 않으므로 자동으로 404다
        crawlLinks: true,
        // 상세 한 페이지가 깨졌는데 조용히 넘어가면 배포 후에야 안다. 빌드에서 깨뜨린다
        failOnError: true,
      },
    }),
    // react 플러그인은 start 플러그인 뒤에 와야 한다 (공식 문서)
    viteReact(),
  ],
})
