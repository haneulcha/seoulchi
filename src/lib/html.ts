/**
 * 비짓서울 `post_desc`는 네이버 스마트에디터가 만든 HTML이다.
 * 항목마다 같은 CSS 블록을 1.5KB씩 달고 오고, 본문에 base64 이미지가
 * 통째로 박혀 있는 경우도 있다(raw 2.0MB인데 본문은 548자였다).
 *
 * 제품에서 외부 HTML을 그대로 렌더링할 일은 없다 — XSS와 스타일 오염 위험만 진다.
 * 알맹이(텍스트)만 남긴다.
 */

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
}

export function htmlToText(html: string | undefined | null): string {
  if (!html) return ''

  return String(html)
    // style·script는 내용까지 통째로 버린다. 태그만 지우면 CSS 본문이 텍스트로 남는다.
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // 태그 자리에 공백을 넣는다. 그냥 지우면 <div>서울</div><div>축제</div>가 '서울축제'가 된다.
    //
    // 속성값을 따옴표째 건너뛴다. `<[^>]*>`로 잡으면 data-sheets-value="{"a":1}" 처럼
    // 속성 안에 >나 따옴표가 든 태그에서 일찍 끊겨 JSON이 본문으로 샌다(실측 6건).
    .replace(/<[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, ' ')
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim()
}
