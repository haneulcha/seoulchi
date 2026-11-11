import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** cards.tsx는 view다 — 도메인 타입·헬퍼와 라우터를 모른다. 값과 링크는 감싸는 도메인 컴포넌트가 넘긴다 */
const imports = (source: string) => [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
const domain = (spec: string) => /^~\/(lib|types|data)\/|^@tanstack\//.test(spec)

describe('cards.tsx', () => {
  it('도메인 import를 잡는다', () => {
    expect(imports("import { cardFacts } from '~/lib/card-facts'\nimport { useState } from 'react'\nimport { Link } from '@tanstack/react-router'").filter(domain))
      .toEqual(['~/lib/card-facts', '@tanstack/react-router'])
  })

  it('도메인을 import하지 않는다', () => {
    expect(imports(readFileSync('src/components/cards.tsx', 'utf8')).filter(domain)).toEqual([])
  })
})
