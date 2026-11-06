# 시맨틱 색 토큰 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 색 토큰을 `원시 색(색 이름)` + `시맨틱(역할-강도-상태, 속성은 Tailwind 접두사)` 두 층으로 바꾸고, 화면·플레이그라운드·문서를 새 이름으로 옮긴다. 화면은 픽셀상 그대로다.

**Architecture:** `theme.css`에서 원시 색은 `@theme` 밖 `:root`로 옮긴다. 그래서 원시 색은 클래스를 만들지 않는다. 시맨틱은 `@theme static` 안의 `--background-color-*`, `--text-color-*`, `--border-color-*`에 두고, `.dark`가 이 시맨틱 변수만 다시 선언한다. 토큰 파서는 이 구조를 새 모델(`primitives` + `semantics`)로 읽는다. 플레이그라운드와 새 클래스 가드 테스트는 그 모델을 쓴다.

**Tech Stack:** Tailwind v4.3.3, TanStack Start, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-semantic-color-tokens-design.md`

## Global Constraints

- 원시 색 이름: `orange`·`gray`·`red`·`yellow`·`green`·`blue`, stop은 50~950. 값은 바꾸지 않는다. CSS 변수는 `--{hue}-{stop}`(예: `--orange-500`)이고 `:root`에만 둔다.
- 시맨틱 역할: `accent`·`neutral`·`danger`·`warning`·`success`·`info`. 강도 단어: `subtle`·`muted`·`solid`(+ 글자의 `strong`), 상태: `hover`.
- 시맨틱 값은 hex 리터럴 없이 `var(--{hue}-{stop})`만 쓴다. 예외는 `on-*`의 `#ffffff`/`#000000`이다. 지금 `on-solid`가 리터럴인 것을 그대로 옮기되, `var(--color-white)`/`var(--color-black)`로 쓴다.
- 값이 바뀌는 토큰은 `neutral-solid` 하나뿐이다. 라이트 `gray-900`, 다크 `gray-100`이다(스펙 4장).
- `--color-*: initial`과 `--color-white`·`black`·`transparent`·`current`는 그대로 둔다.
- 스타일은 시스템 토큰 클래스만 쓴다. `tests/styles/foundation.test.ts`가 간격·글자·모서리를 지킨다.
- 주석은 코드가 못 보이는 이유만, 이 레포 밀도(한국어, 짧게)로 쓴다.

### 시맨틱 전체 표 (스펙 4장을 값으로 풀어 쓴 것)

`{i}`는 accent·danger·warning·success·info다. hue는 accent=orange, danger=red, warning=yellow, success=green, info=blue, neutral=gray다.

| 변수 | 라이트 | 다크 |
| --- | --- | --- |
| `--background-color-base` | `--color-white` | `gray-950` |
| `--background-color-{r}-subtle` | 50 | 950 |
| `--background-color-{r}-subtle-hover` | 100 | 900 |
| `--background-color-{i}-solid` | 600 | (재선언 없음) |
| `--background-color-neutral-solid` | gray-900 | gray-100 |
| `--text-color-neutral` / `-muted` / `-subtle` | gray-900 / 600 / 500 | gray-100 / 300 / 400 |
| `--text-color-{i}` / `{i}-strong` | 800 / 900 | 300 / 200 |
| `--text-color-on-{i}` | 지금 `{scale}-on-solid` 값(accent·warning·success는 black, danger·info는 white) | (재선언 없음) |
| `--text-color-on-neutral` | `--color-white` | `gray-950` |
| `--border-color-{r}` | 200 | 800 |
| `--border-color-{i}-solid` | `{i}` 600 | (재선언 없음) |
| `--border-color-neutral-solid` | gray-900 | gray-100 |

합계는 시맨틱 50개(바탕 19, 글자 19, 선 12)다. `.dark`의 재선언은 35개(바탕 14, 글자 14, 선 7)다.

순서는 이 표의 순서를 따른다. 속성 안에서 역할은 accent, neutral, danger, warning, success, info 순서다.

## Review Focus

1. **Tailwind가 모르는 색 클래스는 조용히 사라진다.** `text-danger-muted`처럼 정의되지 않은 이름을 쓰면 빌드 에러 없이 무색이 된다. Task 2의 가드 테스트가 역할 단어로 시작하는 색 클래스는 모두 정의된 토큰인지 확인한다.
2. **페이지가 다크일 때 플레이그라운드 라이트 칸.** `lightVars`의 키가 `.dark`가 재선언하는 시맨틱 변수 이름 전부여야 한다. 테스트는 Task 1에 있다.
3. **`text-on-neutral`·`border-neutral-solid`의 다크 값.** 지금 `text-surface`·`border-ink`가 다크에서 뒤집히는 것과 같아야 한다. Task 1 테스트가 다크 값을 고정한다.
4. **옛 이름 잔존.** `variant:` 접두사가 붙은 클래스(`[&.active]:border-ink`)도 바꿔야 한다. Task 2 가드가 접두사를 떼고 본다.
5. **화면 회귀.** 이름만 바꾸는 작업이다. Task 2 끝에서 홈과 상세를 바꾸기 전과 후로 스크린샷 비교한다.

