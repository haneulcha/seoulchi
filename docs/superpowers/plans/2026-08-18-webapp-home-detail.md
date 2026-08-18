# 웹앱 1차 배포 (홈 + 상세) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배치가 커밋한 `data/*.json`을 빌드 타임에만 읽어, 홈 `/`과 상세 `/e/$id` 두 화면을 전부 정적으로 프리렌더하는 웹앱을 만든다.

**Architecture:** TanStack Start의 프리렌더(SSG)로 **19페이지만** 생성한다 — 홈 1 + 상세 18(event 12 + place 6). 데이터 접근은 `src/data/`에 모으고 정적 서버 함수(빌드 타임 실행) 뒤에 두므로 JSON이 브라우저 번들에 들어가지 않는다. 화면 로직은 전부 순수 함수(`pickHomeItems`, `formatDateRange`, `isOpenNow`, `categoryColor`, `resolveCurated`)로 빼서 vitest로 테스트하고, 라우트 컴포넌트는 얇게 유지한다. 유일한 예외적 클라이언트 계산은 "지금 열림" 배지다 — SSG의 빌드 시각으로 계산하면 거짓말이 되기 때문이다.

**Tech Stack:** TanStack Start + React + TypeScript + Vite + Tailwind CSS. 테스트는 기존 vitest 그대로.

**Spec:** `docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md` — 특히 10장(화면 구조, 2026-08-18 갱신본)과 11장(기술 스택). API·데이터 사실의 근거는 `docs/api-findings.md`.

**Tasks:** Task 0~11, **총 12개.** 순서: 0 스캐폴드 → 1 파일 스키마 이동 → 2 데이터 로더 → 3~7 순수 함수(resolveCurated · 날짜 표기 · 카테고리 색 · isOpenNow · pickHomeItems) → 8 실데이터 스모크 → **9 상세 `/e/$id`** → **10 홈 `/`** → 11 정적 서빙 검증 + 문서 갱신. 상세(9)가 홈(10)보다 먼저인 이유: 홈이 상세로 링크를 걸면 `crawlLinks`가 그 링크를 프리렌더하려 들어, 상세 라우트가 없으면 `failOnError` 빌드가 깨진다 — 역순이면 홈 완성 시점에 빌드가 초록일 수 없다(Task 9 본문 참조).

## Global Constraints

- **1차 배포는 홈 `/`과 상세 `/e/$id` 둘뿐이다.** `/explore`와 `/nearby`는 범위 밖 (스펙 10-2, 10-3 — 다음 증분). 홈 하단 "전체 둘러보기 →" 링크도 넣지 않는다 — 갈 곳이 없다.
- **렌더링은 전부 빌드 타임 SSG.** `data/*.json`은 빌드 때만 Node `fs`로 읽는다. 브라우저 번들에 JSON을 넣지 않는다 — `places.json` 851KB가 클라이언트로 나가면 안 된다.
- **프리렌더는 19페이지** — 홈 1 + 상세 18. 전량(1,042페이지) 프리렌더는 명시적으로 거부됐다(스펙 10-5). 링크되지 않은 id는 404.
- **현재 주차는 `data/meta.json`의 `weekKey`에서 읽는다.** 앱에서 `isoWeekKey(new Date())`로 계산하는 것을 금지한다. 오늘은 2026-W34인데 커밋된 데이터는 2026-W33이다 — 날짜로 계산하면 없는 파일을 읽고 빌드가 깨진다. `meta.json`은 배치가 *실제로 쓴 것*의 기록이므로 항상 존재하는 파일을 가리킨다.
- **`오늘`은 빌드 시각의 KST 날짜**이고, 이 값을 쓰는 함수는 전부 **`today`(또는 `now`)를 인자로 받는다.** 순수 함수 내부에서 `new Date()`를 부르면 테스트가 실행 날짜에 따라 깨진다 — 이 레포의 확립된 규칙이다(`src/lib/week.ts`의 `kstToday` 주석). `new Date()`를 부르는 곳은 서버 함수 핸들러(빌드 타임)와 "지금 열림" 배지의 effect(브라우저) 딱 두 경계뿐이다.
- **한 줄 코멘트(`reason`)는 빈 문자열일 수 있다.** 운영 배치가 `LLM_PROVIDER=rule`로 돌기 때문(스펙 9-2). 비면 그 줄을 아예 렌더하지 않는다 — 빈 자리를 남기지 않는다.
- **"지금 열림" 배지만 브라우저에서 계산한다.** 서버 렌더에서는 아무것도 내보내지 않고 hydration 이후에 나타난다. `hours`가 `null`이면 배지 없이 `useTime` 원문을 그대로 보여준다.
- **이미지 로드 실패 시 카테고리 색 블록으로 폴백한다** (`onError`). 카테고리→색 매핑은 결정론적이어야 한다 — 같은 카테고리는 항상 같은 색.
- **종료일이 오늘로부터 2년을 넘으면 기간 대신 "상시"로 표기한다.** 원본에 `2626-08-08`, `2099-12-31` 같은 오타가 섞여 있다(2026-W33 실측 6건). 원본을 고칠 수 없으므로 표시 단계에서 막는다.
- **`linkUrl`이 없으면 원문 링크 버튼을 감춘다** (event 308/314, place 550/728에만 존재).
- **배치는 건드리지 않는다.** 단 하나의 예외: `src/pipeline/emit.ts` 안의 파일 스키마 4종을 `src/types/files.ts`로 옮기는 **순수 이동**(Task 1). 기존 emit 테스트가 그대로 지켜준다.
- 모든 태스크 완료 시점에 `npm test` 전체(기존 배치 테스트 포함)가 초록이어야 한다.
- 커밋 메시지는 한국어 본문 + Conventional Commits 접두사(`feat:`, `test:`, `chore:`, `refactor:`, `docs:`). 본문에는 *왜*를 쓴다.

## 구현 중 확인이 필요한 것 (추측 금지 목록)

TanStack Start의 API 표면은 버전에 따라 다르다. 아래 코드는 2026-08 시점 공식 문서(빌드-from-scratch / static-prerendering / static-server-functions 가이드)에서 확인한 형태지만, **설치된 버전의 문서와 대조한 뒤** 쓴다. 대조 결과가 다르면 코드를 문서 쪽으로 고치고 이 계획에 각주를 남긴다.

| # | 항목 | 이 계획의 가정 | 어긋나면 |
|---|---|---|---|
| 1 | 프리렌더 설정 | `tanstackStart({ prerender: { enabled, crawlLinks, failOnError } })` (vite.config.ts) — 공식 static-prerendering 가이드에서 확인 | 설치 버전 문서의 키 이름을 따른다 |
| 2 | 정적 서버 함수 | `createServerFn().middleware([staticFunctionMiddleware])` (`@tanstack/start-static-server-functions`, 체인 마지막에 위치) — 빌드 타임에 실행되고 결과가 정적 JSON으로 캐시되며, 클라이언트 네비게이션은 그 JSON을 fetch한다 | 일반 서버 함수로는 정적 호스팅에서 클라이언트 네비게이션이 깨진다. Task 11의 확인 단계 참조 |
| 3 | **정적 서버 함수가 입력값(payload)별로 캐시되는가** | 상세 라우트가 `getDetail({ data: id })`처럼 인자를 넘기는데, 캐시가 인자별로 분리되는지는 문서에서 확정하지 못했다 | **대비책**: 홈의 카드 링크를 `<Link>` 대신 일반 `<a href>`로 바꾼다. 19페이지 전부 프리렌더된 정적 HTML이므로 풀 페이지 로드로도 제품이 성립한다 (Task 11에서 검증) |
| 4 | 서버 함수 입력 검증 메서드 이름 | `.inputValidator(...)` | 구버전은 `.validator(...)`였다. 설치 버전 문서 확인 |
| 5 | `src/router.tsx`의 export 이름 | `export function getRouter()` | build-from-scratch 문서의 현재 형태를 따른다 |
| 6 | 빌드 산출 디렉토리 | `dist/` 또는 `.output/` (버전에 따라 다름, 둘 다 .gitignore에 있음) | 빌드 로그에 찍힌 경로를 쓴다. Task 0에서 확정하고 이후 태스크의 검증 명령에 그 경로를 쓴다 |

### 확인 결과 (Task 11에서 전부 확인됨 — 위 표의 "가정"보다 아래가 우선한다)

설치 버전: `@tanstack/react-start` / `@tanstack/start-client-core` / `@tanstack/start-static-server-functions` **1.167.29**.

- **#1 — 가정대로.** `tanstackStart({ prerender: { enabled, crawlLinks, failOnError } })`가 설치 버전에서 그대로 동작한다(`vite.config.ts`). `crawlLinks: true`가 홈의 링크를 따라가 상세 18페이지를 줍고, 링크 없는 id는 크롤되지 않아 자동으로 404가 된다 — 스펙 10-5의 "홈이 링크하는 것만"이 설정 하나로 구현된다.
- **#2 — 가정의 절반이 틀렸다. "미들웨어는 체인 마지막이어야 한다"는 제약은 실재하지 않는다.** 패키지 이름(`@tanstack/start-static-server-functions`)과 `staticFunctionMiddleware`의 동작은 가정대로였으나, 체인 순서 제약은 없다. `createServerFn.d.ts`에서 `ServerFnAfterValidator`와 `ServerFnAfterMiddleware`가 서로의 인터페이스(`ServerFnMiddleware` / `ServerFnValidator`)를 각각 extends하므로 `.validator().middleware()`와 `.middleware().validator()`가 둘 다 타입에 맞는다. 실제 제약은 **`.validator()`를 두 번 부를 수 없다는 것뿐**이다(`ServerFnAfterValidator`가 `ServerFnValidator`를 extends하지 않는다). 코드는 `.validator().middleware([staticFunctionMiddleware]).handler(...)` 순서를 쓴다.
- **#3 — 해소됨. 정적 서버 함수는 입력값별로 캐시된다. 대비책(`<Link>` → `<a href>`)은 적용하지 않았고, `src/components/cards.tsx`는 `<Link>` 그대로 둔다.** 근거 넷:
  1. **구현 근거** — `staticFunctionMiddleware.js`의 캐시 URL이 `/__tsr/staticServerFnCache/${sha1(functionId + '__' + jsonToFilenameSafeString(data))}.json`이다. **payload(`data`)가 해시 입력에 들어간다.** 쓰기(`.server` → `addItemToCache`)와 읽기(`.client` → `fetchItem`)가 **같은 함수**를 쓰므로 빌드가 쓴 파일과 클라이언트가 요청하는 URL이 정의상 일치한다.
  2. **산출물 근거** — `dist/client/__tsr/staticServerFnCache/`에 JSON이 **19개**(홈 1 + 상세 18) 생성됐고, 상세 18개가 각각 **서로 다른 id의 아이템**을 담고 있다. 하나의 파일에 마지막 id만 남는 실패 모드가 아니다.
  3. **재현 근거** — `getDetail`의 `functionId`(`2295929a…ae07`, `dist/server/assets/_id-*.js`의 `createServerRpc({ id })`)로 해시를 직접 계산했더니 `sc-1z05tw` → `c3426da5….json`, `sc-5m28pn` → `42222c5f….json`으로 **실제 파일과 정확히 일치**했고, 각 파일 내용이 그 id의 아이템이었다. 홈이 링크하는 18개 id 전부가 존재하는 캐시 파일에 대응한다(18/18).
  4. **정적 서버 근거** — `npx serve dist/client`로 **정적 파일만** 서빙한 뒤, 클라이언트가 계산할 18개 URL을 그대로 HTTP로 요청해 전부 200을 받았고, **응답 본문 18개가 서로 전부 달랐으며 각각 자기 id를 담고 있었다**(18/18). 없는 id(`sc-nope`)의 캐시 URL은 404다.
