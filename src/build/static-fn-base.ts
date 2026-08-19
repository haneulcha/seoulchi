/**
 * @tanstack/start-static-server-functions(1.167.29, 2.0.0-alpha.2까지 동일)는
 * 정적 서버 함수 캐시의 경로를 한 함수로 만들어 두 곳에서 쓴다.
 *
 *   getStaticCacheUrl() → `/__tsr/staticServerFnCache/<sha1>.json`
 *     쓰기(프리렌더): path.join(TSS_CLIENT_OUTPUT_DIR, url) → dist/client/__tsr/…  ✅
 *     읽기(브라우저): fetch(url)                            → origin 루트 기준     ❌
 *
 * 프로젝트 사이트(https://<user>.github.io/seoulchi/)에서는 읽기 쪽만 base가 필요하다.
 * 쓰기는 출력 디렉터리 기준 상대 경로라 base를 붙이면 오히려 dist/client/seoulchi/에 쓴다.
 * 그래서 base 주입은 클라이언트 번들에만 한다 — vite.config.ts의 플러그인이 환경을 가른다.
 *
 * 패키지에 base를 넘길 수단이 없어서(모듈 내부 private, 옵션 없음) 리터럴을 갈아끼운다.
 */

/** 따옴표 바로 뒤의 루트 절대경로만 잡는다. 이미 base가 붙은 `/seoulchi/__tsr/…`는 걸리지 않는다 */
const 루트경로 = /(['"`])\/__tsr\/staticServerFnCache\//g

/** 캐시 URL에 base를 붙인다. 리터럴을 못 찾으면 던진다 — 조용히 되돌아가지 않게 */
export function rewriteStaticFnCacheUrl(code: string, base: string): string {
  if (!루트경로.test(code)) {
    루트경로.lastIndex = 0
    throw new Error(
      "staticFunctionMiddleware에서 '/__tsr/staticServerFnCache/' 리터럴을 찾지 못했습니다. " +
        '패키지가 캐시 URL 생성을 바꿨을 수 있습니다 — src/build/static-fn-base.ts를 확인하세요.',
    )
  }
  루트경로.lastIndex = 0
  // base가 '/'면 붙일 게 없다. 루트 배포에서 이 플러그인은 무해해야 한다.
  return base === '/' ? code : code.replace(루트경로, `$1${base}__tsr/staticServerFnCache/`)
}

/**
 * 클라이언트 번들에 base 없는 캐시 URL이 남았는지 본다.
 * 패키지가 파일명을 바꿔 transform이 아무것도 안 잡는 경우까지 여기서 걸린다.
 */
export function findRootStaticFnCacheUrl(code: string): boolean {
  루트경로.lastIndex = 0
  const 있다 = 루트경로.test(code)
  루트경로.lastIndex = 0
  return 있다
}