## 사전 확인 (계획 작성 중 실행, 2026-11-05)

tailwindcss 4.3.3의 `compile()`로 아래 CSS를 빌드했다.

```css
:root { --gray-50: …; --gray-950: …; }
@theme static {
  --color-*: initial;
  --background-color-base: …;
  --text-color-neutral: …;
  --border-color-neutral: …;
}
.dark { --background-color-base: var(--gray-950); }
```

후보 클래스와 결과는 다음과 같다.

- 생성됨: `bg-base`, `bg-neutral-subtle`, `text-neutral`, `border-neutral`, `divide-neutral`. 각각 `var(--…-color-…)`를 참조하므로 `.dark` 재선언이 따라간다.
- 생성 안 됨: `text-base`, `bg-neutral`, `bg-gray-50`, `text-color-neutral`.
- `--text-caption` 글자 크기 토큰과 충돌 없음.

---

### Task 1: 토큰 층 — `theme.css`, 파서, 플레이그라운드

**Files:**
- Modify: `src/styles/theme.css`
- Modify: `src/lib/design-tokens.ts`
- Modify: `src/routes/playground.tsx`
- Test: `tests/lib/design-tokens.test.ts`

**Interfaces:**
- Produces (`src/lib/design-tokens.ts`):
  ```ts
  export type ColorProperty = 'background' | 'text' | 'border'
  export const CLASS_PREFIX: Record<ColorProperty, string> // { background: 'bg', text: 'text', border: 'border' }
  export type Primitive = { name: string; hue: string; value: string }            // 'orange-500', 'orange', '#fa9216'
  export type Semantic = {
    name: string                    // 'neutral-muted', 'on-accent', 'base'
    property: ColorProperty
    role: string                    // 'on-X' → X, 'base' → 'neutral', 그 밖은 첫 마디
    value: Record<Theme, string>    // 끝까지 푼 hex
    ref: Partial<Record<Theme, string>> // 원시 색을 가리키면 'gray-900'
  }
  export type DesignTokens = { primitives: Primitive[]; semantics: Semantic[]; spacing; radius; text; fontSans }
  export const className = (s: Semantic) => `${CLASS_PREFIX[s.property]}-${s.name}`
  export const cssVar = (s: Semantic) => `--${s.property}-color-${s.name}`
  ```
  `ColorToken`, `kind`, `scale`는 없앤다. `contrastRatio`, `contrastPairs`, `lightVars`의 시그니처는 그대로다.
- `contrastPairs`의 반환 `fg`·`bg`는 클래스 이름(`text-danger`, `bg-danger-subtle`)이다.

- [ ] **Step 1: 테스트를 새 구조로 고친다 (실패)**

`tests/lib/design-tokens.test.ts`의 색·대비·lightVars 블록을 바꾼다. 간격·글자·모서리 블록은 그대로 둔다.