- **#4 — 계획의 가정이 거꾸로였다.** 계획은 `.inputValidator`가 현행이고 `.validator`가 구버전이라고 적었으나 **반대다.** 설치된 `@tanstack/start-client-core`의 `createServerFn.d.ts`에서 정식 이름은 **`validator`**이고, `inputValidator`에는 JSDoc 주석 ``/** @deprecated Use `validator` instead. */``가 붙어 있다(타입 정의 3곳 — L81-82, L99-100, L124-125). 코드는 `.validator(...)`를 쓴다.
- **#5 — 가정대로.** `src/router.tsx`가 `export function getRouter()`를 내보내고 설치 버전이 그대로 인식한다.
- **#6 — `dist/`가 아니라 `dist/client/`다.** 빌드는 `dist/client/`(정적 배포 대상)와 `dist/server/`로 나뉘어 나온다. 프리렌더 HTML·에셋·정적 서버 함수 캐시는 전부 `dist/client/` 아래다. 이 계획과 태스크 브리프들에 `dist/`로 적힌 검증 명령은 **전부 `dist/client/`로 읽는다.** (덧붙여, 프리렌더 HTML에는 개행이 없어 BSD `grep`이 바이너리로 판단하고 조용히 건너뛴다 — 한글 검색에는 **`grep -a`**를 쓴다.)

### 빌드 시간 (Task 11 실측)

| | 페이지 | 빌드 시간 (wall clock) |
|---|---|---|
| Task 0 (스캐폴드) | 1 | 약 **1.00초** (4회: 1.012 / 0.990 / 0.997 / 0.995) |
| Task 11 (홈+상세 완성) | **19** | 약 **1.30초** (3회: 1.30 / 1.31 / 1.30, 매회 `rm -rf dist` 후) |

**페이지당 증분 ≈ 0.017초** (0.30초 ÷ 18페이지). 프리렌더 페이지 수는 빌드 시간의 지배 항이 아니다 — 고정비(client·ssr 번들링)가 대부분이다. `/explore`·`/nearby`가 붙어 프리렌더가 수백 페이지로 늘어도 이 증분 기준으로는 수 초 안에 들어온다. 스펙 10-5의 "홈이 링크하는 것만" 범위를 빌드 시간 때문에 좁힐 이유는 현재 없다.

## 실측 데이터 (이 계획의 숫자는 전부 여기서 나왔다)

`data/`는 2026-W33 기준으로 커밋돼 있다. 계획 작성일은 2026-08-18(2026-W34)이다.

- `data/events/2026-W33.json` — 314건, 242KB(pretty). `{weekKey, items}`. 서울시 275 + 비짓서울 39
- `data/places.json` — 728건, 851KB(pretty). `{items}`
- `data/curated/2026-W33.json` — `{weekKey, picks:[{id, reason}]×12, places:[id]×6}`, 1.6KB
- `data/meta.json` — `{updatedAt, llmProvider, sourceCounts, weekKey, counts}`
- 오늘(08-18) 기준 아직 안 끝난 event **264/314**. **curated 12개 중 살아 있는 것은 2개뿐**(`sc-1b5o7t2`, `sc-1z05tw` — 나머지 10개는 광복절 주간 단발 행사). 홈 보충 규칙이 반드시 동작해야 하는 이유이고, 좋은 테스트 픽스처이기도 하다.
- event 필드 실측: imageUrl 314/314, lat·lng 314/314, district 274/314, linkUrl 308/314, fee 118/314, summary 39/314
- place 필드 실측: imageUrl 728/728, summary 728/728, lat·lng 710/728, subwayInfo 698/728, useTime 603/728, closedDays 444/728, linkUrl 550/728, `hours` 파싱 성공 517/728, **`district` 0/728 (없음 — `/explore` 선행 과제, 이번 범위 아님)**
- endDate가 오늘+2년을 넘는 event 6건 (예: `sc-1vbax94`의 `2626-08-08`, `sc-11jahml`의 `2099-12-31`) — "상시" 규칙의 실제 대상

---

## File Structure

| 경로 | 책임 |
|---|---|
| `src/types/files.ts` | 데이터 파일 스키마 4종 + 추론 타입 (`emit.ts`에서 순수 이동). 배치가 쓰는 스키마와 앱이 읽는 스키마가 같은 하나 |
| `src/data/load.ts` | `loadMeta` / `loadWeek` / `loadPlaces` / `loadCurated` — Node `fs` + zod 검증. 빌드 타임 전용 |
| `src/data/resolve.ts` | `resolveCurated` — curated의 id를 실제 아이템으로 해석. 못 찾는 id는 조용히 버림 |
| `src/lib/dates.ts` | `formatDateRange`(상시 규칙 포함), `formatUpdatedAt` |
| `src/lib/colors.ts` | `categoryColor` — 결정론적 카테고리→색 |
| `src/lib/open-now.ts` | `isOpenNow` — KST 기준 영업 중 판정 |
| `src/lib/home.ts` | `pickHomeItems` — 살아 있는 curated 우선 + 오늘 기준 정렬 보충으로 12개 |
| `src/router.tsx` | TanStack Router 인스턴스 |
| `src/routes/__root.tsx` | 문서 셸(html/head/body), 404 컴포넌트 |
| `src/routes/index.tsx` | 홈. 정적 서버 함수 `getHomeData` + 화면 |
| `src/routes/e/$id.tsx` | 상세. 정적 서버 함수 `getDetail` + 화면 |
| `src/components/ItemImage.tsx` | 이미지 + `onError` 카테고리 색 블록 폴백 |
| `src/components/OpenNowBadge.tsx` | "지금 열림" 배지 (hydration 이후에만) |
| `src/components/cards.tsx` | `BigEventCard` / `CompactEventRow` / `PlaceCard` — 홈 전용 카드 3종 (함께 바뀌므로 한 파일) |
| `src/styles/app.css` | Tailwind 엔트리 |
| `vite.config.ts` | Start 플러그인 + 프리렌더 설정 |

배치 코드(`src/pipeline/`, `src/sources/`, `src/llm/`, `scripts/`)는 Task 1의 import 경로 변경 외에 손대지 않는다.

---

## Task 0: TanStack Start 스캐폴드 + 프리렌더 빌드 시간 측정

앱 껍데기를 세우고 **프리렌더 빌드가 실제로 돌아가는지, 얼마나 걸리는지**를 먼저 잰다. 이 태스크만 TDD가 아니라 스파이크성이다 — 산출물은 "빌드가 되고, 시간이 감당된다"는 확인이다. 빌드 시간이 감당이 안 되면 place 상세 6페이지를 줄이는 것이 대비책인데, 그 판단은 마지막이 아니라 여기서 미리 기준을 잡아야 한다.

**Files:**
- Create: `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`(임시), `src/styles/app.css`, `vite.config.ts`
- Modify: `package.json`(스크립트·의존성), `tsconfig.json`(jsx·DOM lib), `.gitignore`(`src/routeTree.gen.ts`)

**Interfaces:**
- Consumes: 없음
- Produces: `npm run dev` / `npm run build` 스크립트. 이후 모든 UI 태스크가 이 스캐폴드 위에서 돈다. 빌드 산출 디렉토리 확정(위 확인 목록 #6)

- [ ] **Step 1: 의존성 설치**

```bash
npm i react react-dom @tanstack/react-start @tanstack/react-router
npm i -D vite @vitejs/plugin-react @types/react @types/react-dom tailwindcss @tailwindcss/vite
npm i @tanstack/start-static-server-functions
```

`@tanstack/start-static-server-functions`가 설치되지 않거나 이름이 다르면 **확인 목록 #2를 먼저 해소한다** — 설치 버전의 static-server-functions 가이드를 열어 패키지 이름과 import 경로를 확인한다.

- [ ] **Step 2: `vite.config.ts` 작성**

```ts
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3000 }, // 검증 단계의 curl들이 3000을 가정한다
  resolve: {
    // vitest.config.ts와 같은 수동 alias. vite-tsconfig-paths 의존성을 하나 아낀다
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        // 홈이 링크하는 상세 18페이지를 크롤로 줍는다 — 프리렌더 범위 "홈이 링크하는 것만"(스펙 10-5)의 구현.
        // 링크가 없는 id는 크롤되지 않으므로 자동으로 404가 된다
        crawlLinks: true,
        // 상세 한 페이지가 깨졌는데 조용히 넘어가면 배포 후에야 안다. 빌드에서 깨뜨린다
        failOnError: true,
      },
    }),
    // react 플러그인은 start 플러그인 뒤에 와야 한다 (공식 문서)
    viteReact(),
  ],
})
```

**vitest와의 관계**: `vitest.config.ts`가 별도로 있으므로 vitest는 이 파일을 읽지 않는다(vitest.config가 vite.config보다 우선). 테스트가 Start 플러그인을 끌고 오지 않는다.

- [ ] **Step 3: `package.json`에 스크립트 추가**

기존 `scripts`에 병합한다:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  }
}
```

- [ ] **Step 4: `tsconfig.json`에 JSX·DOM 설정 추가**

`compilerOptions`에 병합한다 (기존 키는 유지):

```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx"
  }
}
```

배치 코드는 DOM lib가 추가돼도 영향이 없다 — lib는 타입 가용성만 넓힌다.

- [ ] **Step 5: `.gitignore`에 생성 파일 추가**

`.gitignore` 끝에 추가:

```
# TanStack Router가 dev/build 때마다 재생성
src/routeTree.gen.ts
```

- [ ] **Step 6: Tailwind 엔트리 작성**

`src/styles/app.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 7: 라우터와 루트 라우트 작성**

`src/router.tsx` (export 이름은 확인 목록 #5 — 설치 버전 문서와 대조):

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

`src/routes/__root.tsx`:

```tsx
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '서울치 — 이번 주 서울' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body className="bg-white text-gray-900">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** 링크되지 않은 id는 페이지를 만들지 않는다(스펙 10-5). 그 id로 들어오면 여기로 온다 */
function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-bold">없는 페이지입니다</h1>
      <a href="/" className="mt-6 inline-block underline">홈으로</a>
    </main>
  )
}
```

`src/routes/index.tsx` (임시 — Task 10에서 교체):

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <main className="p-4 text-lg font-bold">서울치</main>
}
```

- [ ] **Step 8: dev 서버 확인**

Run: `npm run dev` → 브라우저(또는 `curl -s http://localhost:3000`)로 `서울치`가 보이는지 확인 후 중단.
CLI로 하려면:

```bash
npm run dev & DEV_PID=$!; sleep 8
curl -s http://localhost:3000 | grep -c '서울치'
kill $DEV_PID
```

Expected: `1` 이상

- [ ] **Step 9: 프리렌더 빌드 시간 측정 (확인 단계)**

```bash
time npm run build
```

