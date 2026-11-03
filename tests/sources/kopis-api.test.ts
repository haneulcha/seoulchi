import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  KopisApiError,
  KopisBlockedError,
  createKopisClient,
  parseKopisResponse,
  xmlField,
  xmlFields,
} from '~/sources/kopis-api'

const fx = (name: string) => readFileSync(`tests/fixtures/kopis/${name}`, 'utf8')

describe('parseKopisResponse', () => {
  it('정상 목록은 db 블록 배열이다', () => {
    const blocks = parseKopisResponse(200, fx('list.xml'))
    expect(blocks).toHaveLength(3)
    expect(xmlField(blocks[0]!, 'mt20id')).toBe('PF304867')
  })
  it('04는 빈 결과다', () => expect(parseKopisResponse(200, fx('error-04.xml'))).toEqual([]))
  it('01·02는 코드를 담아 던진다', () => {
    expect(() => parseKopisResponse(200, fx('error-02.xml'))).toThrow(KopisApiError)
    try {
      parseKopisResponse(200, fx('error-01.xml'))
    } catch (e) {
      expect((e as KopisApiError).code).toBe('01')
    }
  })
  it('XML이 아닌 응답은 차단이다', () => {
    expect(() => parseKopisResponse(400, fx('blocked.html'))).toThrow(KopisBlockedError)
    expect(() => parseKopisResponse(200, fx('blocked.html'))).toThrow(KopisBlockedError)
  })
  it('returncode 없는 비정상 상태는 빈 결과가 아니라 오류다', () => {
    expect(() => parseKopisResponse(502, '<?xml version="1.0"?><error>bad gateway</error>')).toThrow(KopisApiError)
  })
})

describe('xmlField', () => {
  it('엔티티를 풀고 빈 값은 undefined다', () => {
    const [d] = parseKopisResponse(200, fx('detail.xml'))
    expect(xmlField(d!, 'entrpsnm')).toBeUndefined()
    expect(xmlFields(d!, 'relateurl')[0]).toMatch(/^https:\/\//)
    const [e] = parseKopisResponse(200, fx('detail-entities.xml'))
    expect(e).toContain('&amp;')
    expect(xmlFields(e!, 'relateurl')[0]).toContain('?p_marking=&p_new=')
  })
})

describe('createKopisClient', () => {
  it('클라이언트는 호출 사이에 간격을 두고 service·파라미터를 붙인다', async () => {
    const urls: string[] = []
    const fetchFn = (async (u: string) => {
      urls.push(u)
      return new Response(fx('list.xml'))
    }) as typeof fetch
    const c = createKopisClient('K', { intervalMs: 0, fetchFn })
    await c.get('pblprfr', { stdate: '20261101', rows: 100 })
    expect(urls[0]).toBe('https://kopis.or.kr/openApi/restful/pblprfr?service=K&stdate=20261101&rows=100')
  })
})
