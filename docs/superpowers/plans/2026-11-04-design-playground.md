# 디자인 플레이그라운드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코드(CSS 토큰·컴포넌트)에서 빌드가 결정적으로 만들어 내는 `/playground` 페이지.

**Architecture:** 순수 파서가 `theme.css`·`foundation.css` 원문(`?raw`)을 토큰 모델로 바꾸고, 라우트가 그 모델과 실제 컴포넌트를 렌더링한다. 다른 화면과 같이 정적 프리렌더된다.

**Tech Stack:** TanStack Start(파일 라우트, 프리렌더), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-design-playground-design.md`

## Global Constraints

- 화면 스타일은 시스템 토큰 클래스만 쓴다(`text-ink-subtle`, `gap-100`, `rounded-100`). `mt-3`·`text-sm`·`rounded-lg` 같은 숫자·기본 클래스는 `tests/styles/foundation.test.ts`가 거절한다.
- 새 색을 만들지 않는다. 견본 칠은 파싱한 값을 인라인 `style`로 준다.
- 버튼·칩·콜아웃은 `src/components/ui.tsx`에서 가져다 쓴다.
- 플레이그라운드는 `data/`를 읽지 않는다. 견본 데이터는 고정 예시다.
- 주석은 코드가 못 보이는 이유만. 이 레포의 주석 밀도(한국어, 짧게)를 따른다.

## Review Focus

1. 페이지가 다크일 때 라이트 칸이 실제로 라이트 값으로 칠해지는가(스펙 7장). 테스트: `lightVars`가 `.dark` 재선언 대상인 모든 역할을 라이트 값으로 돌려준다.
2. 파서가 미디어 쿼리 안의 재선언을 기본값으로 착각하지 않는가(`--spacing-gutter`가 16px). 테스트로 고정.
3. 별칭(`var(--color-accent-50)`)이 hex로 끝까지 풀리는가. 테스트로 고정.
4. 프리렌더에 `/playground`가 실제로 나오는가(`.output/public/playground/index.html` 또는 빌드 산출 경로). 빌드로 확인.
5. 새 컴포넌트 export를 견본 없이 추가하면 테스트가 실패하는가.

---

### Task 1: 토큰 파서

**Files:**
- Create: `src/lib/design-tokens.ts`
- Test: `tests/lib/design-tokens.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Theme = 'light' | 'dark'
  export type ColorToken = {
    name: string                 // 'accent-500', 'accent-text', 'ink-subtle' (--color- 뗀 이름)
    kind: 'primitive' | 'role' | 'surface'
    scale?: string               // 'accent' … primitive·role만
    value: Record<Theme, string> // 끝까지 푼 hex
    ref: Partial<Record<Theme, string>> // 별칭이면 가리키는 이름('accent-800')
  }
  export type LengthToken = { name: string; value: string; at: Array<{ minWidth: string; value: string }> }
  export type TextToken = { name: string; size: string; lineHeight: string; weight: string; at: Array<{ minWidth: string; size: string; lineHeight: string }> }
  export type DesignTokens = { colors: ColorToken[]; spacing: LengthToken[]; radius: LengthToken[]; text: TextToken[]; fontSans: string }
  export function parseDesignTokens(themeCss: string, foundationCss: string): DesignTokens
  export function contrastRatio(a: string, b: string): number  // WCAG 2, 소수 둘째 자리 반올림 안 함
  export function contrastPairs(tokens: DesignTokens, theme: Theme): Array<{ fg: string; bg: string; ratio: number }>
  export function lightVars(tokens: DesignTokens): Record<string, string> // '--color-accent-text' → light hex, .dark가 재선언하는 이름만
  ```
- 값 표기: 길이는 원문 그대로(`0.5rem`), 표시용 px 변환은 Task 2가 한다. `white`·`black`·`transparent`·`current`는 colors에서 뺀다.
- `contrastPairs` 쌍: 스케일마다 `text` on `surface`·`subtle-bg`·`hover-bg`, `text-strong` on `subtle-bg`, `on-solid` on `solid`; 그리고 `ink`·`ink-muted`·`ink-subtle` on `surface`. 테마당 33쌍. DESIGN.md "대비" 장은 54건이라고 적지만 쌍 목록이 없어 맞춰 보지 않는다 — 전부 4.5 이상인지만 본다.

- [ ] **Step 1: 실제 CSS 파일을 입력으로 쓰는 실패 테스트**

테스트는 `readFileSync`로 `src/styles/theme.css`·`foundation.css`를 읽는다. 단언:
- colors 길이 112(프리미티브 66 + 역할 42 + 표면 4), 순서는 원문 순서, 첫 항목 `accent-50`.
- `accent-text`: `value.light === '#874c03'`, `value.dark === '#ffc99b'`, `ref.light === 'accent-800'`, `ref.dark === 'accent-300'`.
- `accent-solid`는 다크 재선언이 없으므로 `value.dark === value.light === '#d27800'`.
- `ink-subtle`: light `#71717c`, dark `#9f9fa9`, kind `surface`.
- spacing 순서가 `0, 025, 050, …, 1000, gutter, section, page`, `gutter.value === '1rem'`(또는 풀린 값), `gutter.at`이 `[{minWidth:'40rem', value:'1.5rem'}, {minWidth:'64rem', value:'2rem'}]`.
- text 7개, `title-page.at[0]` = `{minWidth:'48rem', size:'1.875rem', lineHeight:'2.375rem'}`, `caption` 12px 계열 원문값과 weight '400'.
- radius 4개, `full` = `9999px`.
- `contrastRatio('#ffffff', '#71717c')`를 소수 둘째 자리로 반올림하면 4.82. `contrastPairs(t,'light')`·`'dark'` 각 33쌍, 전부 4.5 이상.
- `lightVars(t)`의 키 집합이 `.dark` 블록에 선언된 `--color-*` 이름 집합과 같고, `'--color-surface'` 값은 `#ffffff`.

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/lib/design-tokens.test.ts`
- [ ] **Step 3: 구현.** 정규식으로 블록을 자른다: `theme.css`는 `@theme static {…}`(라이트)와 `.dark {…}`, `foundation.css`는 `@theme {…}`와 `@media (width >= X) { :root {…} }`들. 별칭은 라이트 맵에서 재귀로 푼다(다크 값이 프리미티브를 가리켜도 프리미티브는 라이트 맵에 있다).
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat: 디자인 토큰 파서 — theme.css·foundation.css 원문을 토큰 모델로`