기록할 것:
1. **총 소요 시간.** 지금은 1페이지지만 고정 비용(플러그인 초기화, 서버 번들 빌드)이 대부분이다. 페이지당 증분은 Task 11에서 19페이지로 재측정해 비교한다.
2. **빌드 산출 디렉토리** (`dist/` 또는 `.output/` — 빌드 로그에 찍힌다). 이후 태스크의 검증 명령은 이 경로를 쓴다. 아래 태스크들에서는 `dist/`로 표기했다 — 다르면 치환한다.
3. 산출 디렉토리에 `index.html`이 있고 `서울치`가 들어 있는지: `grep -rl '서울치' dist/ | head`

**게이트:** 1페이지 빌드가 수 분을 넘으면 멈추고 원인을 본다(프리렌더가 아니라 설정 문제일 가능성이 크다). 페이지당 증분 비용이 커서 19페이지가 감당이 안 될 것으로 보이면 **대비책은 place 상세 6페이지 축소**다 — 그 결정은 스펙 10-5를 고친 뒤에 한다.

- [ ] **Step 10: 기존 테스트가 그대로 도는지 확인**

Run: `npm test`
Expected: PASS — 배치 테스트 전체가 초록. 스캐폴드가 기존 코드를 건드리지 않았다는 증거.

- [ ] **Step 11: 커밋**

```bash
git add package.json package-lock.json tsconfig.json .gitignore vite.config.ts src/router.tsx src/routes src/styles
git commit -m "chore: TanStack Start 스캐폴드와 프리렌더 설정

1차 배포는 홈+상세 19페이지만 SSG로 만든다. crawlLinks로 홈이 링크하는
상세만 프리렌더되므로 스펙 10-5의 범위가 설정 그 자체로 표현된다.
failOnError로 한 페이지라도 깨지면 빌드가 깨진다 — 조용한 배포 사고 방지.
빌드 시간 실측: (여기에 기록)"
```

---

## Task 1: 파일 스키마를 `src/types/files.ts`로 이동 (순수 이동)

**배치를 건드리는 유일한 태스크.** `emit.ts` 안의 `weeklyEventsSchema` / `placesFileSchema` / `curatedFileSchema` / `metaSchema`를 타입 전용 모듈로 옮긴다. 근거(스펙 11장): 앱이 `emit.ts`에서 스키마를 import하면 앱 빌드가 배치 파이프라인 모듈(`~/pipeline/curate`, `~/sources/types`까지)을 끌고 온다. **배치가 쓰는 스키마와 앱이 읽는 스키마가 같은 하나**여야 하므로 복사가 아니라 이동이다. 동작 변화가 없으므로 새 테스트를 쓰지 않는다 — 기존 emit 테스트가 게이트다.

**Files:**
- Create: `src/types/files.ts`
- Modify: `src/pipeline/emit.ts` (스키마 정의 삭제 + import로 교체)

**Interfaces:**
- Consumes: `eventItemSchema`, `placeItemSchema` (`~/types/item`)
- Produces: `weeklyEventsSchema`, `placesFileSchema`, `curatedFileSchema`, `metaSchema`, `weekKeySchema` (zod 스키마) / `WeeklyEventsFile`, `PlacesFile`, `CuratedFile`, `MetaFile` (타입) — Task 2의 로더가 이걸 쓴다

- [ ] **Step 1: 이동 전 전체 테스트가 초록인지 확인**

Run: `npm test`
Expected: PASS. 리팩터링의 기준선.

- [ ] **Step 2: `src/types/files.ts` 작성**

`emit.ts`의 스키마 4종 + `weekKeySchema`를 **그대로** 옮기고, 앱이 쓸 추론 타입을 추가한다:

```ts
import { z } from 'zod'
import { eventItemSchema, placeItemSchema } from '~/types/item'

export const weekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/)

export const weeklyEventsSchema = z.object({
  weekKey: weekKeySchema,
  items: z.array(eventItemSchema),
})

export const placesFileSchema = z.object({
  items: z.array(placeItemSchema),
})

export const curatedFileSchema = z.object({
  weekKey: weekKeySchema,
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
  places: z.array(z.string()),
})

export const metaSchema = z.object({
  updatedAt: z.string(),
  llmProvider: z.string(),
  sourceCounts: z.record(z.string(), z.number()),
  weekKey: weekKeySchema,
  counts: z.object({ events: z.number(), places: z.number() }),
})

export type WeeklyEventsFile = z.infer<typeof weeklyEventsSchema>
export type PlacesFile = z.infer<typeof placesFileSchema>
export type CuratedFile = z.infer<typeof curatedFileSchema>
export type MetaFile = z.infer<typeof metaSchema>
```

- [ ] **Step 3: `emit.ts`에서 정의를 지우고 import로 교체**

`src/pipeline/emit.ts`에서 `weekKeySchema`와 스키마 4종의 정의(파일 상단 `const weekKeySchema…`부터 `export const metaSchema…` 블록까지)를 삭제하고, import에 추가한다:

```ts
import {
  curatedFileSchema,
  metaSchema,
  placesFileSchema,
  weeklyEventsSchema,
} from '~/types/files'
```

`emit.ts`의 `import { z } from 'zod'`는 더 이상 쓰이지 않으면 함께 지운다. 나머지 코드(`emit` 함수, 참조 무결성 검사)는 한 글자도 바꾸지 않는다.

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS — Step 1과 같은 결과. 특히 `tests/pipeline/emit.test.ts`와 `tests/pipeline/run.test.ts`가 그대로 초록이면 순수 이동이 증명된다.

- [ ] **Step 5: 커밋**

```bash
git add src/types/files.ts src/pipeline/emit.ts
git commit -m "refactor: 데이터 파일 스키마를 src/types/files.ts로 이동

앱이 emit.ts에서 스키마를 import하면 배치 파이프라인 모듈이 앱 빌드에
끌려온다. 타입 전용 모듈로 옮기고 emit이 거기서 import한다.
배치가 쓰는 스키마와 앱이 읽는 스키마가 같은 하나 — 복사가 아니라 이동.
동작 변화 없음, 기존 emit 테스트가 게이트."
```

---

## Task 2: 데이터 로더 `src/data/load.ts`

`data/*.json`을 읽는 곳을 한 군데로 모은다(스펙 11장). Node `fs`로 읽고 zod로 검증한다 — 배치가 쓴 파일이라도 앱은 읽을 때 다시 검증한다. 다른 브랜치/체크아웃에서 손으로 고친 JSON이 조용히 이상한 화면을 만드는 것보다 빌드가 깨지는 게 낫다(emit과 같은 태도).

**빌드 타임 전용이다.** 이 모듈은 정적 서버 함수 핸들러와 테스트에서만 import한다. 클라이언트 코드가 import하면 `node:fs` 때문에 번들이 깨진다 — 그것이 의도된 안전장치다.

**Files:**
- Create: `src/data/load.ts`
- Test: `tests/data/load.test.ts`

**Interfaces:**
- Consumes: `metaSchema`, `weeklyEventsSchema`, `placesFileSchema`, `curatedFileSchema` + 타입들 (`~/types/files`, Task 1)
- Produces:
  - `loadMeta(dataDir?: string): MetaFile`
  - `loadWeek(weekKey: string, dataDir?: string): WeeklyEventsFile`
  - `loadPlaces(dataDir?: string): PlacesFile`
  - `loadCurated(weekKey: string, dataDir?: string): CuratedFile`
  - `dataDir` 기본값은 `'data'` — 빌드는 레포 루트에서 돈다. 테스트는 임시 디렉토리를 넘긴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/data/load.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCurated, loadMeta, loadPlaces, loadWeek } from '~/data/load'

const validEvent = {
  id: 'sc-1',
  source: 'seoul-culture',
  kind: 'event',
  title: '행사',
  category: '전시/미술',
  place: '어딘가',
  startDate: '2026-08-17',
  endDate: '2026-08-23',
}

const validPlace = {
  id: 'vs-KOP1',
  source: 'visit-seoul',
  kind: 'place',
  title: '장소',
  category: '문화관광',
  place: '어딘가',
}

const validMeta = {
  updatedAt: '2026-08-14T10:59:22.232Z',
  llmProvider: 'rule',
  sourceCounts: { 'seoul-culture': 1 },
  weekKey: '2026-W34',
  counts: { events: 1, places: 1 },
}

describe('data 로더', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'seoulchi-load-'))
    await mkdir(join(dir, 'events'), { recursive: true })
    await mkdir(join(dir, 'curated'), { recursive: true })
    await writeFile(join(dir, 'meta.json'), JSON.stringify(validMeta))
    await writeFile(
      join(dir, 'events', '2026-W34.json'),
      JSON.stringify({ weekKey: '2026-W34', items: [validEvent] }),
    )
    await writeFile(join(dir, 'places.json'), JSON.stringify({ items: [validPlace] }))
    await writeFile(
      join(dir, 'curated', '2026-W34.json'),
      JSON.stringify({ weekKey: '2026-W34', picks: [{ id: 'sc-1', reason: '' }], places: ['vs-KOP1'] }),
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loadMeta가 meta.json을 검증하며 읽는다', () => {
    expect(loadMeta(dir).weekKey).toBe('2026-W34')
  })

  it('loadWeek가 주차 파일을 읽는다', () => {
    const week = loadWeek('2026-W34', dir)
    expect(week.items).toHaveLength(1)
    expect(week.items[0]!.id).toBe('sc-1')
  })

  it('loadPlaces가 places.json을 읽는다', () => {
    expect(loadPlaces(dir).items[0]!.kind).toBe('place')
  })

  it('loadCurated가 큐레이션 파일을 읽는다', () => {
    const curated = loadCurated('2026-W34', dir)
    expect(curated.picks).toHaveLength(1)
    expect(curated.places).toEqual(['vs-KOP1'])
  })

  it('스키마가 어긋나면 던진다 — 조용히 이상한 화면을 만들지 않는다', async () => {
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ updatedAt: 1 }))
    expect(() => loadMeta(dir)).toThrow()
  })

  it('파일이 없으면 던진다 — 없는 주차를 읽으려는 실수가 빌드에서 드러난다', () => {
    expect(() => loadWeek('2026-W01', dir)).toThrow()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/data/load.test.ts`
Expected: FAIL — `Failed to resolve import "~/data/load"`

- [ ] **Step 3: 구현**

`src/data/load.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  curatedFileSchema,
  metaSchema,
  placesFileSchema,
  weeklyEventsSchema,
  type CuratedFile,
  type MetaFile,
  type PlacesFile,
  type WeeklyEventsFile,
} from '~/types/files'

/**
 * 빌드 타임 전용. 정적 서버 함수 핸들러와 테스트에서만 import할 것.
 * 클라이언트 코드가 import하면 node:fs 때문에 번들이 깨진다 — 의도된 안전장치다.
 *
 * dataDir 기본값 'data'는 레포 루트 기준 상대 경로다(resolve가 cwd 기준으로 푼다).
 * 빌드는 항상 레포 루트에서 돌므로 성립한다. 테스트는 절대 경로를 넘긴다.
 */
function readJson(dataDir: string, ...segments: string[]): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, ...segments), 'utf8'))
}

export function loadMeta(dataDir = 'data'): MetaFile {
  return metaSchema.parse(readJson(dataDir, 'meta.json'))
}

