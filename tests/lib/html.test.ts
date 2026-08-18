import { describe, expect, it } from 'vitest'
import { htmlToText } from '~/lib/html'

describe('htmlToText', () => {
  it('태그를 벗기고 본문만 남긴다', () => {
    expect(htmlToText('<p>서울의 <b>여름</b> 축제</p>')).toBe('서울의 여름 축제')
  })

  it('style 블록을 통째로 버린다', () => {
    // 비짓서울 본문은 항목마다 같은 스마트에디터 CSS를 1.5KB씩 달고 온다
    const html = '<style type="text/css">.se-contents{overflow-x:auto;}</style><p>본문</p>'
    expect(htmlToText(html)).toBe('본문')
  })

  it('script 블록을 통째로 버린다', () => {
    expect(htmlToText('<script>alert(1)</script><p>본문</p>')).toBe('본문')
  })

  it('base64 인라인 이미지를 남기지 않는다', () => {
    // raw 2MB짜리 항목의 본문이 548자였던 원인
    const html = '<img src="data:image/png;base64,AAAABBBBCCCC"><p>본문</p>'
    const out = htmlToText(html)
    expect(out).toBe('본문')
    expect(out).not.toContain('base64')
  })

  it('HTML 엔티티를 되돌린다', () => {
    expect(htmlToText('<p>공예&nbsp;체험 &amp; 전시 &lt;여름&gt;</p>')).toBe(
      '공예 체험 & 전시 <여름>',
    )
  })

  it('연속 공백과 줄바꿈을 하나로 접는다', () => {
    expect(htmlToText('<p>가</p>\n\n   <p>나</p>')).toBe('가 나')
  })

  it('블록 경계에서 단어가 붙지 않는다', () => {
    expect(htmlToText('<div>서울</div><div>축제</div>')).toBe('서울 축제')
  })

  it('빈 입력과 없는 입력은 빈 문자열이다', () => {
    expect(htmlToText(undefined)).toBe('')
    expect(htmlToText('')).toBe('')
    expect(htmlToText('<style>.a{}</style>')).toBe('')
  })

  it('속성값 안의 > 에 속지 않는다', () => {
    // 실측: 6건이 구글 시트에서 붙여넣어져 data-sheets-value 속성에 JSON이 들어 있었다.
    // 태그를 <[^>]*> 로 잡으면 따옴표 안의 >에서 끊겨 JSON이 본문으로 샌다.
    const html = '<span data-sheets-value="{&quot;a&quot;:1}" data-x="{\'b\':2}">본문</span>'
    expect(htmlToText(html)).toBe('본문')
  })

  it('속성에 따옴표로 감싼 JSON이 있어도 본문만 남는다', () => {
    const html = '<td data-sheets-userformat="{"2":10749,"3":{"1":0}}">전시 소개</td>'
    const out = htmlToText(html)
    expect(out).toBe('전시 소개')
    expect(out).not.toContain('data-sheets')
  })

  it('원래 평문이면 그대로 둔다', () => {
    expect(htmlToText('태그 없는 설명글입니다.')).toBe('태그 없는 설명글입니다.')
  })
})