### Task 2: `/playground` 라우트

**Files:**
- Create: `src/routes/playground.tsx`
- Create: `src/components/playground-samples.tsx` (견본 레지스트리)
- Modify: `vite.config.ts` (`pages`에 `/playground`, 커밋 sha `define`)
- Modify: 필요하면 `src/vite-env.d.ts` 등에 전역 상수 타입
- Test: `tests/components/playground-samples.test.ts`

**Interfaces:**
- Consumes: Task 1의 `parseDesignTokens`, `contrastPairs`, `lightVars`.
- Produces:
  ```ts
  // playground-samples.tsx
  export type Sample = { name: string; source: string; code: string; render: () => ReactNode }
  export const SAMPLES: Sample[]   // name = 컴포넌트·함수 export 이름, source = 'src/components/ui.tsx' 등
  ```
- 라우트 head: `title` "디자인 시스템 — 서울치", `meta name=robots content=noindex`.
- CSS 원문은 `import themeCss from '~/styles/theme.css?raw'`로 받는다.

- [ ] **Step 1: 누락 테스트(실패)** — 다섯 파일(`ui.tsx`, `cards.tsx`, `ItemImage.tsx`, `OpenNowBadge.tsx`, `ThemeToggle.tsx`)을 `import * as`로 불러 export 이름 집합을 만들고, `SAMPLES.map(s => s.name)` 집합과 같은지 단언한다. 소문자 export(`button`, `chip`)도 포함한다.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 견본 레지스트리.** 컴포넌트마다 실제 import로 렌더한다. 카드 견본 데이터는 고정 `CatalogEventIndexItem` 예시 2~3개(실제 제목 같은 한국어, 무료 하나·유료 하나, 기관명 대괄호 하나, `genre` 있음). `today`는 고정 문자열. `ItemImage`는 src 없이. `OpenNowBadge`는 `{open:'00:00', close:'24:00', closedWeekdays:[]}`. `Callout` 문구는 `src/components/browse.tsx`의 실제 문구.
- [ ] **Step 4: 라우트.** 스펙 5장 순서. 컴포넌트 견본은 두 칸: 라이트 칸은 `style={lightVars(tokens)}` + `bg-surface text-ink`, 다크 칸은 `className="dark bg-surface text-ink"`. 칸 아래 `code`를 고정폭으로, 80자 넘는 호출 예시에만 복사 버튼(`navigator.clipboard.writeText`, 실패는 조용히 무시). 색 칸 칠은 인라인 `style={{ backgroundColor: hex }}`. 길이는 rem → px 표시(1rem = 16px).
- [ ] **Step 5: vite.config.ts** — `pages`에 `{ path: '/playground' }`. `define: { __COMMIT__: JSON.stringify(<git rev-parse --short HEAD, 실패 시 'unknown'>) }`.
- [ ] **Step 6: 확인** — `npx vitest run`, `npx tsc --noEmit`, `npm run build`가 통과하고 프리렌더 산출물에 playground HTML이 있다.
- [ ] **Step 7: 커밋** `feat: /playground — 코드에서 빌드되는 디자인 시스템 페이지`

### Task 3: 화면 확인

- [ ] 로컬 빌드(또는 dev)로 `/seoulchi/playground`를 390px·1280px, 라이트·다크(페이지 테마 토글)에서 스크린샷. 라이트 칸이 페이지 다크에서도 흰 바탕인지, 다크 칸이 페이지 라이트에서도 검은 바탕인지 본다.
- [ ] 가로 스크롤이 생기지 않는지(색 표는 자기 칸 안에서만 스크롤).