- 원시 색은 66개이고, 첫 항목은 `{ name: 'orange-50', hue: 'orange', value: '#fff6ee' }`, hue 순서는 `['orange','gray','red','yellow','green','blue']`다.
- 시맨틱은 50개이고, 속성별로 바탕 19, 글자 19, 선 12다. `className`의 결과는 모두 서로 다르다.
- `text-danger`(`find(s => className(s) === 'text-danger')`)는 `{ role: 'danger', value: { light: '#98010e', dark: '#ffa8a8' }, ref: { light: 'red-800', dark: 'red-300' } }`다.
- `bg-accent-solid`는 `{ light: '#d27800', dark: '#d27800' }`다.
- `bg-neutral-solid`는 `{ light: '#18181c', dark: '#f4f4f5' }`, `text-on-neutral`은 `{ light: '#ffffff', dark: '#09080b' }`, `border-neutral-solid`는 `bg-neutral-solid`와 같은 값이다.
- `text-neutral-subtle`은 `{ light: '#71717c', dark: '#9f9fa9' }`, role `neutral`이다. `bg-base`도 role `neutral`이다.
- 원시 색 이름에 옛 스케일(`accent-`, `neutral-`, `error-`, `warning-`, `success-`, `info-`)이 없다.
- `contrastPairs`는 테마마다 29쌍이고 모두 4.5 이상이다. 다음을 포함한다: `{ fg: 'text-neutral-subtle', bg: 'bg-base' }`, `{ fg: 'text-on-neutral', bg: 'bg-neutral-solid' }`.
- `lightVars`의 키 집합은 `.dark` 블록에 선언된 `--*-color-*` 이름 집합과 같고 35개다. `vars['--background-color-base'] === '#ffffff'`이다.

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/lib/design-tokens.test.ts`

- [ ] **Step 3: `theme.css`를 다시 쓴다**

순서는 `:root { 원시 66개 }`, `@theme static { --color-*: initial; white·black·transparent·current; 시맨틱 50개 }`, `.dark { 35개 }`다. 값과 순서는 Global Constraints의 표를 따른다.

머리 주석의 "자동 생성된 값입니다"는 사실이 아니므로(생성 스크립트가 레포에 없다) 지운다. 그 자리에 두 가지를 쓴다.
- 원시 색은 `:root`라서 클래스가 없다.
- `.dark`는 시맨틱만 바꾼다.

- [ ] **Step 4: 파서를 고친다**

- 원시 색은 `themeCss`의 첫 `:root {…}` 블록에서 읽는다.
- 시맨틱은 `@theme static` 블록에서 `^(background|text|border)-color-` 이름만 읽는다.
- 별칭 해석은 원시 색, `@theme`, foundation을 합친 맵으로 한다.
- `ref`는 `var(--{hue}-{stop})` 형태일 때만 채운다.
- `contrastPairs` 쌍은 다음과 같다.
  - `neutral`이 아닌 역할 `i`마다 다섯 쌍: `text-{i}`를 `bg-base`·`bg-{i}-subtle`·`bg-{i}-subtle-hover` 위에, `text-{i}-strong`을 `bg-{i}-subtle` 위에, `text-on-{i}`를 `bg-{i}-solid` 위에 둔다.
  - neutral 네 쌍: `text-neutral`·`-muted`·`-subtle`을 `bg-base` 위에, `text-on-neutral`을 `bg-neutral-solid` 위에 둔다.
  - 합계는 5×5+4=29다. 옛 33쌍 중 `neutral-text`·`neutral-text-strong`의 5쌍은 토큰이 없어져 빠지고, `on-neutral` 쌍은 새 토큰을 잰다.
- `lightVars`의 키는 `cssVar(s)`다.

- [ ] **Step 5: 플레이그라운드를 새 모델로 바꾼다**

- 원시 색 칸은 hue별로 묶고, 이름 아래에 `var(--orange-500)`을 보인다. 원시 색에는 클래스가 없다.
- 시맨틱 표는 역할별로 묶는다(accent, neutral, danger, warning, success, info). 열은 `className(s)`, 라이트·다크 칠과 값, `ref`다.
- 지금 `colorClass()`의 추측 로직(`/-text|on-solid|^ink/`)은 `className`으로 대체하고 지운다.
- 대비 표는 `contrastPairs`의 새 이름을 보인다.
- 이 파일 자신의 클래스(`text-ink-subtle` 등)는 Task 2에서 바꾼다. 이 Task에서는 모델 사용 코드만 바꾼다.

- [ ] **Step 6: 확인** — `npx vitest run tests/lib/design-tokens.test.ts`와 `npx tsc --noEmit`가 통과한다.

- [ ] **Step 7: 커밋** `feat: 색 토큰을 원시 색(:root)과 시맨틱(이름공간) 두 층으로`

### Task 2: 화면 클래스 이전과 가드

**Files:**
- Modify: `src/` 아래 옛 색 클래스를 쓰는 모든 `.tsx`(2026-11-05 grep 기준 약 80건). `src/components/ui.tsx`, `src/routes/__root.tsx`, `src/routes/playground.tsx`, `src/components/playground-samples.tsx` 등이다.
- Test: `tests/styles/foundation.test.ts`

**Interfaces:**
- Consumes: Task 1의 `parseDesignTokens`, `className`.

- [ ] **Step 1: 가드 테스트 (실패)**

`foundation.test.ts`에 `offColor(source, known: Set<string>): string[]`과 테스트 둘을 더한다.

- 대상: 변형 접두사를 뗀 클래스 중 `^(bg|text|border|divide)-` 다음이 아래 단어로 시작하는 것.
  - 역할: `accent|neutral|danger|warning|success|info|on-|base`
  - 옛 이름: `ink|surface|error`
  - 원시 hue: `orange|gray|red|yellow|green|blue`
- 판정: `divide-x`는 `border-x`로 바꿔 본다. 그 클래스가 `known`(= 모든 `className(s)`)에 없으면 반환한다.
- 단위 테스트:
  - `offColor('bg-base text-neutral-muted md:border-danger [&.active]:border-neutral-solid divide-neutral text-caption text-center border-b-2', known)`는 `[]`다.
  - `offColor('text-ink bg-surface text-danger-muted bg-orange-500 [&.active]:border-ink border-neutral-border', known)`는 입력 순서 그대로 6개 전부다.
- `it.each(sources('src'))`: 파일마다 `offColor(...)`가 `[]`다.

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/styles/foundation.test.ts`. src 파일들이 옛 이름으로 실패한다.