export function loadWeek(weekKey: string, dataDir = 'data'): WeeklyEventsFile {
  return weeklyEventsSchema.parse(readJson(dataDir, 'events', `${weekKey}.json`))
}

export function loadPlaces(dataDir = 'data'): PlacesFile {
  return placesFileSchema.parse(readJson(dataDir, 'places.json'))
}

export function loadCurated(weekKey: string, dataDir = 'data'): CuratedFile {
  return curatedFileSchema.parse(readJson(dataDir, 'curated', `${weekKey}.json`))
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/data/load.test.ts`
Expected: PASS (6개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/data/load.ts tests/data/load.test.ts
git commit -m "feat: 데이터 파일 로더 추가

data/*.json을 읽는 곳을 src/data 한 군데로 모은다. 읽을 때도 zod로
재검증한다 — 손으로 고친 JSON이 조용히 이상한 화면을 만드는 것보다
빌드가 깨지는 게 낫다. Node fs를 쓰므로 클라이언트가 import하면
번들이 깨진다. 그것이 'JSON을 브라우저에 넣지 않는다'의 안전장치다."
```

---

## Task 3: `resolveCurated` — curated id를 아이템으로 해석

`curated/*.json`은 id만 담는다. 앱은 그 id를 주간 이벤트/places에서 찾아 실제 아이템으로 바꾼다. **못 찾는 id는 조용히 버린다** — emit이 참조 무결성을 보장하지만, 그건 같은 배치가 쓴 파일 세대 안에서의 이야기다. 파일 세대가 어긋난 체크아웃에서도 홈은 깨지지 말아야 한다. 배치의 환각 방어("후보에 없는 id는 버린다")의 앱 쪽 대응이다. 부족분은 Task 7의 `pickHomeItems`가 채우므로 화면은 비지 않는다.

**Files:**
- Create: `src/data/resolve.ts`
- Test: `tests/data/resolve.test.ts`

**Interfaces:**
- Consumes: `CuratedFile` (`~/types/files`), `EventItem`, `PlaceItem` (`~/types/item`)
- Produces:
  - `interface ResolvedCurated { picks: Array<{ item: EventItem; reason: string }>; places: PlaceItem[] }`
  - `resolveCurated(curated: CuratedFile, events: EventItem[], places: PlaceItem[]): ResolvedCurated`
  - Task 7·10이 `picks`를, Task 10이 `places`를 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/data/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveCurated } from '~/data/resolve'
import type { CuratedFile } from '~/types/files'
import type { EventItem, PlaceItem } from '~/types/item'

function ev(id: string): EventItem {
  return {
    id,
    source: 'seoul-culture',
    kind: 'event',
    title: `행사 ${id}`,
    category: '전시/미술',
    place: '어딘가',
    startDate: '2026-08-17',
    endDate: '2026-08-23',
  }
}

function pl(id: string): PlaceItem {
  return {
    id,
    source: 'visit-seoul',
    kind: 'place',
    title: `장소 ${id}`,
    category: '문화관광',
    place: '어딘가',
  }
}

const events = [ev('sc-1'), ev('sc-2')]
const places = [pl('vs-KOP1'), pl('vs-KOP2')]

