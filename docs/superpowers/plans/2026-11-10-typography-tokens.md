# 글자 토큰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 글자 토큰을 원시 층(크기 12, 굵기 3)과 범주 × 크기 역할 15개로 다시 정의하고, 화면·플레이그라운드·DESIGN.md를 옮긴다.

**Architecture:** `src/styles/foundation.css`의 `@theme`에 원시 크기·굵기를 리터럴로 두고, 역할은 원시를 `var()`로 가리킨다. `src/lib/design-tokens.ts`가 이것을 원시·굵기·역할 세 목록으로 읽어 플레이그라운드와 가드 테스트에 준다.

**Tech Stack:** Tailwind CSS 4.3, React 19, TanStack Router, Vitest

**Spec:** `docs/superpowers/specs/2026-11-09-typography-tokens-design.md`

## Global Constraints

- 원시 크기 `--text-{25,50,75,100,200,300,400,500,600,700,800,900}` = 10, 12, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36px. 줄 높이 = 14, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44px. rem으로 쓴다(px ÷ 16).
- 굵기 `--font-weight-regular: 400`, `--font-weight-medium: 500`, `--font-weight-bold: 700`.
- 역할 15개, 스펙 4장 표 그대로. 이름은 `{display|heading|title|body|label}-l`, `{범주}`, `{범주}-s`. 크기·줄 높이·굵기 모두 원시를 `var()`로 가리키고 리터럴을 쓰지 않는다.
- `heading-l`만 반응형이다. `@media (width >= 48rem)`의 `:root`에서 크기와 줄 높이를 `var(--text-800)`, `var(--text-800--line-height)`로 바꾼다. `@theme inline`을 쓰지 않는다.
- `--text-*: initial`, `--font-weight-*: initial`은 그대로 둔다.
- `leading-*`는 계속 금지. `font-regular|medium|bold`는 허용, 나머지 Tailwind 기본 굵기 이름은 계속 금지.
- 커밋 메시지는 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`로 끝난다.

## Review Focus

1. **옛 역할 이름이 남으면 Tailwind가 조용히 버린다.** `text-caption`이 하나 남아도 빌드와 기존 가드는 통과하고 글자만 기본값으로 떨어진다. Task 2가 "정의되지 않은 글자 역할 클래스" 가드로 막는다.
2. **역할에 덧붙인 `font-*`가 지면** 덧붙인 자리가 역할 굵기로 그려진다. Task 3 화면 확인에서 `text-body font-medium` 한 곳을 계산된 스타일로 잰다.
3. **md에서 `heading-l`이 안 바뀌면** 데스크톱 제목이 24px로 남는다. Task 1 파서 테스트가 `at`을, Task 3이 화면에서 32/40을 확인한다.
4. **`font-medium`이 가드에서 아직 잡히면** 새 토큰을 쓰는 모든 파일이 테스트에서 실패한다. Task 2가 정규식을 고치고 통과·실패 예시를 둘 다 둔다.
5. **12px 줄 높이 증가로 카드 글자가 잘리는 경우.** Task 3 화면 확인에서 홈 추천 선반과 탐색 목록을 본다.

---

### Task 1: 토큰과 파서

**Files:**
- Modify: `src/styles/foundation.css:28-50, 63-70`
- Modify: `src/lib/design-tokens.ts` (`TextToken`, `DesignTokens`, `parseDesignTokens`의 글자 부분)
- Test: `tests/lib/design-tokens.test.ts` ("글자 역할 7개와 폭별 값"을 대체)

**Interfaces:**
- Produces:
  - `type TextScale = { name: string; size: string; lineHeight: string }` (`name`은 `'25'`…`'900'`)
  - `type FontWeight = { name: string; value: string }` (`'regular'`→`'400'` 등)
  - `type TextToken = { name: string; size: string; lineHeight: string; weight: string; sizeRef: string; weightRef: string; at: Array<{ minWidth: string; size: string; lineHeight: string }> }`. 값은 rem·숫자로 푼 것, `sizeRef`는 원시 이름(`'100'`), `weightRef`는 굵기 이름(`'regular'`).
  - `DesignTokens`에 `textScale: TextScale[]`, `fontWeight: FontWeight[]`를 더하고 `text`는 역할만 담는다. 모두 CSS에 적힌 순서다.

- [ ] **Step 1: 실패하는 테스트로 바꾼다**

```ts
it('글자 원시 12단계와 굵기 3단계', () => {
  expect(t.textScale.map((s) => s.name)).toEqual(['25', '50', '75', '100', '200', '300', '400', '500', '600', '700', '800', '900'])
  expect(t.textScale.find((s) => s.name === '100')).toEqual({ name: '100', size: '0.9375rem', lineHeight: '1.375rem' })
  expect(t.textScale.find((s) => s.name === '50')).toEqual({ name: '50', size: '0.75rem', lineHeight: '1.125rem' })
  expect(t.fontWeight).toEqual([{ name: 'regular', value: '400' }, { name: 'medium', value: '500' }, { name: 'bold', value: '700' }])
})