- [ ] **Step 3: 치환**

치환 표는 다음과 같다. 앞쪽 패턴이 먼저 적용되어야 한다. 예를 들어 `text-ink-muted`를 `text-ink`보다 먼저 바꾼다.

| 옛 클래스 | 새 클래스 |
| --- | --- |
| `bg-surface` | `bg-base` |
| `text-surface` | `text-on-neutral` |
| `bg-ink` | `bg-neutral-solid` |
| `border-ink` | `border-neutral-solid` |
| `text-ink-muted` / `text-ink-subtle` / `text-ink` | `text-neutral-muted` / `text-neutral-subtle` / `text-neutral` |
| `{p}-{s}-subtle-bg` | `{p}-{r}-subtle` |
| `{p}-{s}-hover-bg` | `{p}-{r}-subtle-hover` |
| `text-{s}-text-strong` / `text-{s}-text` | `text-{r}-strong` / `text-{r}` |
| `text-{s}-on-solid` | `text-on-{r}` |
| `{border,divide}-{s}-border` | `{border,divide}-{r}` |
| `{p}-{s}-solid` | `{p}-{r}-solid` |

스케일과 역할의 대응은 `error`→`danger`이고 나머지는 같은 이름이다.

`CALLOUT_TONE`의 키 `error`는 컴포넌트 API이므로 그대로 둔다. 바뀌는 것은 클래스 문자열뿐이다.

- [ ] **Step 4: 통과 확인** — `npx vitest run`, `npx tsc --noEmit`, `npm run build`가 모두 통과한다.

- [ ] **Step 5: 화면 비교**

- 비교 대상은 `main`(529c37c) 빌드와 이 브랜치 빌드다.
- 대상 화면은 홈 `/seoulchi/`, 아무 상세 하나, `/seoulchi/playground`다. 앞의 둘은 390px과 1280px에서 라이트와 다크를 각각 찍는다.
- 홈과 상세는 같아야 한다. 다르면 원인을 찾아 고친다.
- 플레이그라운드는 이름이 바뀌었으므로 다르다. 깨진 칸(무색 견본, 빈 표)이 없는지 눈으로 본다.

- [ ] **Step 6: 커밋** `refactor: 화면 색 클래스를 시맨틱 이름으로, 정의 안 된 색 클래스 가드`

### Task 3: 문서와 사본

**Files:**
- Modify: `DESIGN.md` ("색" 장, "Tailwind에서 강제하기")
- Modify: `docs/design/palette.css`
- Modify: `docs/design/palette.figma.json`
- Modify: `CLAUDE.md` (`text-gray-500` 예시 문장이 있으면 맞춘다)

- [ ] **Step 1: `palette.css`** — `theme.css`와 같은 두 층 구조에 같은 이름으로 쓰되, Tailwind 없이 쓰는 형태로 바꾼다. 시맨틱은 `:root`와 `.dark`에 둔다.
- [ ] **Step 2: `palette.figma.json`**
  - "Color Primitives" 컬렉션의 변수 이름을 `orange-50` 같은 새 이름으로 바꾼다.
  - 시맨틱 컬렉션은 변수 이름을 `background/neutral-subtle` 꼴로 짓는다. Figma에서 슬래시는 그룹이 된다.
  - 다른 키(모드 등)는 지금 구조를 유지한다.
- [ ] **Step 3: `DESIGN.md`**
  - "스케일" 절 제목을 새 hue 이름으로 바꾼다.
  - "역할"과 "표면과 잉크" 절을 "시맨틱" 하나로 합친다. 스펙 4장 표와 "모양이 다른 곳"을 옮긴다.
  - "대비" 절의 쌍 수를 29로 고친다.
  - "쓰는 법"에 원시 색은 클래스가 없다는 점을 적는다.
  - "고칠 때"에서 "자동 생성" 문구를 지운다.
  - "아직 안 정한 것"에 스펙 8장(다크에서 `bg-neutral-subtle`과 `bg-base`가 같은 색)을 더한다.
  - 문서 안의 옛 클래스 이름이 남지 않게 한다. 예를 들어 `text-success-text`는 `text-success`로 바꾼다.
- [ ] **Step 4: 확인** — `grep -nE 'ink|surface|subtle-bg|hover-bg|on-solid|accent-[0-9]|neutral-[0-9]' DESIGN.md docs/design/palette.css`의 결과에 옛 토큰 이름이 없다. "잉크" 같은 일반 단어는 괜찮다. `node -e "JSON.parse(require('fs').readFileSync('docs/design/palette.figma.json','utf8'))"`가 통과한다.
- [ ] **Step 5: 커밋** `docs: DESIGN.md와 팔레트 사본을 새 색 토큰 이름으로`
