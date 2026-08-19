import { describe, expect, it } from 'vitest'
import { findRootStaticFnCacheUrl, rewriteStaticFnCacheUrl } from '~/build/static-fn-base'

/** @tanstack/start-static-server-functions@1.167.29 dist/esm/staticFunctionMiddleware.js:28 원문 */
const 원본 =
  'var getStaticCacheUrl = async (opts) => {\n' +
  '\treturn `/__tsr/staticServerFnCache/${await sha1Hash(`${opts.functionId}__${opts.hash}`)}.json`;\n' +
  '};'

describe('rewriteStaticFnCacheUrl', () => {
  it('캐시 URL에 base를 붙인다', () => {
    expect(rewriteStaticFnCacheUrl(원본, '/seoulchi/')).toContain(
      '`/seoulchi/__tsr/staticServerFnCache/${await sha1Hash(',
    )
  })

  it('리터럴 밖의 코드는 건드리지 않는다', () => {
    const 결과 = rewriteStaticFnCacheUrl(원본, '/seoulchi/')
    expect(결과).toContain('var getStaticCacheUrl = async (opts) => {')
    expect(결과).toContain('.json`;')
  })

  it('base가 /면 원본 그대로다 — 루트 배포에서는 할 일이 없다', () => {
    expect(rewriteStaticFnCacheUrl(원본, '/')).toBe(원본)
  })

  // 패키지가 이 리터럴을 바꾸면 조용히 되돌아가는 대신 빌드가 멈춰야 한다.
  it('찾는 리터럴이 없으면 던진다', () => {
    expect(() => rewriteStaticFnCacheUrl('var x = 1', '/seoulchi/')).toThrow(
      /staticServerFnCache/,
    )
  })

  it('두 번 돌려도 base가 두 번 붙지 않는다', () => {
    const 한번 = rewriteStaticFnCacheUrl(원본, '/seoulchi/')
    expect(() => rewriteStaticFnCacheUrl(한번, '/seoulchi/')).toThrow()
  })
})

describe('findRootStaticFnCacheUrl', () => {
  it('base 없는 캐시 URL을 찾아낸다', () => {
    expect(findRootStaticFnCacheUrl(원본)).toBe(true)
  })

  it('base가 붙은 URL은 잡지 않는다 — /seoulchi/__tsr/도 뒤에 /__tsr/를 품고 있다', () => {
    expect(findRootStaticFnCacheUrl(rewriteStaticFnCacheUrl(원본, '/seoulchi/'))).toBe(false)
  })

  it('상관없는 코드에는 반응하지 않는다', () => {
    expect(findRootStaticFnCacheUrl('var x = 1')).toBe(false)
  })
})