it('글자 역할 15개는 원시를 가리킨다', () => {
  expect(t.text.map((x) => x.name)).toEqual([
    'display-l', 'display', 'display-s', 'heading-l', 'heading', 'heading-s', 'title-l', 'title', 'title-s',
    'body-l', 'body', 'body-s', 'label-l', 'label', 'label-s',
  ])
  expect(t.text.find((x) => x.name === 'body')).toEqual({
    name: 'body', size: '0.9375rem', lineHeight: '1.375rem', weight: '400', sizeRef: '100', weightRef: 'regular', at: [],
  })
  const h = t.text.find((x) => x.name === 'heading-l')!
  expect(h).toMatchObject({ size: '1.5rem', lineHeight: '2rem', weight: '700', sizeRef: '600', weightRef: 'bold' })
  expect(h.at).toEqual([{ minWidth: '48rem', size: '2rem', lineHeight: '2.5rem' }])
  expect(t.text.find((x) => x.name === 'title-s')).toMatchObject({ size: '0.875rem', weight: '500', sizeRef: '75' })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/lib/design-tokens.test.ts`
Expected: FAIL (`textScale` undefined)

- [ ] **Step 3: `foundation.css`를 고친다**

옛 역할 7개를 지우고 Global Constraints의 원시 크기·줄 높이·굵기, 스펙 4장의 역할 15개를 쓴다. 역할은 `--text-body: var(--text-100); --text-body--line-height: var(--text-100--line-height); --text-body--font-weight: var(--font-weight-regular);` 꼴이다. md 미디어 쿼리의 `--text-title-page*` 두 줄을 `--text-heading-l*`로 바꾼다.

- [ ] **Step 4: 파서를 고친다**

원시는 `/^text-\d+$/`, 굵기는 `font-weight-*`, 역할은 나머지 `text-*`(`--`가 없는 키)다. 값은 기존 `resolve()`로 풀고, `sizeRef`·`weightRef`는 원문 `var(--text-100)`·`var(--font-weight-regular)`에서 이름을 떼어 낸다. `at`의 값도 `resolve()`로 푼다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/lib/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/styles/foundation.css src/lib/design-tokens.ts tests/lib/design-tokens.test.ts
git commit -m "feat: 글자 원시 12단계·굵기 3단계와 범주×크기 역할 15개"
```

이 커밋 시점에는 화면의 옛 역할 클래스가 빌드에서 사라진 상태다. Task 2가 바로 옮긴다.

---

### Task 2: 호출부 이동과 가드

**Files:**
- Modify: `src/components/{cards,home,browse,OpenNowBadge,ui,playground-samples}.tsx`, `src/routes/{index,__root,browse,playground}.tsx`, `src/routes/e/$id.tsx`
- Modify: `tests/styles/foundation.test.ts`

**Interfaces:**
- Consumes: Task 1의 `parseDesignTokens(...).text`의 `name`

- [ ] **Step 1: 가드 테스트를 먼저 고친다**

1. `OFF`의 굵기 정규식에서 `medium`, `bold`를 뺀다(`regular`는 원래 없다).
2. "잡는다" 예시의 `font-bold`를 `font-semibold`로 바꾸고, 기대값도 같이 바꾼다.
3. "통과한다" 예시의 `text-title-card`를 `text-title-l text-100 font-medium`으로 바꾼다.
4. 새 가드를 둔다. 역할 범주나 옛 이름으로 시작하는데 역할·원시에 없는 클래스를 잡는다.

```ts
const TEXT_ROLE = /^text-(?:display|heading|title|body|label|caption)(?:-[\w-]+)?$/
const textNames = new Set([...parsed.text.map((x) => `text-${x.name}`), ...parsed.textScale.map((x) => `text-${x.name}`)])
// offText(source): 변형 접두사를 떼고 TEXT_ROLE에 맞는데 textNames에 없는 것

it('없는 글자 역할을 잡는다', () => {
  expect(offText('text-caption text-title-row md:text-title-page text-body-s text-heading-l text-center', textNames))
    .toEqual(['text-caption', 'text-title-row', 'md:text-title-page'])
})
it.each(sources('src'))('%s는 정의되지 않은 글자 역할을 쓰지 않는다', (file) => {
  expect(offText(readFileSync(file, 'utf8'), textNames)).toEqual([])
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/styles/foundation.test.ts`
Expected: 새 `src` 가드가 옛 이름을 쓰는 파일마다 FAIL

- [ ] **Step 3: 호출부를 옮긴다**

`title-page`→`heading-l`, `title-section`→`heading-s`, `title-card`→`title-l`, `title-row`→`title-s`, `caption`→`body-s`. `body`, `label`은 그대로다. 기계 치환이며 `text-` 접두사가 붙은 것만 바꾼다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS, 타입 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src tests/styles/foundation.test.ts
git commit -m "refactor: 글자 역할을 새 이름으로 옮기고 없는 역할 가드 추가"
```

---

### Task 3: 플레이그라운드와 DESIGN.md

**Files:**
- Modify: `src/routes/playground.tsx` ("글자" 섹션)
- Modify: `DESIGN.md` ("글자" 장, "Tailwind에서 강제하기" 표)

**Interfaces:**
- Consumes: Task 1의 `textScale`, `fontWeight`, `text`(`sizeRef`, `weightRef`)

- [ ] **Step 1: 플레이그라운드 "글자" 섹션**

표 세 개를 둔다. 열은 지금 표처럼 `Length`로 rem·px를 보여 준다.
- 원시 크기: 클래스 `text-{name}` · 견본 · 크기 · 줄 높이
- 굵기: 클래스 `font-{name}` · 견본 · 값
- 역할: 클래스 · 견본 · 크기(`<code>text-{sizeRef}</code>` 먼저, 아래 값) · 굵기(`<code>font-{weightRef}</code>` 먼저, 아래 값). 색 표가 ref를 먼저 보이는 방식과 같다. 범주가 바뀌는 곳마다 색 표처럼 tbody를 나눠 간격을 둔다.

- [ ] **Step 2: DESIGN.md "글자" 장을 스펙대로 다시 쓴다**

들어갈 것: 원시 크기 표(번호·px·줄 높이), 굵기 표, 범주 구간 표, 역할 15개 표, 번호 규칙(100 = 본문 15px), 15를 넣은 이유, 간격 번호와 뜻이 다르다는 점, heading·title·label의 구분, 원시와 `font-*` 덧붙이기를 허용한다는 점과 `leading-*`는 금지라는 점. 지울 것: "역할 토큰만 둡니다" 문단, "사실 줄은 `body`보다 작아지지 않습니다", "포스터 카드와 행은 같은 `title-card`", "역할 클래스에 `font-*`나 `leading-*`를 덧붙이지 않습니다". "Tailwind에서 강제하기" 표의 글자 행 예시를 `text-body`, `text-100 font-medium`으로 바꾸고, 막는 곳에 새 역할 가드를 적는다.

- [ ] **Step 3: 화면을 확인한다**

`npm run dev`(이미 떠 있으면 그대로) 후 headless Chrome이나 DevTools로 계산된 스타일을 잰다.
- 홈 `/seoulchi/` 390px 폭: 카드 제목 14px/20px/500, 사실 줄 12px/18px, 추천 선반에서 글자가 잘리지 않음
- 1024px 폭: 사이트 이름(`heading-l`) 32px/40px/700
- 탐색 `/seoulchi/browse`: 목록 행 글자 잘림 없음, 빈 결과 안내 제목이 16px/500(`title-l`, 지금과 같음)
- 덧붙인 굵기: 화면에 `text-body font-medium`을 쓰는 곳이 없으므로, DevTools `evaluate_script`로 임의 요소에 두 클래스를 붙여 `getComputedStyle().fontWeight`가 `500`인지 잰다(코드는 바꾸지 않는다).
- `/seoulchi/playground`: 원시·굵기·역할 표가 보이고, `heading-l`이 `text-600`·`font-bold`를 가리킨다

- [ ] **Step 4: 전체 확인**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 전부 PASS, 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/routes/playground.tsx DESIGN.md
git commit -m "docs: 플레이그라운드 글자 표와 DESIGN.md 글자 장을 새 토큰으로"
```