describe('resolveCurated', () => {
  it('picks를 curated 순서대로, reason을 붙여 해석한다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [
        { id: 'sc-2', reason: '두 번째 코멘트' },
        { id: 'sc-1', reason: '' },
      ],
      places: [],
    }
    const resolved = resolveCurated(curated, events, places)
    expect(resolved.picks.map((p) => p.item.id)).toEqual(['sc-2', 'sc-1'])
    expect(resolved.picks[0]!.reason).toBe('두 번째 코멘트')
    // 규칙 배치(LLM_PROVIDER=rule)의 빈 reason도 그대로 통과한다 — 렌더 측이 접는다
    expect(resolved.picks[1]!.reason).toBe('')
  })

  it('이벤트에 없는 pick id는 조용히 버린다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [{ id: 'sc-없음', reason: 'x' }, { id: 'sc-1', reason: 'y' }],
      places: [],
    }
    const resolved = resolveCurated(curated, events, places)
    expect(resolved.picks.map((p) => p.item.id)).toEqual(['sc-1'])
  })

  it('places를 id 순서대로 해석한다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [],
      places: ['vs-KOP2', 'vs-KOP1'],
    }
    const resolved = resolveCurated(curated, events, places)
    expect(resolved.places.map((p) => p.id)).toEqual(['vs-KOP2', 'vs-KOP1'])
  })

  it('places에 없는 id는 조용히 버린다', () => {
    const curated: CuratedFile = {
      weekKey: '2026-W34',
      picks: [],
      places: ['vs-없음', 'vs-KOP1'],
    }
    expect(resolveCurated(curated, events, places).places.map((p) => p.id)).toEqual(['vs-KOP1'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/data/resolve.test.ts`
Expected: FAIL — `Failed to resolve import "~/data/resolve"`

- [ ] **Step 3: 구현**

`src/data/resolve.ts`:

```ts
import type { CuratedFile } from '~/types/files'
import type { EventItem, PlaceItem } from '~/types/item'

export interface ResolvedCurated {
  picks: Array<{ item: EventItem; reason: string }>
  places: PlaceItem[]
}

/**
 * curated의 id를 실제 아이템으로 해석한다. 못 찾는 id는 조용히 버린다 —
 * emit의 참조 무결성은 같은 배치 세대 안에서만 보장되므로,
 * 세대가 어긋난 체크아웃에서도 홈이 깨지지 않게 한다.
 * 부족분은 pickHomeItems가 정렬 순으로 채운다(화면은 절대 비지 않는다).
 */
export function resolveCurated(
  curated: CuratedFile,
  events: EventItem[],
  places: PlaceItem[],
): ResolvedCurated {
  const eventById = new Map(events.map((e) => [e.id, e]))
  const placeById = new Map(places.map((p) => [p.id, p]))

  return {
    picks: curated.picks.flatMap((pick) => {
      const item = eventById.get(pick.id)
      return item ? [{ item, reason: pick.reason }] : []
    }),
    places: curated.places.flatMap((id) => {
      const item = placeById.get(id)
      return item ? [item] : []
    }),
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/data/resolve.test.ts`
Expected: PASS (4개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/data/resolve.ts tests/data/resolve.test.ts
git commit -m "feat: curated id를 아이템으로 해석하는 resolveCurated 추가

못 찾는 id는 조용히 버린다. emit의 참조 무결성은 같은 배치 세대
안에서만 보장되므로 세대가 어긋난 체크아웃 방어가 필요하다.
배치의 환각 방어(후보에 없는 id 폐기)의 앱 쪽 대응."
```

---

## Task 4: 날짜 표기 `formatDateRange` / `formatUpdatedAt`

스펙 10-6의 구현. 시작일과 종료일이 같으면 `8/15(토)`, 다르면 `8/15(토) – 8/30(일)`. **종료일이 오늘로부터 2년을 넘으면 "상시"** — 원본에 `2626-08-08`, `2099-12-31` 같은 오타가 실측 6건 섞여 있고, 원본을 고칠 수 없으므로 표시 단계에서 막는다. `today`는 인자다.

헤더의 갱신 시각 표기(`formatUpdatedAt`)도 여기 둔다 — 같은 "날짜를 사람에게 보여주는" 책임이다.

**Files:**
- Create: `src/lib/dates.ts`
- Test: `tests/lib/dates.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `formatDateRange(start: string, end: string, today: string): string` — 인자는 전부 `YYYY-MM-DD`(KST 달력 날짜)
  - `formatUpdatedAt(iso: string): string` — `'8/14 19:59 갱신'`. 인자는 `meta.updatedAt`(ISO 순간)
  - Task 9·10의 화면이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDateRange, formatUpdatedAt } from '~/lib/dates'

const TODAY = '2026-08-18'

describe('formatDateRange', () => {
  it('시작일과 종료일이 같으면 하루로 표기한다', () => {
    expect(formatDateRange('2026-08-15', '2026-08-15', TODAY)).toBe('8/15(토)')
  })

  it('다르면 범위로 표기한다', () => {
    expect(formatDateRange('2026-08-15', '2026-08-30', TODAY)).toBe('8/15(토) – 8/30(일)')
  })

  it('해를 넘는 범위도 요일이 맞는다', () => {
    expect(formatDateRange('2026-12-31', '2027-01-01', TODAY)).toBe('12/31(목) – 1/1(금)')
  })

  it('종료일이 오늘로부터 2년을 넘으면 상시로 표기한다 (원본 오타 방어)', () => {
    expect(formatDateRange('2026-08-01', '2626-08-08', TODAY)).toBe('상시')
    expect(formatDateRange('2026-08-01', '2099-12-31', TODAY)).toBe('상시')
  })

  it('정확히 2년 뒤는 상시가 아니다 — 초과만 상시다', () => {
    expect(formatDateRange('2026-08-01', '2028-08-18', TODAY)).toContain('8/18')
    expect(formatDateRange('2026-08-01', '2028-08-19', TODAY)).toBe('상시')
  })
})

describe('formatUpdatedAt', () => {
  it('ISO 순간을 KST로 바꿔 표기한다', () => {
    expect(formatUpdatedAt('2026-08-14T10:59:22.232Z')).toBe('8/14 19:59 갱신')
  })

  it('KST 변환이 날짜를 넘기는 경우', () => {
    expect(formatUpdatedAt('2026-08-14T16:30:00Z')).toBe('8/15 01:30 갱신')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/dates.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/dates"`

- [ ] **Step 3: 구현**

`src/lib/dates.ts`:

```ts
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 'YYYY-MM-DD'(KST 달력 날짜) → '8/15(토)'. UTC로 만들어 읽으므로 실행 환경 타임존과 무관하다 */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  return `${m}/${d}(${WEEKDAYS[weekday]!})`
}

/**
 * 스펙 10-6. 종료일이 오늘로부터 2년을 넘으면 '상시' —
 * 원본에 2626-08-08, 2099-12-31 같은 오타가 소수 섞여 있다(실측 6건).
 * 비교는 문자열로 한다. YYYY-MM-DD는 사전순 == 시간순이고,
 * 연도에 +2만 하므로 존재하지 않는 날짜(예: 윤일)가 나와도 비교에는 지장이 없다.
 */
export function formatDateRange(start: string, end: string, today: string): string {
  const permanentLimit = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`
  if (end > permanentLimit) return '상시'
  if (start === end) return formatDay(start)
  return `${formatDay(start)} – ${formatDay(end)}`
}

/** meta.updatedAt(ISO 순간) → '8/14 19:59 갱신' (KST). 데이터가 며칠 묵으면 사용자가 알아챌 수 있어야 한다 */
export function formatUpdatedAt(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${hh}:${mm} 갱신`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/dates.test.ts`
Expected: PASS (7개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dates.ts tests/lib/dates.test.ts
git commit -m "feat: 날짜 표기 유틸 추가 (상시 규칙 포함)

종료일이 오늘로부터 2년을 넘으면 기간 대신 '상시'로 표기한다.
원본에 2626-08 같은 오타가 실측 6건 있고 원본은 고칠 수 없으므로
표시 단계에서 막는다. today는 인자 — 실행 날짜에 따라 결과가
바뀌면 테스트가 깨진다는 레포 규칙."
```

---

## Task 5: `categoryColor` — 결정론적 카테고리 색

이미지 로드 실패 시 폴백 블록의 색이다. **결정론적이어야 한다** — 같은 카테고리가 리렌더마다 다른 색이 되면 깜빡이며 색이 바뀌고, 홈과 상세에서 같은 항목이 다른 색이 된다. 서울시 `MAIN_IMG`는 100% 존재하지만(api-findings) 원격 이미지 서버가 개별 이미지를 못 줄 수는 있으므로 폴백 경로는 스펙(14장 #3)대로 남긴다.

**Files:**
- Create: `src/lib/colors.ts`
- Test: `tests/lib/colors.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `categoryColor(category: string): string` — `#rrggbb` hex. Task 9의 `ItemImage`가 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { categoryColor } from '~/lib/colors'

describe('categoryColor', () => {
  it('같은 카테고리는 항상 같은 색이다 (결정론)', () => {
    expect(categoryColor('전시/미술')).toBe(categoryColor('전시/미술'))
  })

  it('hex 색을 반환한다', () => {
    expect(categoryColor('전시/미술')).toMatch(/^#[0-9a-f]{6}$/)
    expect(categoryColor('축제')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('빈 문자열도 색을 준다 (category는 필수지만 방어)', () => {
    expect(categoryColor('')).toMatch(/^#[0-9a-f]{6}$/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/colors.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/colors"`

- [ ] **Step 3: 구현**

`src/lib/colors.ts`:

```ts
/** Tailwind 600 톤 8색. 이미지 폴백 블록이 본문 텍스트와 싸우지 않을 만큼 진하다 */
const PALETTE = [
  '#dc2626', // red-600
  '#ea580c', // orange-600
  '#ca8a04', // yellow-600
  '#16a34a', // green-600
  '#0d9488', // teal-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
] as const

/**
 * 카테고리 → 색. 해시가 결정론적이라 같은 카테고리는 항상 같은 색 —
 * 리렌더·페이지 간에 색이 튀지 않는다. 이미지 로드 실패 폴백에 쓴다.
 */
export function categoryColor(category: string): string {
  let hash = 0
  for (const ch of category) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return PALETTE[hash % PALETTE.length]!
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/colors.test.ts`
Expected: PASS (3개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/colors.ts tests/lib/colors.test.ts
git commit -m "feat: 결정론적 카테고리 색 매핑 추가

이미지 로드 실패 폴백 블록의 색. 결정론적이어야 같은 카테고리가
리렌더·페이지 간에 같은 색으로 보인다."
```

---

## Task 6: `isOpenNow` — KST 기준 영업 중 판정

"지금 열림" 배지의 두뇌. **`now`를 인자로 받는 순수 함수**이고, `new Date()`는 배지 컴포넌트의 effect(브라우저)에서만 부른다. 판정은 KST 기준이다 — 사용자는 서울에 있고 데이터도 KST인데, 브라우저 타임존으로 계산하면 해외 접속에서 틀린다.

`ParsedHours`의 규약(배치의 `src/lib/hours.ts`, `src/types/item.ts`에서 확정):
- `closedWeekdays`: **0=일요일 … 6=토요일** (JS `getDay()` 규약)
- `open`/`close`: `'HH:MM'`. 상시 개방은 `'00:00'~'24:00'`으로 들어온다
- 파서가 `18:00~02:00` 같은 원문에서 `close < open`을 낼 수 있으므로 자정 넘김도 다룬다

**Files:**
- Create: `src/lib/open-now.ts`
- Test: `tests/lib/open-now.test.ts`

**Interfaces:**
- Consumes: `ParsedHours` (`~/types/item`)
- Produces: `isOpenNow(hours: ParsedHours | null | undefined, now: Date): boolean` — Task 9의 `OpenNowBadge`가 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/open-now.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isOpenNow } from '~/lib/open-now'
import type { ParsedHours } from '~/types/item'

const daytime: ParsedHours = { open: '10:00', close: '18:00', closedWeekdays: [1] }

/** KST 2026-08-18(화) 14:00 = UTC 05:00 — 테스트는 순간(UTC)으로 고정한다 */
const TUE_14_KST = new Date('2026-08-18T05:00:00Z')

describe('isOpenNow', () => {
  it('영업시간 안이면 true', () => {
    expect(isOpenNow(daytime, TUE_14_KST)).toBe(true)
  })

  it('개점 전이면 false', () => {
    // KST 화 09:59 = UTC 00:59
    expect(isOpenNow(daytime, new Date('2026-08-18T00:59:00Z'))).toBe(false)
  })

  it('폐점 시각 정각은 false (close는 배타)', () => {
    // KST 화 18:00 = UTC 09:00
    expect(isOpenNow(daytime, new Date('2026-08-18T09:00:00Z'))).toBe(false)
  })

  it('휴무 요일이면 시간과 무관하게 false', () => {
    // KST 2026-08-17(월) 14:00 = UTC 05:00, closedWeekdays=[1]=월
    expect(isOpenNow(daytime, new Date('2026-08-17T05:00:00Z'))).toBe(false)
  })

  it('요일 판정도 KST다 — UTC로는 화요일 저녁이 KST로는 수요일 새벽', () => {
    const closedWed: ParsedHours = { open: '00:00', close: '24:00', closedWeekdays: [3] }
    // KST 2026-08-19(수) 01:00 = UTC 2026-08-18(화) 16:00
    expect(isOpenNow(closedWed, new Date('2026-08-18T16:00:00Z'))).toBe(false)
  })

  it("상시 개방('00:00'~'24:00')은 밤 늦게도 true", () => {
    const always: ParsedHours = { open: '00:00', close: '24:00', closedWeekdays: [] }
    // KST 화 23:59 = UTC 14:59
    expect(isOpenNow(always, new Date('2026-08-18T14:59:00Z'))).toBe(true)
  })

  it('null이면 false — 파싱 실패는 배지를 띄우지 않고 원문을 보여준다', () => {
    expect(isOpenNow(null, TUE_14_KST)).toBe(false)
    expect(isOpenNow(undefined, TUE_14_KST)).toBe(false)
  })

  describe('자정을 넘기는 시간대 (18:00~02:00)', () => {
    const overnight: ParsedHours = { open: '18:00', close: '02:00', closedWeekdays: [] }

    it('밤이면 true', () => {
      // KST 화 20:00 = UTC 11:00
      expect(isOpenNow(overnight, new Date('2026-08-18T11:00:00Z'))).toBe(true)
    })

    it('자정 지난 새벽이면 true', () => {
      // KST 수 01:00 = UTC 화 16:00
      expect(isOpenNow(overnight, new Date('2026-08-18T16:00:00Z'))).toBe(true)
    })

    it('낮이면 false', () => {
      expect(isOpenNow(overnight, TUE_14_KST)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/open-now.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/open-now"`

- [ ] **Step 3: 구현**

`src/lib/open-now.ts`:

```ts
import type { ParsedHours } from '~/types/item'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * KST 기준 '지금 열려 있는가'. now는 인자다 — 내부에서 new Date()를 부르면
 * 테스트가 실행 시각에 따라 깨진다(레포 규칙). new Date()는 OpenNowBadge의
 * effect(브라우저 경계)에서만 부른다.
 *
 * 판정을 브라우저 타임존이 아니라 KST로 하는 이유: 장소는 서울에 있다.
 * 해외에서 접속해도 '서울 기준 지금'이 맞는 답이다.
 *
 * hours가 null/undefined면 false — 파싱 실패는 배지 없이 원문 노출(스펙 6장).
 */
export function isOpenNow(hours: ParsedHours | null | undefined, now: Date): boolean {
  if (!hours) return false

  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const weekday = kst.getUTCDay() // 0=일 … 6=토 — closedWeekdays와 같은 규약
  if (hours.closedWeekdays.includes(weekday)) return false

  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}` // 'HH:MM'끼리는 사전순 == 시간순

  if (hours.open < hours.close) return hours.open <= time && time < hours.close
  if (hours.open === hours.close) return false // 폭 0짜리 시간대 — 정보 없음과 같다
  // close < open: 자정을 넘기는 시간대 (예: 18:00~02:00)
  return time >= hours.open || time < hours.close
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/open-now.test.ts`
Expected: PASS (10개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/open-now.ts tests/lib/open-now.test.ts
git commit -m "feat: KST 기준 영업 중 판정 isOpenNow 추가

'지금 열림' 배지의 두뇌. now를 인자로 받는 순수 함수이고
new Date()는 배지 컴포넌트의 브라우저 경계에서만 부른다.
장소가 서울에 있으므로 판정은 브라우저 타임존이 아니라 KST."
```

---

## Task 7: `pickHomeItems` — 홈 12자리 채우기

홈 노출 순서의 구현(스펙 10-1). **큐레이션은 오늘과 어긋날 수 있다** — `curated/*.json`은 배치가 돈 시점의 판단이라, 배치가 하루라도 밀리면 단발 행사부터 죽는다. 실측: 2026-W33 curated 12개 중 08-18 시점에 살아 있는 것은 **2개**뿐이었다. 그래서:

1. `endDate < 오늘`은 제외한다 (curated pick이라도).
2. 살아 있는 curated pick을 curated 순서대로 먼저 놓는다 — 코멘트가 붙어 있으므로.
3. 모자란 자리를 **`max(startDate, 오늘)` 오름차순, 동률이면 `endDate` 오름차순**으로 채워 12개를 맞춘다. 아직 시작 안 한 행사는 시작일 순, 이미 시작한 행사는 전부 오늘로 동률이 되어 마감 임박순 — 배치 `score`의 과거 컷오프와 같은 관용구(`max(주 시작일, 오늘)`)라 프로젝트 안에서 관용구가 하나로 유지된다.
4. 그래도 동률이면 `id` 오름차순 — 같은 입력이면 항상 같은 홈이 나온다(빌드 재현성).

**Files:**
- Create: `src/lib/home.ts`
- Test: `tests/lib/home.test.ts`

**Interfaces:**
- Consumes: `EventItem` (`~/types/item`), `ResolvedCurated['picks']` 꼴의 배열 (Task 3)
- Produces:
  - `interface HomeEntry { item: EventItem; reason: string }` — `reason`은 빈 문자열일 수 있고, 렌더 측이 접는다
  - `pickHomeItems(input: { events: EventItem[]; picks: Array<{ item: EventItem; reason: string }>; today: string; count?: number }): HomeEntry[]` — `count` 기본 12. Task 10의 홈이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/home.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pickHomeItems } from '~/lib/home'
import type { EventItem } from '~/types/item'

const TODAY = '2026-08-18'

function ev(id: string, startDate: string, endDate: string): EventItem {
  return {
    id,
    source: 'seoul-culture',
    kind: 'event',
    title: `행사 ${id}`,
    category: '전시/미술',
    place: '어딘가',
    startDate,
    endDate,
  }
}

describe('pickHomeItems', () => {
  it('endDate < 오늘인 항목은 제외한다', () => {
    const events = [ev('sc-끝남', '2026-08-10', '2026-08-16'), ev('sc-진행', '2026-08-10', '2026-08-23')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-진행'])
  })

  it('살아 있는 pick이 curated 순서대로 먼저, reason을 유지한 채 온다', () => {
    const a = ev('sc-a', '2026-08-20', '2026-08-21')
    const b = ev('sc-b', '2026-08-19', '2026-08-19')
    const out = pickHomeItems({
      events: [a, b],
      picks: [
        { item: a, reason: '코멘트 a' },
        { item: b, reason: '' },
      ],
      today: TODAY,
    })
    // 정렬대로면 b(19일)가 먼저지만, pick 순서가 이긴다
    expect(out.map((e) => e.item.id)).toEqual(['sc-a', 'sc-b'])
    expect(out[0]!.reason).toBe('코멘트 a')
    expect(out[1]!.reason).toBe('')
  })

  it('죽은 pick은 버리고 보충한다 — 실측: W33 picks 12개 중 08-18에 2개만 생존', () => {
    const dead = ev('sc-죽음', '2026-08-15', '2026-08-16')
    const alive = ev('sc-생존', '2026-08-10', '2026-08-23')
    const filler = ev('sc-보충', '2026-08-19', '2026-08-19')
    const out = pickHomeItems({
      events: [dead, alive, filler],
      picks: [
        { item: dead, reason: 'x' },
        { item: alive, reason: 'y' },
      ],
      today: TODAY,
    })
    expect(out.map((e) => e.item.id)).toEqual(['sc-생존', 'sc-보충'])
  })

  it('아직 시작 안 한 행사는 시작일 오름차순', () => {
    const events = [ev('sc-늦게', '2026-08-22', '2026-08-23'), ev('sc-곧', '2026-08-19', '2026-08-23')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-곧', 'sc-늦게'])
  })

  it('이미 시작한 행사끼리는 마감 임박순 — max(startDate, 오늘)이 전부 오늘로 동률', () => {
    const events = [ev('sc-여유', '2026-08-01', '2026-09-30'), ev('sc-임박', '2026-08-10', '2026-08-19')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-임박', 'sc-여유'])
  })

  it('이미 시작한 행사가 아직 시작 안 한 행사보다 먼저다 — 오늘 <= 미래 시작일', () => {
    const events = [ev('sc-미래', '2026-08-19', '2026-08-30'), ev('sc-진행중', '2026-08-01', '2026-08-30')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-진행중', 'sc-미래'])
  })

  it('완전 동률이면 id 오름차순 — 같은 입력이면 항상 같은 홈 (빌드 재현성)', () => {
    const events = [ev('sc-b', '2026-08-19', '2026-08-20'), ev('sc-a', '2026-08-19', '2026-08-20')]
    const out = pickHomeItems({ events, picks: [], today: TODAY })
    expect(out.map((e) => e.item.id)).toEqual(['sc-a', 'sc-b'])
  })

  it('기본 12개에서 자른다', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      ev(`sc-${String(i).padStart(2, '0')}`, '2026-08-19', '2026-08-23'),
    )
    expect(pickHomeItems({ events, picks: [], today: TODAY })).toHaveLength(12)
  })

  it('살아 있는 항목이 12개 미만이면 있는 만큼만 낸다', () => {
    const events = [ev('sc-1', '2026-08-19', '2026-08-23')]
    expect(pickHomeItems({ events, picks: [], today: TODAY })).toHaveLength(1)
  })

  it('보충된 항목의 reason은 빈 문자열이다', () => {
    const events = [ev('sc-1', '2026-08-19', '2026-08-23')]
    expect(pickHomeItems({ events, picks: [], today: TODAY })[0]!.reason).toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/home.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/home"`

- [ ] **Step 3: 구현**

`src/lib/home.ts`:

```ts
import type { EventItem } from '~/types/item'

export interface HomeEntry {
  item: EventItem
  /** 큐레이션 코멘트. 규칙 배치(LLM_PROVIDER=rule)에서는 빈 문자열 — 렌더 측이 그 줄을 접는다 */
  reason: string
}

/** max(startDate, today). 배치 score의 과거 컷오프와 같은 관용구 — 프로젝트에 관용구를 하나로 유지한다 */
function effectiveStart(item: EventItem, today: string): string {
  return item.startDate > today ? item.startDate : today
}

/**
 * 홈 12자리. 살아 있는 curated pick을 먼저 놓고(코멘트가 붙어 있으므로),
 * 모자란 자리를 max(startDate, 오늘) 오름차순 → endDate 오름차순 → id 오름차순으로 채운다.
 *
 * curated는 배치가 돈 시점의 판단이라 오늘과 어긋날 수 있다 —
 * 실측: 2026-W33 picks 12개 중 08-18 시점 생존 2개. 보충이 없으면 홈이 빈다.
 * "화면이 절대 비지 않는다"(스펙 8-1)의 앱 쪽 대응이다.
 */
export function pickHomeItems(input: {
  events: EventItem[]
  picks: Array<{ item: EventItem; reason: string }>
  today: string
  count?: number
}): HomeEntry[] {
  const { events, picks, today } = input
  const count = input.count ?? 12

  const alivePicks: HomeEntry[] = picks.filter(({ item }) => item.endDate >= today)
  const pickedIds = new Set(alivePicks.map(({ item }) => item.id))

  const fillers: HomeEntry[] = events
    .filter((e) => e.endDate >= today && !pickedIds.has(e.id))
    .sort(
      (a, b) =>
        effectiveStart(a, today).localeCompare(effectiveStart(b, today)) ||
        a.endDate.localeCompare(b.endDate) ||
        a.id.localeCompare(b.id),
    )
    .map((item) => ({ item, reason: '' }))

  return [...alivePicks, ...fillers].slice(0, count)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/home.test.ts`
Expected: PASS (10개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/home.ts tests/lib/home.test.ts
git commit -m "feat: 홈 12자리 선정 pickHomeItems 추가

curated는 배치 시점의 판단이라 오늘과 어긋난다 — 실측 W33 picks
12개 중 08-18 생존 2개. 살아 있는 pick을 먼저 놓고 모자란 자리를
max(startDate, 오늘) 오름차순(동률이면 마감 임박순, 그다음 id)으로
채워 화면이 절대 비지 않게 한다."
```

---

## Task 8: 실데이터 스모크 테스트

합성 픽스처가 아니라 **커밋된 `data/*.json` 그대로**를 파이프라인 전체(loadMeta → loadWeek/loadCurated/loadPlaces → resolveCurated → pickHomeItems)에 통과시켜, 홈이 요구하는 18개 id(event 12 + place 6)가 전부 해석되는지 본다. 빌드가 하는 일과 정확히 같은 경로다.

**이 테스트는 의도적으로 날짜에 묶여 있다.** `today`를 `kstToday(new Date())`로 잡는다 — 빌드가 그렇게 하기 때문이다. 배치가 몇 주 멈춰 데이터가 묵으면 살아 있는 이벤트가 12개 미만이 되어 이 테스트가 깨진다. 그건 오탐이 아니라 **홈도 그렇게 무너진다는 정확한 신호**다(순수 함수의 날짜 결정론 규칙과 충돌하지 않는다 — 순수 함수들은 전부 `today`를 인자로 받고, 여기서는 테스트가 곧 호출 경계다).

**Files:**
- Test: `tests/data/smoke.test.ts`

**Interfaces:**
- Consumes: Task 2·3·7의 모든 함수 + `kstToday` (`~/lib/week`)
- Produces: 없음 (검증만)

- [ ] **Step 1: 테스트 작성**

`tests/data/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadCurated, loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { resolveCurated } from '~/data/resolve'
import { pickHomeItems } from '~/lib/home'
import { kstToday } from '~/lib/week'

/**
 * 커밋된 data/*.json 실물로 홈의 데이터 경로 전체를 통과시킨다.
 * 의도적으로 오늘 날짜에 묶여 있다 — 빌드가 그렇게 하기 때문.
 * 배치가 멈춰 데이터가 묵으면 여기가 깨진다. 그게 정확한 신호다.
 */
describe('실데이터 스모크: 홈이 요구하는 18개 id가 전부 해석된다', () => {
  const meta = loadMeta()
  const week = loadWeek(meta.weekKey)
  const curated = loadCurated(meta.weekKey)
  const places = loadPlaces()
  const resolved = resolveCurated(curated, week.items, places.items)

  it('주간 파일의 weekKey가 meta와 일치한다', () => {
    expect(week.weekKey).toBe(meta.weekKey)
    expect(curated.weekKey).toBe(meta.weekKey)
  })

  it('curated places 6개가 전부 places.json에서 해석된다', () => {
    expect(curated.places).toHaveLength(6)
    expect(resolved.places).toHaveLength(6)
  })

  it('홈 12자리가 채워지고 전부 이미지가 있다', () => {
    const today = kstToday(new Date())
    const home = pickHomeItems({ events: week.items, picks: resolved.picks, today })
    expect(home).toHaveLength(12)
    // 카드 12장이 초라해지지 않는지 — 실측상 event 이미지 보유율 100%
    for (const { item } of home) expect(item.imageUrl).toBeTruthy()
  })

  it('place 6개 카드가 전부 이미지가 있다 — 배치의 자격 필터(스펙 10-1)가 지켜졌다', () => {
    for (const p of resolved.places) expect(p.imageUrl).toBeTruthy()
  })
})
```

- [ ] **Step 2: 통과 확인 (이 태스크는 기존 코드의 통합 검증이므로 red 단계가 없다)**

Run: `npx vitest run tests/data/smoke.test.ts`
Expected: PASS (4개 통과). 2026-W33 데이터 + 08-18 기준 살아 있는 이벤트 264건이므로 12자리는 넉넉히 찬다.

실패한다면 코드가 아니라 데이터가 묵었을 가능성부터 본다: `npm run batch`로 이번 주 데이터를 만든 뒤 다시 돌린다.

- [ ] **Step 3: 전체 테스트 확인**

Run: `npm test`
Expected: PASS — 전체 초록.

- [ ] **Step 4: 커밋**

```bash
git add tests/data/smoke.test.ts
git commit -m "test: 커밋된 실데이터로 홈 데이터 경로 스모크 테스트

홈이 요구하는 18개 id(event 12 + place 6)가 실제 data/*.json에서
전부 해석되는지 빌드와 같은 경로로 확인한다. 의도적으로 오늘
날짜에 묶여 있다 — 배치가 멈춰 데이터가 묵으면 홈이 무너지기 전에
테스트가 먼저 깨진다."
```

---

## Task 9: 상세 `/e/$id` + ItemImage + OpenNowBadge

상세가 홈보다 먼저다 — **홈이 상세로 링크를 걸면 `crawlLinks`가 그 링크를 프리렌더하려 들기 때문에**, 상세 라우트가 없으면 홈 완성 시점에 빌드(`failOnError`)가 깨진다. 상세 먼저 만들면 각 태스크 끝에서 빌드가 항상 초록이다.

화면(스펙 10-4): 히어로 이미지, 제목, 사실 블록(기간 / 장소·주소 / 요금 / 지하철 / 휴무일·이용시간), 원문 링크 버튼. **본문 없음** — 서울시 event 275건에는 본문이 될 필드가 없어 화면이 고르지 못해진다. 가진 사실을 정확히 보여주고 원문 링크를 크게 둔다.

**Files:**
- Create: `src/components/ItemImage.tsx`, `src/components/OpenNowBadge.tsx`, `src/routes/e/$id.tsx`

**Interfaces:**
- Consumes: `loadMeta`/`loadWeek`/`loadPlaces` (Task 2), `formatDateRange` (Task 4), `categoryColor` (Task 5), `isOpenNow` (Task 6), `Item`/`ParsedHours` (`~/types/item`)
- Produces:
  - `ItemImage(props: { src?: string; alt: string; category: string; className?: string })` — Task 10의 카드도 쓴다
  - `OpenNowBadge(props: { hours: ParsedHours | null })`
  - 라우트 `/e/$id` — Task 10의 홈 카드가 여기로 링크한다

- [ ] **Step 1: `ItemImage` 작성**

`src/components/ItemImage.tsx`:

```tsx
import { useState } from 'react'
import { categoryColor } from '~/lib/colors'

/**
 * 이미지가 못 뜨면(onError) 카테고리 색 블록으로 폴백한다(스펙 14장 #3).
 * categoryColor가 결정론적이라 같은 카테고리는 항상 같은 색 — 폴백이 튀지 않는다.
 * alt는 호출 측이 정한다. 제목이 바로 옆에 있는 카드에서는 ''(장식)이 맞다.
 */
export function ItemImage(props: {
  src?: string
  alt: string
  category: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!props.src || failed) {
    return (
      <div
        aria-hidden
        className={props.className}
        style={{ backgroundColor: categoryColor(props.category) }}
      />
    )
  }

  return (
    <img
      src={props.src}
      alt={props.alt}
      loading="lazy"
      className={props.className}
      onError={() => setFailed(true)}
    />
  )
}
```

- [ ] **Step 2: `OpenNowBadge` 작성**

`src/components/OpenNowBadge.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { isOpenNow } from '~/lib/open-now'
import type { ParsedHours } from '~/types/item'

/**
 * "지금 열림" 배지. 이 값만 브라우저에서 계산한다(스펙 10-4) —
 * SSG라 빌드 시각으로 계산하면 거짓말이 된다. 서버 렌더와 첫 클라이언트 렌더는
 * 아무것도 내보내지 않고(hydration 불일치 방지), effect에서 판정한 뒤에 나타난다.
 * hours가 null이면(파싱 실패) 영원히 아무것도 렌더하지 않는다 — 원문(useTime)이 옆에 있다.
 */
export function OpenNowBadge({ hours }: { hours: ParsedHours | null }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(isOpenNow(hours, new Date())) // new Date()는 여기 브라우저 경계에서만
  }, [hours])

  if (!open) return null
  return (
    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      지금 열림
    </span>
  )
}
```

- [ ] **Step 3: 상세 라우트 작성**

`src/routes/e/$id.tsx` (`.inputValidator`는 확인 목록 #4 — 설치 버전 문서와 대조):

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import type { ReactNode } from 'react'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import { loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { formatDateRange } from '~/lib/dates'
import { kstToday } from '~/lib/week'
import type { Item } from '~/types/item'

/**
 * 정적 서버 함수 — 빌드 타임에 실행되고 결과가 정적 JSON으로 캐시된다.
 * 프리렌더 범위(19페이지)는 홈이 링크하는 id에서 결정되고, 여기는 id를 찾을 뿐이다.
 * 링크되지 않은 id는 애초에 페이지가 생성되지 않아 404다(스펙 10-5).
 */
const getDetail = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .middleware([staticFunctionMiddleware]) // 체인 마지막이어야 한다 (공식 문서)
  .handler(({ data: id }): { item: Item; today: string } | null => {
    const meta = loadMeta() // 현재 주차는 meta.weekKey — isoWeekKey(new Date()) 금지
    const week = loadWeek(meta.weekKey)
    const places = loadPlaces()
    const item: Item | undefined =
      week.items.find((i) => i.id === id) ?? places.items.find((i) => i.id === id)
    if (!item) return null
    return { item, today: kstToday(new Date()) } // 오늘 = 빌드 시각의 KST 날짜
  })

export const Route = createFileRoute('/e/$id')({
  loader: async ({ params }) => {
    const data = await getDetail({ data: params.id })
    if (!data) throw notFound()
    return data
  },
  component: Detail,
})

function Detail() {
  const { item, today } = Route.useLoaderData()
  // 요금: fee 원문이 있으면 그쪽(할인 안내가 들어 있다), 없고 무료면 '무료'
  const fee = item.fee ?? (item.isFree ? '무료' : undefined)

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <ItemImage
        src={item.imageUrl}
        alt=""
        category={item.category}
        className="aspect-video w-full rounded-xl object-cover"
      />
      <h1 className="mt-4 text-2xl font-bold">{item.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {item.category}
        {item.district ? ` · ${item.district}` : ''}
      </p>

      <dl className="mt-6 space-y-3">
        {item.kind === 'event' && (
          <Fact label="기간" value={formatDateRange(item.startDate, item.endDate, today)} />
        )}
        <Fact label="장소" value={item.address ? `${item.place} (${item.address})` : item.place} />
        <Fact label="요금" value={fee} />
        <Fact label="지하철" value={item.subwayInfo} />
        {item.kind === 'place' && <Fact label="휴무일" value={item.closedDays} />}
        {item.kind === 'place' && (
          <Fact
            label="이용시간"
            value={item.useTime}
            badge={<OpenNowBadge hours={item.hours ?? null} />}
          />
        )}
      </dl>

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-8 block rounded-lg bg-gray-900 px-4 py-3 text-center font-medium text-white"
        >
          원문 보기
        </a>
      )}
    </main>
  )
}

/** 값이 없으면 줄 자체를 접는다 — linkUrl과 같은 태도. 빈 칸을 보여주지 않는다 */
function Fact({ label, value, badge }: { label: string; value?: string; badge?: ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-14 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0">
        {value}
        {badge}
      </dd>
    </div>
  )
}
```

`hours` 파싱 실패 시의 화면(스펙 6장·10-4): `hours`가 `null`이면 `OpenNowBadge`가 아무것도 렌더하지 않고, `useTime` 원문이 `Fact`로 그대로 노출된다 — 실패를 숨기지 않는다(place 728건 중 파싱 성공 517건, 나머지 211건이 이 경로다).

- [ ] **Step 4: dev 서버로 확인**

```bash
npm run dev & DEV_PID=$!; sleep 8
# event 상세 (id는 data/curated/<주차>.json의 첫 pick으로 대체 가능)
curl -s http://localhost:3000/e/sc-1b5o7t2 | grep -c '기간'
# place 상세 (data/curated/<주차>.json의 places 첫 항목)
curl -s http://localhost:3000/e/vs-KOP001799 | grep -c '장소'
# 없는 id → 404 컴포넌트
curl -s http://localhost:3000/e/sc-nope | grep -c '없는 페이지'
kill $DEV_PID
```

Expected: 각각 `1` 이상. **"지금 열림" 배지는 이 HTML에 없어야 정상이다** — 서버 렌더는 배지를 내보내지 않는다: `curl -s http://localhost:3000/e/vs-KOP001799 | grep -c '지금 열림'` → `0`.

- [ ] **Step 5: 빌드가 여전히 초록인지 확인**

Run: `npm run build`
Expected: 성공. 아직 홈이 링크하지 않으므로 프리렌더는 `/` 1페이지뿐이다 — 상세 18페이지는 Task 10에서 홈 링크가 생기면 crawlLinks가 줍는다.

- [ ] **Step 6: 전체 테스트 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/components/ItemImage.tsx src/components/OpenNowBadge.tsx src/routes/e
git commit -m "feat: 상세 화면 /e/\$id 추가

가진 사실(기간/장소·주소/요금/지하철/휴무일·이용시간)과 원문 링크만.
본문은 넣지 않는다 — 서울시 event 275건에 본문 필드가 없어 화면이
고르지 못해진다. '지금 열림' 배지만 브라우저에서 계산한다 — SSG의
빌드 시각으로 계산하면 거짓말이 된다. 홈보다 상세가 먼저인 이유:
crawlLinks가 홈의 링크를 따라오므로 역순이면 빌드가 깨진다."
```

---

## Task 10: 홈 `/` — 하이브리드 카드 + 언제 가도 좋은 곳

스펙 10-1의 구현. **카드는 하이브리드다** — 상위 3개는 16:9 이미지 큰 카드, 나머지 9개는 썸네일 + 텍스트 컴팩트 행. 큰 카드 12개를 세로로 쌓으면 스크롤이 열두 번 필요해 "훑어본다"(시나리오 A)가 성립하지 않는다. 그 아래 "언제 가도 좋은 곳" place 6개를 **항상 고정 노출**한다 — "이번 주 맘에 드는 행사가 없음"이라는 막다른 길을 항상 메운다.

**Files:**
- Create: `src/components/cards.tsx`
- Modify: `src/routes/index.tsx` (Task 0의 임시 화면 교체)

**Interfaces:**
- Consumes: Task 2·3·4·7의 전 함수, `weekLabel`/`kstToday` (`~/lib/week`), `ItemImage` (Task 9), `HomeEntry` (Task 7)
- Produces: `BigEventCard` / `CompactEventRow` / `PlaceCard` (홈 전용), 라우트 `/` — 이 화면의 링크가 프리렌더 범위 18페이지를 결정한다

- [ ] **Step 1: 카드 컴포넌트 작성**

`src/components/cards.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { ItemImage } from '~/components/ItemImage'
import { formatDateRange } from '~/lib/dates'
import type { HomeEntry } from '~/lib/home'
import type { EventItem, PlaceItem } from '~/types/item'

/** 요금 한 조각. fee 원문 우선(할인 안내가 들어 있다), 없고 무료면 '무료', 둘 다 없으면 생략 — 상세(Task 9)와 같은 규칙 */
function Fee({ item }: { item: EventItem }) {
  const fee = item.fee ?? (item.isFree ? '무료' : undefined)
  if (!fee) return null
  return <span className="text-green-700"> · {fee}</span>
}

/** 상위 3개 — 16:9 이미지 큰 카드. 첫 화면의 임팩트 담당(스펙 10-1) */
export function BigEventCard({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="block">
      <ItemImage
        src={e.imageUrl}
        alt=""
        category={e.category}
        className="aspect-video w-full rounded-xl object-cover"
      />
      <div className="mt-2">
        <h3 className="text-lg font-bold">{e.title}</h3>
        <p className="text-sm text-gray-600">
          {e.place} · {formatDateRange(e.startDate, e.endDate, today)}
          <Fee item={e} />
        </p>
        {/* 코멘트는 있을 때만 — 운영 배치(rule)는 reason이 빈 문자열이다. 빈 자리를 남기지 않는다 */}
        {entry.reason !== '' && <p className="mt-1 text-sm text-gray-800">{entry.reason}</p>}
      </div>
    </Link>
  )
}

/** 나머지 9개 — 썸네일 + 텍스트 컴팩트 행. 훑어보기 담당 */
export function CompactEventRow({ entry, today }: { entry: HomeEntry; today: string }) {
  const e = entry.item
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="flex gap-3">
      <ItemImage
        src={e.imageUrl}
        alt=""
        category={e.category}
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0">
        <h3 className="truncate font-medium">{e.title}</h3>
        <p className="truncate text-sm text-gray-600">
          {e.place} · {formatDateRange(e.startDate, e.endDate, today)}
          <Fee item={e} />
        </p>
        {entry.reason !== '' && (
          <p className="truncate text-sm text-gray-500">{entry.reason}</p>
        )}
      </div>
    </Link>
  )
}

/** 언제 가도 좋은 곳 — place 6개 그리드용 */
export function PlaceCard({ place }: { place: PlaceItem }) {
  return (
    <Link to="/e/$id" params={{ id: place.id }} className="block">
      <ItemImage
        src={place.imageUrl}
        alt=""
        category={place.category}
        className="aspect-square w-full rounded-lg object-cover"
      />
      <h3 className="mt-2 truncate text-sm font-medium">{place.title}</h3>
      {place.subwayInfo && <p className="truncate text-xs text-gray-500">{place.subwayInfo}</p>}
    </Link>
  )
}
```

- [ ] **Step 2: 홈 라우트 교체**

`src/routes/index.tsx` 전체를 교체한다:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { BigEventCard, CompactEventRow, PlaceCard } from '~/components/cards'
import { loadCurated, loadMeta, loadPlaces, loadWeek } from '~/data/load'
import { resolveCurated } from '~/data/resolve'
import { formatUpdatedAt } from '~/lib/dates'
import { pickHomeItems } from '~/lib/home'
import { kstToday, weekLabel } from '~/lib/week'

/** 빌드 타임에 한 번 실행. 여기가 new Date()를 부르는 유일한 서버 경계다 */
const getHomeData = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => {
    const meta = loadMeta() // 현재 주차는 meta.weekKey — isoWeekKey(new Date()) 금지 (없는 파일을 읽게 된다)
    const week = loadWeek(meta.weekKey)
    const curated = loadCurated(meta.weekKey)
    const places = loadPlaces()
    const resolved = resolveCurated(curated, week.items, places.items)
    const today = kstToday(new Date()) // 오늘 = 빌드 시각의 KST 날짜. 배치 커밋 → 재배포 때 갱신된다

    return {
      weekLabel: weekLabel(meta.weekKey),
      updatedLabel: formatUpdatedAt(meta.updatedAt),
      today,
      entries: pickHomeItems({ events: week.items, picks: resolved.picks, today }),
      places: resolved.places,
    }
  })

export const Route = createFileRoute('/')({
  loader: () => getHomeData(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  const big = data.entries.slice(0, 3)
  const rest = data.entries.slice(3)

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6">
        <p className="text-sm text-gray-500">{data.weekLabel}</p>
        <h1 className="text-2xl font-bold">이번 주 서울</h1>
        <p className="mt-1 text-xs text-gray-400">{data.updatedLabel}</p>
      </header>

      <section aria-label="이번 주 추천" className="space-y-6">
        {big.map((entry) => (
          <BigEventCard key={entry.item.id} entry={entry} today={data.today} />
        ))}
      </section>

      <section aria-label="이번 주 나머지" className="mt-8 space-y-4">
        {rest.map((entry) => (
          <CompactEventRow key={entry.item.id} entry={entry} today={data.today} />
        ))}
      </section>

      <section aria-label="언제 가도 좋은 곳" className="mt-12">
        <h2 className="text-lg font-bold">언제 가도 좋은 곳</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {data.places.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      </section>
      {/* "전체 둘러보기 →"는 넣지 않는다 — /explore가 아직 없다 (스펙 10-1) */}
    </main>
  )
}
```

- [ ] **Step 3: 프리렌더 빌드로 19페이지 확인**

```bash
npm run build
find dist -name 'index.html' | wc -l          # 산출 디렉토리는 Task 0에서 확정한 경로
find dist -path '*/e/*' -name 'index.html' | wc -l
```

Expected: 전체 19 (홈 1 + 상세 18. 404 페이지 파일이 추가로 나오면 그만큼 +α — 파일 목록으로 확인), `e/` 아래 18.

18이 아니면 원인을 본다: curated places가 6개 미만으로 해석됐거나(스모크 테스트가 먼저 깨졌을 것), 홈 12자리 중 place 링크와 겹치는 id가 있거나(사실상 불가능 — event와 place는 id 공간이 다르다), crawlLinks가 꺼져 있다.

- [ ] **Step 4: 홈 HTML 내용 확인**

```bash
grep -l '이번 주 서울' dist/index.html
grep -c '언제 가도 좋은 곳' dist/index.html
```

Expected: 각각 매치. 컴팩트 행 9개와 큰 카드 3개가 있는지는 브라우저로 확인한다(`npx serve dist` 후 접속).

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/components/cards.tsx src/routes/index.tsx
git commit -m "feat: 홈 화면 — 하이브리드 카드와 언제 가도 좋은 곳

상위 3개는 16:9 큰 카드, 나머지 9개는 컴팩트 행 — 큰 카드 12개를
쌓으면 '훑어본다'가 성립하지 않는다. place 6개는 항상 고정 노출 —
'맘에 드는 행사가 없음'이라는 막다른 길을 메운다. 코멘트는 있을
때만 렌더한다 — 운영 배치(rule)는 reason이 빈 문자열이다.
이 화면의 링크가 crawlLinks를 통해 프리렌더 범위 18페이지를 결정한다."
```

---

## Task 11: 정적 서빙 검증 + 빌드 시간 재측정 + 문서 갱신

마지막 게이트. "전부 정적"이라는 주장을 실제 정적 파일 서버로 검증한다 — dev 서버는 서버 런타임이 있어서 정적 호스팅의 실패 모드(서버 함수 호출이 갈 곳 없음)를 숨긴다.

**Files:**
- Modify: `AGENTS.md` (현재 상태 절 — "Plan 2(웹앱)는 아직 없습니다" 문구 갱신)
- Modify: 이 계획 파일 (확인 목록 #2·#3의 결과 각주)

**Interfaces:**
- Consumes: Task 0~10 전부
- Produces: 없음 (검증과 기록)

- [ ] **Step 1: 클라이언트 번들에 데이터가 없는지 확인**

```bash
npm run build
# place id 패턴이 클라이언트 JS에 있으면 places.json이 번들에 새어 들어간 것
grep -rl 'vs-KOP0' dist/assets/*.js && echo '번들 오염!' || echo 'OK: 데이터 없음'
```

Expected: `OK: 데이터 없음`. 프리렌더된 HTML과 정적 서버 함수 캐시 JSON에 데이터가 있는 것은 정상이다 — 검사 대상은 **JS 번들**이다. (`dist/assets`가 아니면 산출 구조에 맞게 경로를 바꾼다.)

- [ ] **Step 2: 정적 서버로 클라이언트 네비게이션 확인 (확인 목록 #3의 해소)**

```bash
npx serve dist
```

브라우저에서:
1. 홈 접속 → 카드 12 + place 6이 보인다.
2. **개발자 도구 네트워크 탭을 연 채** 카드를 눌러 상세로 이동 → 이동이 되고, **실패한 요청(4xx/5xx)이 없다.**
3. 상세에서 place를 열어 `hours`가 파싱된 항목이면 잠깐 뒤 "지금 열림" 배지가 (영업시간 중일 때) 나타난다.
4. 주소창에 링크되지 않은 id(`/e/sc-nope`)를 직접 입력 → 404.

**2에서 실패한 요청이 있으면** 정적 서버 함수가 인자별 캐시를 못 하는 것이다(확인 목록 #3). 그때의 대비책: `src/components/cards.tsx`의 `<Link to="/e/$id" params=…>`를 `<a href={'/e/' + e.id}>`로 바꾼다. 19페이지 전부 프리렌더된 정적 HTML이므로 풀 페이지 로드로도 제품이 성립한다 — SPA 네비게이션은 이 제품 크기에서 필수가 아니다. 바꿨으면 이 계획의 확인 목록 #3에 결과를 각주로 남긴다.

- [ ] **Step 3: 빌드 시간 재측정 (Task 0과 비교)**

```bash
time npm run build
```

Task 0(1페이지)과 비교해 **페이지당 증분**을 기록한다. 19페이지 기준 총 빌드가 수 분 안이면 합격 — `/explore`·`/nearby`가 붙어 프리렌더가 수십 페이지로 늘 때의 예측 근거가 된다. 감당이 안 되는 수준이면(예: 페이지당 수십 초) place 상세 축소를 논의하되, **스펙 10-5를 고친 뒤에** 한다.

- [ ] **Step 4: `AGENTS.md` 현재 상태 갱신**

"계획은 두 개로 나뉩니다. Plan 1(배치)이 먼저이고, Plan 2(웹앱)는 아직 없습니다 — …" 문단을 다음 취지로 교체한다:

```markdown
계획은 두 개로 나뉩니다. Plan 1(배치)은 완료됐고, Plan 2(웹앱 1차: 홈+상세)는
`docs/superpowers/plans/2026-08-18-webapp-home-detail.md`입니다.
Plan 1의 Task 14에서 실측한 데이터 크기(주간 0.24MB)가 Plan 2의
"주간 파일 통째 로드 + 전부 SSG" 설계의 근거입니다.
```

명령어 절에 `npm run dev` / `npm run build`도 추가한다.

- [ ] **Step 5: 전체 테스트 + 최종 확인**

```bash
npm test
npm run build
```

Expected: 둘 다 성공.

- [ ] **Step 6: 커밋**

```bash
git add AGENTS.md docs/superpowers/plans/2026-08-18-webapp-home-detail.md
git commit -m "docs: 웹앱 1차 완료 반영 및 검증 결과 기록

정적 파일 서버로 클라이언트 네비게이션을 검증하고(확인 목록 #3),
19페이지 빌드 시간을 기록했다. AGENTS.md의 'Plan 2 없음' 서술을
갱신 — 문서가 현실과 어긋난 채 남으면 다음 세션이 잘못 판단한다."
```

---

## Self-Review 노트 (계획 작성 시점)

- **스펙 10-1**: 하이브리드 카드(Task 10), 코멘트 조건부 렌더(Task 7·10), 오늘 기준 정렬 + curated 보충(Task 7), place 6 고정 노출(Task 3·10), 헤더 weekLabel·갱신 시각(Task 4·10), "전체 둘러보기" 제외(Task 10 주석) — 전부 태스크에 대응.
- **스펙 10-4**: 사실 블록·본문 없음·linkUrl 조건부·배지 클라이언트 계산(Task 9).
- **스펙 10-5**: 프리렌더 19페이지 — 설정(Task 0)과 검증(Task 10 Step 3).
- **스펙 10-6**: 날짜 표기 + 상시(Task 4).
- **스펙 11장**: 파일 스키마 이동(Task 1), `src/data/` 빌드 타임 전용(Task 2), meta.weekKey(Task 9·10의 서버 함수), Tailwind·vitest 유지(Task 0).
- **타입 일관성**: `HomeEntry`(Task 7 → 10), `ResolvedCurated`(Task 3 → 10), `MetaFile` 등(Task 1 → 2), `ItemImage` props(Task 9 → 10) — 이름·시그니처 일치 확인함.
- **의도된 비대칭**: `KST_OFFSET_MS`가 `dates.ts`·`open-now.ts`에 중복 정의된다. `week.ts`에서 export하면 배치 공유 모듈을 수정하게 되는데, 이 계획은 배치 불변(예외는 Task 1뿐)을 지키는 쪽을 택했다. 상수 하나의 중복은 그 값이 바뀔 일이 없으므로(KST는 서머타임이 없다) 싸다.
