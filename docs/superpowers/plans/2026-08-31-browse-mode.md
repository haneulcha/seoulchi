# 탐색 모드 (Browse Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선별(홈 12개)과 동등한 지위의 탐색 화면 `/browse`를 추가한다 — 오늘부터 8주의 카탈로그를 카테고리·자치구·거리·요금·영업 여부로 좁혀 보는 두 번째 경로.

**Architecture:** 파이프라인 단계는 그대로 두고 `score` 뒤에 선택 경로 하나를 더한다: `selectCatalog`(순수 함수)가 8주 카탈로그를 골라 `data/index.json`(슬림, 클라이언트 fetch용)을 낳는다. 탐색 화면의 로직은 전부 순수 함수(`categoryGroup`, `selectCatalog`, `groupByTimeline`, `applyFilters`, `sortByDistance`, `relaxSuggestions`)로 빼서 vitest로 테스트하고, 라우트는 얇게 유지한다. `/browse`의 껍데기는 SSG이고 목록 데이터만 클라이언트가 `index.json`을 fetch한다 — 홈(`/`)의 "빌드 타임 SSG + 클라이언트 데이터 0바이트"는 그대로다. 상세 프리렌더는 홈이 링크하는 18개에서 카탈로그 전량(~1,400)으로 넓힌다.

**Tech Stack:** 기존 그대로 — TanStack Start + React + TypeScript + Vite + Tailwind CSS(역할 토큰) + zod v4. 테스트는 vitest. 새 의존성 0.

**Spec:** `docs/superpowers/specs/2026-08-31-browse-mode-design.md` — 이번에 구현할 설계 스펙. 색은 `DESIGN.md`, 제품 판단은 `PRODUCT.md`, 갚아야 할 빚은 `docs/2026-08-21-ui-ux-critique.md`(17/40, 휴리스틱 3·7·9가 각 1점). API·데이터 사실은 `docs/api-findings.md`.

**Tasks:** Task 0~13, **총 14개.** 순서: 0 게이트(프리렌더 명시 목록 실측) → 1 카테고리 정규화 → 2 날짜 유틸 확장 → 3 selectCatalog → 4 데이터 계약(스키마+슬림 투영) → 5 emit·run 연결 + 배치 실행 → 6 browse-filter → 7 search params → **8 전량 프리렌더** → **9 /browse 목록** → **10 /browse 필터** → **11 루트 헤더 세그먼트** → 12 문서 → 13 최종 검증.
순서의 논리는 Plan 2와 같다 — **링크는 페이지가 생긴 뒤에 건다.** 상세 전량 프리렌더(8)가 `/browse`(9)보다 먼저인 이유: 탐색 목록이 카탈로그 1,400건 전부로 링크를 거는데, 프리렌더 확대 전에는 그 링크의 클라이언트 네비게이션이 정적 서버 함수 캐시 미스로 깨진다. 루트 헤더의 탐색 링크(11)가 `/browse`(9·10)보다 뒤인 이유: `crawlLinks: true`가 헤더의 링크를 따라가므로 라우트가 없으면 `failOnError` 빌드가 깨진다.

## Global Constraints

- **기존 파일은 하나도 건드리지 않는다.** 주간 파일·`curated/*`·`places.json`의 스키마와 내용 규칙은 그대로이고 홈이 계속 읽는다 (스펙 4장). 새로 늘어나는 파일은 `data/index.json`과 `data/catalog.json` 둘이다(후자는 아래 "스펙에 없는 구현 결정" #1).
- **홈 `/`의 SSG·클라이언트 데이터 0바이트는 유지된다.** `index.json`은 `/browse`가 마운트될 때만 fetch한다. 홈 첫 로드의 네트워크에 index.json이 나타나면 회귀다 (Task 13에서 검사).
- **`today`는 순수 함수에 인자로 넘긴다. 내부 `new Date()` 금지** (레포 규칙). `new Date()`를 부르는 경계는 정확히 넷: 배치 CLI(`scripts/run-batch.ts`), 빌드 타임 서버 함수 핸들러, `OpenNowBadge`의 effect, 그리고 이번에 추가되는 `/browse`의 fetch 성공 시점(effect) 하나다.
- **좌표가 없으면 필드를 생략한다. `0`으로 채우지 않는다** — (0,0)은 아프리카 앞바다. `index.json` 슬림 항목에도 똑같이 적용한다. 거리 정렬은 좌표 없는 항목을 버리지 않고 끝에 둔다(거리 미상이지 존재 미상이 아니다).
- **`emit`은 전부 검증한 뒤에 쓰기 시작한다.** `index.json`·`catalog.json`도 `catalogIndexSchema`/`catalogEventsSchema`(zod) 검증과 참조 무결성 검사를 통과한 뒤에만 쓴다. 하나라도 실패하면 아무것도 쓰지 않는다.
- **실패를 숨기지 않는다.** endDate 이상치는 stderr에 id·원본 값을 찍고 `meta.json.anomalies`에 건수를 남긴다. 미매핑 카테고리는 stderr 경고 + `meta.json.unmappedCategories`. `index.json` fetch 실패는 명시적 에러 + 재시도 버튼 — 빈 목록으로 위장하지 않는다. `hours` 파싱 실패 207건은 `지금 열림` 필터가 버리지 않고 "영업시간 미상"으로 남긴다.
- **미매핑 카테고리는 던지지 않고 `기타`를 반환한다.** `LLM_PROVIDER` 규칙("알 수 없으면 던짐")과 다르게 가는 이유(스펙 6장): 오타는 사람 실수라 즉시 깨뜨리는 게 맞지만, 서울시가 새 분류를 추가하는 건 정상적인 일이고 그때마다 배치가 죽으면 안 된다. 대신 수집해서 보고한다.
- **색은 역할 토큰만 쓴다.** Tailwind 기본 팔레트는 꺼져 있어(`--color-*: initial`) `text-gray-500` 같은 클래스는 컴파일되지 않는다. 쓸 수 있는 것: `surface`/`ink`/`ink-muted`/`ink-subtle`, `{스케일}-subtle-bg/hover-bg/border/solid/on-solid/text/text-strong`, `white`/`black`/`transparent`/`current`. 액센트 주황은 아직 화면에 쓰지 않는다 — 어디에 줄지는 DESIGN.md의 "아직 안 정한 것"이고 이 계획의 결정이 아니다.
- **범위 밖 (스펙 13장):** 격자 달력, 지도 타일, 자유 텍스트 검색. 계획에 없다. `무료만`은 정식 필터다 — 78%는 행사만의 수치이고, 장소(무료 232/733)를 합친 카탈로그 기준은 **44%**라 56%가 걸러진다.
- **게이트:** Task 0의 확인 전에는 프리렌더 관련 태스크(Task 8)를 시작하지 않는다.
- 모든 태스크 완료 시점에 `npm test` 전체가 초록이어야 한다. **시작 기준선: 24파일 251테스트 통과** (2026-08-31 실측). 회귀를 깨면 안 된다.
- 커밋 메시지는 Conventional Commits 접두사 + 한국어 본문. 본문에는 *왜*를 쓴다.

## 스펙에 없는 구현 결정 (리뷰어 확인 필요)

스펙이 요구하는 결과를 내는 데 필요했지만 스펙 본문에 명시돼 있지 않은 결정 셋. 계획을 실행하기 전에 사용자 합의를 거친다 — 합의가 다르게 나면 해당 태스크만 고치면 된다.

1. **`data/catalog.json`(8주 카탈로그 행사의 전체 필드) 추가 — Task 4·5·8.**
   스펙 5장은 "상세 정보는 SSG된 상세 페이지가 갖는다"고 하는데, 미래 시작 행사는 주간 파일에 **0건**이라(스펙 3장 실측) 전체 필드가 어디에도 저장되지 않는다. 슬림 `index.json`만으로 상세를 만들면 `address`·`subwayInfo`·`fee` 원문·`linkUrl`이 사라진다 — 특히 원문 링크는 예매로 가는 길이라 미래 행사일수록 뺄 수 없다("화면은 데이터보다 정직하다"). 그래서 빌드 타임 전용 전체 필드 파일을 하나 더 쓴다. 클라이언트로는 한 바이트도 안 나가므로 "슬림 인덱스 1개 + 클라이언트 필터"라는 payload 결정(스펙 2장)과 충돌하지 않는다.
2. **장소의 `district`를 `address`에서 파생 — Task 3.**
   스펙 5장의 계약 예시는 장소 항목에 `"district": "성동구"`를 담고 있지만, 실제 데이터의 장소 `district`는 **0/733**이다(Plan 2 실측과 동일, 2026-08-31 재확인). 대신 `address`가 714/733에 있고 그중 705건에서 자치구가 추출된다. 슬림 투영 시점에 `districtFromAddress`(순수 함수)로 파생한다 — `places.json` 원본과 normalize 단계는 건드리지 않는다. 추출 실패 시 필드 생략(좌표 규칙과 같은 태도).
3. **장소 슬림 항목에 `imageUrl`·`isFree` 포함 — Task 4.**
   스펙 5장의 장소 예시에는 둘 다 없지만, 같은 장(7장)의 화면 스케치는 장소 행에 IMG 박스를 그리고 있고(`imageUrl` 733/733), `무료만` 필터가 장소를 항상 통과시키면 유료 고궁이 "무료만" 아래 남아 화면이 거짓말을 한다(`isFree`는 장소 733건 전부에 명시돼 있고 232건이 true). 목록·필터에 필요한 필드만 담는다는 5장의 원칙 그대로다.

## 구현 중 확인이 필요한 것 (추측 금지 목록)

Plan 2에서 이 표의 가정 6개 중 2개가 틀렸었다(`.validator` 방향, `dist/client/`). 같은 규율로 간다 — 아래 가정은 **확인한 뒤** 쓰고, 어긋나면 코드를 실측 쪽으로 고치고 "확인 결과"에 남긴다.

| # | 항목 | 이 계획의 가정 | 어긋나면 | 확인 시점 |
|---|---|---|---|---|
| 1 | 프리렌더 명시적 페이지 목록 | 설치 버전(`@tanstack/react-start` 1.168.x가 쓰는 `start-plugin-core`)의 플러그인 옵션 스키마에 명시적 페이지 목록이 있다 — 스펙 12장은 `prerender.pages`라고 썼지만 **키 이름과 위치는 `node_modules`의 타입 선언이 근거다** | 없으면 폴백: 전체 id를 `<Link>`로 나열하는 SSG 라우트 `/all` + 기존 `crawlLinks: true` (스펙 12장의 폴백. Task 8의 경로 B) | **Task 0 (게이트)** |
| 2 | 명시 목록과 `base: '/seoulchi/'`의 관계 | 페이지 경로는 base 없이 `/e/<id>` 형태로 주고, 산출은 `dist/client/e/<id>/index.html`에 떨어진다(crawlLinks 산출과 같은 자리) | 스파이크 빌드의 실제 산출 경로를 따른다 | **Task 0 (게이트)** |
| 3 | JSON 에셋 URL 임포트 | `import indexUrl from '../../data/index.json?url'`이 vite에서 해시된 에셋으로 방출되고 base가 붙은 URL을 돌려준다 (`vite/client` 타입은 tsconfig에 이미 있음) | 폴백: `vite.config.ts`에 `generateBundle`에서 `this.emitFile({type:'asset'})`로 `data/index.json`을 직접 방출하는 소형 플러그인 (전례: `staticFnBasePath` 플러그인) | Task 9 Step 5 |
| 4 | `validateSearch`에 zod v4 스키마 직접 전달 | zod v4는 Standard Schema를 구현하므로 `validateSearch: browseSearchSchema`가 그대로 동작한다 | 폴백: `validateSearch: (search) => browseSearchSchema.parse(search)` | Task 10 Step 2 |

### 확인 결과 (Task 0·9·10 실행 후 여기 기록 — 위 표의 "가정"보다 이 절이 우선한다)

_(Task 9가 #3을, Task 10이 #4를 채운다.)_

- **#1 — 경로 A 확정.** 설치 버전: `@tanstack/react-start@1.168.46` (`@tanstack/start-plugin-core@1.171.36` deduped, `npm ls` 실측 2026-09-01).
  명시적 페이지 목록은 스펙이 가정한 `prerender.pages`가 아니라 **플러그인 옵션 최상위 `pages`** 키다 — `tanstackStart({ pages: [...], prerender: {...} })`처럼 `prerender`와 형제로 준다.
  근거: `node_modules/@tanstack/start-plugin-core/dist/esm/schema.d.ts:708-716`(`tanstackStartOptionsSchema`, 입력 스키마) — `pages: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{ path: z.ZodString; sitemap?: {...}; fromCrawl?: boolean; prerender?: {...} }>>>>`. 같은 형태가 `parseStartConfig`의 반환 타입(130-149행, 정규화 후)과 `tanstackStartOptionsObjectSchema`(439행)에도 반복된다.
  항목 타입은 문자열 배열이 아니라 **`{ path: string; sitemap?; fromCrawl?; prerender?: { enabled?, outputPath?, autoSubfolderIndex?, crawlLinks?, retryCount?, retryDelay?, onSuccess?, headers? } }` 객체 배열**이다. `path`만 필수.
  최상위 `prerender`(전역 옵션: `enabled`/`concurrency`/`filter`/`failOnError`/`crawlLinks`/...)는 `pages`와 별개의 형제 키이고, 항목별 `page.prerender`는 전역 옵션을 오버라이드할 뿐 대체하지 않는다.
  **`crawlLinks` 병행 가능 — 확정.** 근거: `dist/esm/prerender.js`. `startConfig.pages`(명시 목록, 비어 있으면 `[{path:'/'}]`)를 전부 큐에 넣어 프리렌더하고(`pages.forEach(addCrawlPageTask)`), **명시 목록이든 크롤로 발견됐든 관계없이** 성공적으로 렌더된 모든 HTML에서 `prerenderOptions.crawlLinks ?? true`가 참이면 `<a href>` 링크를 추출해 추가로 크롤 큐에 넣는다(`fromCrawl: true`). 즉 명시 목록과 crawlLinks는 서로 배타적인 두 모드가 아니라 **같은 큐에 합류하는 두 시드**다 — 명시 목록에 없는 홈 링크 18개는 여전히 crawlLinks로, 명시 목록에만 있는 id는 그것대로 프리렌더된다.

- **#2 — 스파이크 결과.** 사용한 id: `sc-1ez0sn8` (2026-W35 주간 파일에는 있으나 curated 12선에는 없는 실존 행사, Step 3 스크립트로 선정).
  `vite.config.ts`의 `tanstackStart({...})`에 `pages: [{ path: '/e/sc-1ez0sn8' }]`를 임시로 추가하고 `npm run build` 실행 — 로그에 `[prerender] Crawling: /e/sc-1ez0sn8`(base 없는 그대로)가 명시 목록 항목으로 뜨고, 홈 크롤로 잡힌 나머지 18페이지는 여전히 `/seoulchi/e/...`(base 포함)로 크롤됨. 총 20페이지 프리렌더(기존 19 + 명시 1건), crawlLinks가 죽지 않고 병행됨을 실측으로 확인.
  산출 경로: `dist/client/e/sc-1ez0sn8/index.html` — 가정 #2(base 없이 `/e/<id>`로 주면 `dist/client/e/<id>/index.html`에 떨어진다) **그대로 재현**. `withoutBase()`가 파일명 계산 시 base를 벗겨내므로 명시 목록 항목도 crawlLinks 산출과 같은 자리에 놓인다.
  `grep -a -c '기간' dist/client/e/sc-1ez0sn8/index.html` → **1**. `getDetail`이 해당 id를 해석해 상세 본문(기간 라벨)을 렌더했음을 확인.
  Step 4 원복: `vite.config.ts`에서 임시 추가한 `pages` 줄 제거 → `git diff --stat vite.config.ts` 빈 출력 확인 → `npm run build` 재실행, 19페이지로 복귀(Plan 2와 동일 수·구성) 확인.

- **#3 — 가정대로 동작. 확정.** `import indexUrl from '../../data/index.json?url'`이 dev·build 양쪽에서 base(`/seoulchi/`)가 붙은 URL을 그대로 돌려준다. 폴백(vite 플러그인 `emitFile`)은 필요 없었다.
  **dev**: `curl http://localhost:3000/seoulchi/src/routes/browse.tsx?tsr-split=component`로 컴파일된 라우트 모듈을 직접 받아 확인 — `import indexUrl from "/seoulchi/data/index.json?import&url"`. 그 URL을 그대로 `curl`하면 200 · `content-type: application/json`으로 원본 인덱스가 온다(파일을 그대로 서빙, 해시 없음).
  **build**: `npm run build` 산출에 해시된 에셋 `dist/client/assets/index-Dn3OpHIg.json`(465.91 kB raw · gzip 60.94 kB, 빌드 로그 실측)이 방출됐고, 클라이언트 번들 `dist/client/assets/browse-D1-x9gXO.js` 안에 리터럴 `` `/seoulchi/assets/index-Dn3OpHIg.json` ``로 인라인돼 있다(`grep -rao` 확인) — base 포함, 별도 처리 불필요.
- **#4 —** (동작 여부, 폴백 사용 여부)

## 실측 데이터 (이 계획의 숫자는 전부 여기서 나왔다)

측정일 2026-08-31(월), `data/meta.json`: `weekKey` `2026-W35`, `llmProvider` `rule`, `updatedAt` 2026-08-29. 행사 272 · 장소 733.

- **카테고리 원시값**: 행사 18종 + 장소 37종 = 55자리. 문자열로는 **53개** — `전시시설`과 `축제/공연/행사`가 양쪽 kind에 겹친다. 전체 목록과 그룹 배정은 Task 1의 테스트에 픽스처로 고정돼 있다(스펙 6장 표의 건수가 이 배정에서 정확히 재현된다).
- **자치구**: 행사에서 24개(서대문구 없음 — 서울 25개 구 중 이번 주 행사가 없는 구). 장소 `district`는 0/733, `address` 714/733, 자치구 추출 가능 705/733. 자치구 셀렉트는 하드코딩하지 않고 로드된 카탈로그에서 도출한다.
- **좌표**: 행사 271/272, 장소 715/733. **영업시간**: 파싱 성공 526/733 (미상 207).
- **isFree**: 행사 272/272 명시(true 211 = 78%), 장소 733/733 명시(true 232).
- **endDate 이상치** (오늘+3년 초과): 3건 — `sc-1vbax94`(2626-08-08), `sc-11jahml`(2099-12-31), `sc-1opz6ug`(2029-12-30). Task 3의 이상치 판정의 실제 대상.
- **payload** (스펙 3장): 슬림 인덱스 1,005건 = 240KB raw / 61KB gzip. 8주 확대 시 ~1,400건 ≈ 85KB gzip 추정 — Task 5에서 실측해 기록한다.
- **빌드 시간** (Plan 2 실측): 19페이지 1.3초, **페이지당 증분 ≈ 0.017초**. 1,400페이지 ≈ +24초 예상 — Task 8·13에서 실측한다.
- **테스트 기준선**: 24파일 251테스트 전체 초록 (2026-08-31 실행 확인).
- 2026-08-31은 **월요일**이다. 시간 축 그룹 테스트의 날짜 픽스처가 이 사실에 기대고 있다.

---

## File Structure

| 경로 | 책임 |
|---|---|
| `src/lib/category.ts` | **신규.** 원시 카테고리 53종 → 6그룹+기타. `categoryGroup` / `isKnownCategory` / `unmappedCategories` |
| `src/lib/dates.ts` | 수정. `addDays` / `weekdayOf` / `relativeDateLabel` 추가 — 시간 축 라벨의 재료 |
| `src/pipeline/select-catalog.ts` | **신규.** `selectCatalog`(8주 선정 + 이상치 격리) / `districtFromAddress` / `buildCatalogIndex`(슬림 투영) — 전부 순수 |
| `src/types/files.ts` | 수정. `catalogIndexSchema` / `catalogEventsSchema` 추가, `metaSchema`에 `anomalies`·`unmappedCategories` |
| `src/pipeline/emit.ts` | 수정. `index.json`·`catalog.json` 검증 후 쓰기 + 참조 무결성 검사 확장 |
| `src/pipeline/run.ts` | 수정. `selectCatalog` 연결, 이상치·미매핑 stderr 보고 |
| `src/data/load.ts` | 수정. `loadCatalog` / `loadIndex` 추가 (빌드 타임·테스트 전용) |
| `src/lib/browse-filter.ts` | **신규.** `applyFilters` / `groupByTimeline` / `sortByDistance` / `relaxSuggestions` / `formatDistance` |
| `src/lib/browse-search.ts` | **신규.** URL search param 스키마(`browseSearchSchema`) + `toBrowseFilters` |
| `src/routes/browse.tsx` | **신규.** 탐색 라우트 — fetch 상태 기계 + 화면 조립. 로직은 lib에 |
| `src/components/browse.tsx` | **신규.** 행·그룹 섹션·컨트롤·스켈레톤·에러·0건 컴포넌트 (함께 바뀌므로 한 파일 — `cards.tsx` 전례) |
| `src/routes/__root.tsx` | 수정. 공통 헤더(제목 + 추천/탐색 세그먼트) |
| `src/routes/index.tsx` | 수정. 제목이 루트로 올라가므로 헤더 축소 |
| `src/routes/e/$id.tsx` | 수정. 조회 사슬에 카탈로그 추가, `h1`→`h2`(루트에 h1이 생기므로) |
| `vite.config.ts` | 수정. 카탈로그 전량 프리렌더 (Task 0 결과에 따라 명시 목록 또는 폴백) |
| `PRODUCT.md` / `AGENTS.md` | 수정. 포지셔닝·데이터 모델 서술 (스펙 11장) |
| `docs/2026-08-21-ui-ux-critique.md` | 수정. 재측정 절 추가 (Task 13) |

배치 코드 중 `curate`·`score`·`merge`·`pick-places`·소스 어댑터는 손대지 않는다.

---

## Task 0: 게이트 — 명시적 프리렌더 목록의 실측 확인

**이 확인 전에는 프리렌더 관련 태스크(Task 8)를 시작하지 않는다** (스펙 12장). 스펙은 `prerender.pages`라는 이름을 가정했지만, 이 레포는 같은 종류의 가정이 틀렸던 전적이 있다 — Plan 2에서 `.inputValidator`가 현행이라는 가정이 거꾸로였다(실제는 `.validator`). **키 이름과 위치의 근거는 문서가 아니라 설치된 `node_modules`의 타입 선언과 스파이크 빌드다.**

산출물은 코드가 아니라 지식이다: 위 확인 목록 #1·#2의 답을 "확인 결과" 절에 기록한다.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-browse-mode.md` (확인 결과 절 기록)
- 임시 수정 후 원복: `vite.config.ts` (스파이크)

**Interfaces:**
- Consumes: 없음
- Produces: Task 8이 쓸 프리렌더 경로 결정 — **경로 A**(명시 목록이 있으면 그것) 또는 **경로 B**(없으면 `/all` 링크 나열 라우트 + `crawlLinks`)

- [ ] **Step 1: 설치 버전 확인**

```bash
npm ls @tanstack/react-start @tanstack/start-plugin-core
```

기록: 두 패키지의 정확한 버전.

- [ ] **Step 2: 플러그인 옵션 스키마에서 명시적 페이지 목록 찾기**

```bash
grep -n "pages" node_modules/@tanstack/start-plugin-core/dist/esm/schema.d.ts | head -20
```

매치가 나오면 그 주변을 읽고(`sed -n '<라인-10>,<라인+60>p' …schema.d.ts`) 다음을 확정한다:
1. 명시 목록의 **위치** — `prerender` 안인가, 플러그인 옵션 최상위인가
2. 항목의 **형태** — 문자열 배열인가, `{ path, prerender?, … }` 객체 배열인가
3. `crawlLinks: true`와 **병행 가능**한가 (홈이 링크하는 이상치 상세는 crawl로만 잡힌다 — Task 8 참조)

매치가 없으면 `node_modules/@tanstack/start-plugin-core/dist/esm/prerender.d.ts`와 `vite/schema.d.ts`도 본다. 그래도 없으면 **경로 B 확정**이고 Step 3의 스파이크는 건너뛴다.

- [ ] **Step 3: 스파이크 — 홈이 링크하지 않는 id 하나를 명시 목록으로 프리렌더**

홈이 링크하지 않는 실존 id를 하나 고른다 (주간 파일에는 있지만 curated에는 없는 id):

```bash
node -e "
const fs = require('fs');
const meta = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
const week = JSON.parse(fs.readFileSync('data/events/' + meta.weekKey + '.json', 'utf8'));
const curated = JSON.parse(fs.readFileSync('data/curated/' + meta.weekKey + '.json', 'utf8'));
const linked = new Set(curated.picks.map((p) => p.id));
console.log(week.items.find((i) => !linked.has(i.id)).id);
"
```

`vite.config.ts`의 `tanstackStart({ … })`에 Step 2에서 확정한 형태로 그 id의 `/e/<id>` 경로 하나를 임시로 추가하고:

```bash
time npm run build
find dist/client -path "*<id>*" -name 'index.html'
grep -a -c '기간' "$(find dist/client -path "*<id>*" -name 'index.html')"
```

Expected: 파일이 존재하고 `기간`이 1 이상 — 명시 목록으로 준 페이지가 crawl 없이 프리렌더됐고, `getDetail`이 그 id를 해석했다. 산출 경로가 `dist/client/e/<id>/index.html`인지(가정 #2)도 기록한다.

**주의:** 이 id는 이번 주차 주간 파일의 것이라 `getDetail`이 이미 해석할 수 있다. 카탈로그 전용(미래 시작) 행사의 상세 해석은 Task 8의 몫이다 — 여기서는 프리렌더 메커니즘만 확인한다.

- [ ] **Step 4: 스파이크 원복 + 빌드가 원래대로인지 확인**

`vite.config.ts`의 임시 추가를 지우고:

```bash
git diff --stat vite.config.ts   # 비어 있어야 한다
npm run build                    # 19페이지, Plan 2와 동일
```

- [ ] **Step 5: "확인 결과" 절 기록**

이 계획 파일의 "확인 결과" 절에 #1·#2를 기록한다: 정확한 키 이름·위치·항목 타입(근거 파일 경로:라인), 스파이크에 쓴 id, 산출 경로, crawlLinks 병행 여부. 명시 목록이 없었다면 "경로 B 확정"이라고 쓴다.

- [ ] **Step 6: 커밋**

```bash
git add docs/superpowers/plans/2026-08-31-browse-mode.md
git commit -m "docs: 프리렌더 명시 목록 게이트 실측 결과 기록

스펙 12장의 게이트. 설치된 TanStack Start의 타입 선언과 스파이크
빌드로 명시적 페이지 목록의 키·위치·산출 경로를 확정했다.
Plan 2에서 .inputValidator 가정이 거꾸로였던 것과 같은 함정을
문서가 아니라 node_modules로 막는다."
```

---

## Task 1: `src/lib/category.ts` — 원시 카테고리 → 6그룹 + 기타

두 소스의 원시 분류값 53종(행사 18 + 장소 37, 두 값 공유)을 사람 말 7개로 접는다(스펙 6장). 지금은 `기타역사유적지` 같은 원시값이 화면에 그대로 도달한다 — PRODUCT.md "원본 API의 어휘는 사용자에게 도달하기 전에 번역됩니다"의 미이행분.

**미매핑은 던지지 않고 `기타`.** `LLM_PROVIDER`의 "알 수 없으면 던짐"과 다르게 가는 이유를 코드 주석에 남긴다: 서울시가 새 분류를 추가하는 건 정상 운영이고 그때마다 배치가 죽으면 안 된다. 대신 `unmappedCategories`로 수집해 stderr + meta에 보고한다(Task 5).

**Files:**
- Create: `src/lib/category.ts`
- Test: `tests/lib/category.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `CATEGORY_GROUPS: readonly ['전시', '체험·배움', '공원·자연', '역사·명소', '축제', '공연', '기타']`
  - `type CategoryGroup = (typeof CATEGORY_GROUPS)[number]`
  - `categoryGroup(raw: string): CategoryGroup` — 미매핑은 `'기타'`
  - `isKnownCategory(raw: string): boolean`
  - `unmappedCategories(items: ReadonlyArray<{ category: string }>): string[]` — 중복 제거·정렬
  - Task 4의 `buildCatalogIndex`·`catalogIndexSchema`, Task 5의 run 연결, Task 9·10의 화면이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/category.test.ts`. 픽스처는 2026-08-31 실측 원시값 **전부**다(주간 3주 합집합 384건 + 장소 733건에서 추출). 그룹 배정은 스펙 6장 표의 건수를 정확히 재현하는 배정이다 — 예: 전시 = 행사(전시/미술 129 + 전시시설 39 = 168) + 장소(박물관 54 + 미술관/화랑 52 + 기타전시시설 29 + 전시시설 14 + 전시회 3 = 152).

```ts
import { describe, expect, it } from 'vitest'
import { categoryGroup, isKnownCategory, unmappedCategories, CATEGORY_GROUPS } from '~/lib/category'

/**
 * 2026-08-31 실측 원시값 전부 (W33·W34·W35 합집합 행사 18종 + 장소 37종 = 55자리).
 * '전시시설'과 '축제/공연/행사'는 양쪽 kind에 겹쳐 문자열로는 53개다.
 * 그룹 배정은 스펙 6장 표(전시 320 / 체험·배움 247 / 공원·자연 196 / 역사·명소 191 /
 * 축제 75 / 공연 75 / 기타 13)를 정확히 재현하는 배정이다.
 */
const FIXTURE: Record<string, string> = {
  // 전시
  '전시/미술': '전시', '전시시설': '전시', '박물관': '전시', '미술관/화랑': '전시',
  '기타전시시설': '전시', '전시회': '전시',
  // 체험·배움
  '교육/체험': '체험·배움', '기타체험': '체험·배움', '전통체험': '체험·배움',
  '공예체험': '체험·배움', '산업관광': '체험·배움', '교육시설': '체험·배움',
  '체험관광': '체험·배움', '산사체험': '체험·배움',
  // 공원·자연 (100% 장소)
  '도시공원': '공원·자연', '자연경관(산)': '공원·자연', '자연공원': '공원·자연',
  '웰니스관광': '공원·자연', '자연경관(하천)': '공원·자연', '자연관광': '공원·자연',
  '테마공원': '공원·자연', '레저스포츠시설': '공원·자연',
  // 역사·명소 (100% 장소)
  '랜드마크관광': '역사·명소', '기타문화관광지': '역사·명소', '문화관광': '역사·명소',
  '종교성지': '역사·명소', '사적지': '역사·명소', '성/문': '역사·명소', '고궁': '역사·명소',
  '근대건축물': '역사·명소', '고분/능': '역사·명소', '역사유적지': '역사·명소',
  '기타역사유적지': '역사·명소', '역사관광': '역사·명소',
  // 축제
  '축제': '축제', '축제/공연/행사': '축제', '축제-문화/예술': '축제', '축제-기타': '축제',
  '축제-전통/역사': '축제', '축제-관광/체육': '축제', '축제-자연/경관': '축제',
  '축제-시민화합': '축제',
  // 공연
  '콘서트': '공연', '뮤지컬/오페라': '공연', '연극': '공연', '클래식': '공연',
  '국악': '공연', '무용': '공연', '영화': '공연', '공연시설': '공연', '공연': '공연',
  // 기타 (알려진 값도 표에 둔다 — 신값 미매핑과 구분하기 위해)
  '기타': '기타', '행사시설': '기타',
}

describe('categoryGroup', () => {
  it('실측 원시값 53종이 전부 명시적으로 매핑돼 있다', () => {
    expect(Object.keys(FIXTURE)).toHaveLength(53)
    for (const [raw, group] of Object.entries(FIXTURE)) {
      expect(categoryGroup(raw), raw).toBe(group)
      expect(isKnownCategory(raw), raw).toBe(true)
    }
  })

  it('그룹은 7개 고정이고 픽스처가 기타 제외 6그룹을 전부 쓴다', () => {
    expect(CATEGORY_GROUPS).toHaveLength(7)
    const used = new Set(Object.values(FIXTURE))
    for (const g of CATEGORY_GROUPS) expect(used.has(g), g).toBe(true)
  })

  it('미매핑은 던지지 않고 기타를 반환한다 — 새 분류 추가는 정상 운영이다', () => {
    expect(categoryGroup('신규분류2027')).toBe('기타')
    expect(isKnownCategory('신규분류2027')).toBe(false)
  })

  it('빈 문자열도 기타다 (category는 필수지만 방어)', () => {
    expect(categoryGroup('')).toBe('기타')
  })
})

describe('unmappedCategories', () => {
  it('미매핑 원시값만 중복 없이 정렬해 모은다', () => {
    const items = [
      { category: '전시/미술' },
      { category: '신규B' },
      { category: '신규A' },
      { category: '신규B' },
      { category: '기타' }, // 알려진 값 — 수집 대상이 아니다
    ]
    expect(unmappedCategories(items)).toEqual(['신규A', '신규B'])
  })

  it('전부 매핑돼 있으면 빈 배열 — 이게 정상 상태다', () => {
    expect(unmappedCategories([{ category: '도시공원' }])).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/category.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/category"`

- [ ] **Step 3: 구현**

`src/lib/category.ts`:

```ts
export const CATEGORY_GROUPS = [
  '전시', '체험·배움', '공원·자연', '역사·명소', '축제', '공연', '기타',
] as const

export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]

/**
 * 원시 분류값 → 그룹. 정확 일치만 매핑한다 — 부분 문자열 추측은
 * '기타역사유적지' 같은 값에서 어느 쪽('기타'? '역사'?)인지 애매해진다.
 *
 * 2026-08-31 실측 53종(행사 18 + 장소 37, '전시시설'·'축제/공연/행사' 공유).
 * 배정 근거는 스펙 6장 표 — 이 표에서 전시 320 / 체험·배움 247 / 공원·자연 196 /
 * 역사·명소 191 / 축제 75 / 공연 75 / 기타 13이 정확히 재현된다.
 */
const GROUP_BY_RAW: Record<string, CategoryGroup> = {
  // 전시 — 행사 168(전시/미술 129 + 전시시설 39) + 장소 152
  '전시/미술': '전시', '전시시설': '전시', '박물관': '전시', '미술관/화랑': '전시',
  '기타전시시설': '전시', '전시회': '전시',
  // 체험·배움 — 행사 129(교육/체험) + 장소 118
  '교육/체험': '체험·배움', '기타체험': '체험·배움', '전통체험': '체험·배움',
  '공예체험': '체험·배움', '산업관광': '체험·배움', '교육시설': '체험·배움',
  '체험관광': '체험·배움', '산사체험': '체험·배움',
  // 공원·자연 — 장소 196 (100% 장소. kind가 이미 행사/장소를 가르므로 두 번째 축으로 동작한다)
  '도시공원': '공원·자연', '자연경관(산)': '공원·자연', '자연공원': '공원·자연',
  '웰니스관광': '공원·자연', '자연경관(하천)': '공원·자연', '자연관광': '공원·자연',
  '테마공원': '공원·자연', '레저스포츠시설': '공원·자연',
  // 역사·명소 — 장소 191 (100% 장소)
  '랜드마크관광': '역사·명소', '기타문화관광지': '역사·명소', '문화관광': '역사·명소',
  '종교성지': '역사·명소', '사적지': '역사·명소', '성/문': '역사·명소', '고궁': '역사·명소',
  '근대건축물': '역사·명소', '고분/능': '역사·명소', '역사유적지': '역사·명소',
  '기타역사유적지': '역사·명소', '역사관광': '역사·명소',
  // 축제 — 행사 27 + 장소 48
  '축제': '축제', '축제/공연/행사': '축제', '축제-문화/예술': '축제', '축제-기타': '축제',
  '축제-전통/역사': '축제', '축제-관광/체육': '축제', '축제-자연/경관': '축제',
  '축제-시민화합': '축제',
  // 공연 — 행사 51 + 장소 24
  '콘서트': '공연', '뮤지컬/오페라': '공연', '연극': '공연', '클래식': '공연',
  '국악': '공연', '무용': '공연', '영화': '공연', '공연시설': '공연', '공연': '공연',
  // 기타 — 행사 9 + 장소 4. 알려진 값도 표에 둔다: 미매핑 신값과 구분해야
  // unmappedCategories가 진짜 새 분류만 보고한다
  '기타': '기타', '행사시설': '기타',
}

/**
 * 미매핑은 던지지 않고 '기타'를 반환한다.
 * LLM_PROVIDER 규칙("알 수 없으면 던짐")과 다르게 가는 이유: 오타는 사람 실수라
 * 즉시 깨뜨리는 게 맞지만, 서울시가 새 분류를 추가하는 건 정상 운영이고
 * 그때마다 배치가 죽으면 안 된다. 대신 unmappedCategories로 수집해
 * stderr 경고 + meta.json.unmappedCategories로 보고한다(실패를 숨기지 않음).
 */
export function categoryGroup(raw: string): CategoryGroup {
  return GROUP_BY_RAW[raw] ?? '기타'
}

export function isKnownCategory(raw: string): boolean {
  return raw in GROUP_BY_RAW
}

/** 미매핑 원시값을 중복 없이 정렬해 돌려준다. 비어 있는 게 정상 상태다 */
export function unmappedCategories(items: ReadonlyArray<{ category: string }>): string[] {
  return [...new Set(items.map((i) => i.category).filter((c) => !isKnownCategory(c)))].sort()
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/category.test.ts`
Expected: PASS (6개 통과)

- [ ] **Step 5: 실데이터 대조 (일회성 확인 — 테스트 파일에 넣지 않는다)**

```bash
node --experimental-strip-types -e "
import { categoryGroup, unmappedCategories } from './src/lib/category.ts'
import { readFileSync } from 'node:fs'
const places = JSON.parse(readFileSync('data/places.json', 'utf8')).items
const meta = JSON.parse(readFileSync('data/meta.json', 'utf8'))
const week = JSON.parse(readFileSync('data/events/' + meta.weekKey + '.json', 'utf8')).items
const all = [...week, ...places]
console.log('미매핑:', unmappedCategories(all))
const counts = {}
for (const i of all) counts[categoryGroup(i.category)] = (counts[categoryGroup(i.category)] ?? 0) + 1
console.log(counts)
"
```

Expected: `미매핑: []`. 그룹 분포가 스펙 6장 표와 같은 자릿수인지 눈으로 확인 (이번 주 파일 기준이라 표의 3주 합집합 수치와 정확히 같지는 않다).

이 스크립트가 안 돌면(`--experimental-strip-types` 미지원 Node) `npx tsx -e "…"`로 같은 코드를 돌린다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/category.ts tests/lib/category.test.ts
git commit -m "feat: 원시 카테고리 53종을 6그룹+기타로 정규화

두 소스의 분류값('기타역사유적지' 등)이 화면에 그대로 도달하고 있었다.
원본 어휘는 사용자에게 도달하기 전에 번역한다(PRODUCT.md).
미매핑은 던지지 않고 기타로 보낸다 — 서울시의 새 분류 추가는 정상
운영이라 배치가 죽으면 안 된다. 대신 수집해서 meta로 보고한다."
```

---

## Task 2: `src/lib/dates.ts` 확장 — `addDays` · `weekdayOf` · `relativeDateLabel`

시간 축 그룹(Task 6)과 탐색 목록의 날짜 표기가 쓸 재료를 기존 날짜 모듈에 더한다. **상대 표현이 먼저다** — `오늘까지` · `9/3 시작` · `토·일` (스펙 7장). PRODUCT.md의 "절대 날짜보다 '오늘까지'가 앞선다"를 시간 축 안에서도 지키는 구현이다. 크리틱 휴리스틱 2("날짜는 2/24(화) – 8/20(목)이지 '오늘까지'가 아님")의 탐색 쪽 응답이기도 하다.

**Files:**
- Modify: `src/lib/dates.ts`
- Test: `tests/lib/dates.test.ts` (추가)

**Interfaces:**
- Consumes: 기존 `formatDay`(파일 내부 private) 재사용
- Produces:
  - `addDays(iso: string, days: number): string` — `YYYY-MM-DD` 산술. Task 3·6이 쓴다
  - `weekdayOf(iso: string): number` — **0=일 … 6=토** (JS `getDay()` 규약 — `closedWeekdays`와 동일)
  - `relativeDateLabel(startDate: string, endDate: string, today: string): string` — Task 9·10의 행이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/dates.test.ts`에 추가한다 (기존 describe들은 건드리지 않는다):

```ts
import { addDays, relativeDateLabel, weekdayOf } from '~/lib/dates'

describe('addDays', () => {
  it('일 단위 산술', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-08-31', -1)).toBe('2026-08-30')
  })

  it('월·해를 넘는다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-08-31', 56)).toBe('2026-10-26') // 8주 지평의 실제 값
  })
})

describe('weekdayOf', () => {
  it('0=일 … 6=토 (closedWeekdays와 같은 규약)', () => {
    expect(weekdayOf('2026-08-31')).toBe(1) // 월요일
    expect(weekdayOf('2026-09-05')).toBe(6) // 토요일
    expect(weekdayOf('2026-09-06')).toBe(0) // 일요일
  })
})

describe('relativeDateLabel', () => {
  const TODAY = '2026-08-31' // 월요일

  it('진행 중이고 오늘 끝나면 오늘까지 — 절대 날짜보다 먼저다', () => {
    expect(relativeDateLabel('2026-02-24', '2026-08-31', TODAY)).toBe('오늘까지')
  })

  it('진행 중이면 종료일로 말한다', () => {
    expect(relativeDateLabel('2026-02-24', '2026-11-30', TODAY)).toBe('11/30까지')
  })

  it('아직 시작 전이면 시작일로 말한다', () => {
    expect(relativeDateLabel('2026-09-03', '2026-11-30', TODAY)).toBe('9/3 시작')
  })

  it('다가오는 주말에 딱 맞으면 토·일', () => {
    expect(relativeDateLabel('2026-09-05', '2026-09-06', TODAY)).toBe('토·일')
  })

  it('주말을 넘치면 토·일이 아니다', () => {
    expect(relativeDateLabel('2026-09-05', '2026-09-07', TODAY)).toBe('9/5 시작')
  })

  it('오늘이 토·일이면 토·일 라벨을 쓰지 않는다 — 다음 주말과 오독된다', () => {
    // 오늘 = 2026-09-05(토). 다음 주말(9/12~13)에 딱 맞아도 날짜로 말한다
    expect(relativeDateLabel('2026-09-12', '2026-09-13', '2026-09-05')).toBe('9/12 시작')
  })

  it('오늘 시작하는 것은 진행 중으로 취급한다', () => {
    expect(relativeDateLabel('2026-08-31', '2026-09-14', TODAY)).toBe('9/14까지')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/dates.test.ts`
Expected: FAIL — `addDays is not exported` (기존 테스트는 그대로 초록)

- [ ] **Step 3: 구현**

`src/lib/dates.ts` 끝에 추가한다 (`DAY_MS` 상수는 파일 상단에):

```ts
const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' ± 일수. UTC로 계산하므로 실행 환경 타임존과 무관하다 */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → 0=일 … 6=토. closedWeekdays·formatDay와 같은 규약 */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

/** 'YYYY-MM-DD' → '9/3'. 요일 없이 월/일만 (기존 private formatMonthDay 재사용) */

/**
 * 탐색 목록의 상대 날짜(스펙 7장). 절대 날짜보다 '오늘까지'가 앞선다(PRODUCT.md).
 * - 진행 중: '오늘까지' 또는 'M/D까지'
 * - 시작 전: 다가오는 주말(토~일)에 딱 맞으면 '토·일', 아니면 'M/D 시작'
 * '토·일'은 오늘이 월~금일 때만 쓴다 — 주말에 보면 다음 주말과 오독된다.
 */
export function relativeDateLabel(startDate: string, endDate: string, today: string): string {
  if (startDate > today) {
    const wd = weekdayOf(today)
    if (wd >= 1 && wd <= 5) {
      const sat = addDays(today, 6 - wd)
      if (startDate === sat && endDate === addDays(sat, 1)) return '토·일'
    }
    return `${formatMonthDay(startDate)} 시작`
  }
  if (endDate === today) return '오늘까지'
  return `${formatMonthDay(endDate)}까지`
}
```

`formatMonthDay`는 이미 파일에 있는 private 함수다 — export하지 않고 같은 파일 안에서 재사용한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/dates.test.ts`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dates.ts tests/lib/dates.test.ts
git commit -m "feat: 날짜 유틸에 addDays·weekdayOf·relativeDateLabel 추가

탐색 목록의 날짜는 상대 표현이 먼저다 — 오늘까지 · 9/3 시작 · 토·일.
절대 날짜 범위는 '내일 끝난다'를 숨긴다는 크리틱(휴리스틱 2)의 응답.
토·일 라벨은 평일에만 쓴다 — 주말에 보면 다음 주말과 오독된다."
```

---

## Task 3: `src/pipeline/select-catalog.ts` — 8주 카탈로그 선정 + 이상치 격리

`selectCatalog(events, places, today, horizonWeeks = 8)` — 순수 함수. `today`를 인자로 받는 프로젝트 관용구를 따른다(내부 `new Date()` 금지). 선정 조건은 `startDate <= today + 8주 && endDate >= today`(스펙 4장).

**이상치 처리:** `endDate > today + 3년`이면 데이터 오류로 판정해 **제외**하고 `anomalies`에 id·원본 값을 남긴다. 조건만 쓰면 `2626-08-08` 같은 항목이 목록 끝에 영원히 남는다. 실측 대상 3건: `sc-1vbax94`(2626-08-08) · `sc-11jahml`(2099-12-31) · `sc-1opz6ug`(2029-12-30). `dates.ts`의 '상시' 규칙(+2년)과 기준이 다른 이유: 그쪽은 **표기** 방어이고 여기는 **데이터 오류 판정**이다(스펙 4장이 +3년으로 못박음).

`districtFromAddress`도 여기 둔다 — 슬림 투영(Task 4)이 장소 자치구를 주소에서 파생할 때 쓴다("스펙에 없는 구현 결정" #2).

**Files:**
- Create: `src/pipeline/select-catalog.ts`
- Test: `tests/pipeline/select-catalog.test.ts`

**Interfaces:**
- Consumes: `addDays` (`~/lib/dates`, Task 2), `EventItem`/`PlaceItem` (`~/types/item`)
- Produces:
  - `interface CatalogAnomaly { id: string; endDate: string }`
  - `interface CatalogSelection { events: EventItem[]; places: PlaceItem[]; horizonEnd: string; anomalies: CatalogAnomaly[] }`
  - `selectCatalog(events: EventItem[], places: PlaceItem[], today: string, horizonWeeks?: number): CatalogSelection`
  - `districtFromAddress(address?: string): string | undefined`
  - Task 4의 `buildCatalogIndex`, Task 5의 run 연결이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/select-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { districtFromAddress, selectCatalog } from '~/pipeline/select-catalog'
import type { EventItem, PlaceItem } from '~/types/item'

const TODAY = '2026-08-31'

function ev(id: string, startDate: string, endDate: string): EventItem {
  return {
    id, source: 'seoul-culture', kind: 'event', title: `행사 ${id}`,
    category: '전시/미술', place: '어딘가', startDate, endDate,
  }
}

const somePlace: PlaceItem = {
  id: 'vs-1', source: 'visit-seoul', kind: 'place', title: '장소',
  category: '도시공원', place: '장소',
}

describe('selectCatalog', () => {
  it('horizonEnd는 today + 8주다', () => {
    expect(selectCatalog([], [], TODAY).horizonEnd).toBe('2026-10-26')
  })

  it('horizonWeeks 인자로 지평을 바꿀 수 있다', () => {
    expect(selectCatalog([], [], TODAY, 1).horizonEnd).toBe('2026-09-07')
  })

  it('경계 안쪽: 오늘 끝나는 것, 지평 마지막 날 시작하는 것 — 둘 다 담는다', () => {
    const events = [ev('sc-오늘끝', '2026-08-01', '2026-08-31'), ev('sc-지평끝시작', '2026-10-26', '2026-12-01')]
    expect(selectCatalog(events, [], TODAY).events.map((e) => e.id)).toEqual([
      'sc-오늘끝', 'sc-지평끝시작',
    ])
  })

  it('경계 바깥쪽: 어제 끝난 것, 지평 다음 날 시작하는 것 — 둘 다 뺀다', () => {
    const events = [ev('sc-어제끝', '2026-08-01', '2026-08-30'), ev('sc-지평밖', '2026-10-27', '2026-12-01')]
    expect(selectCatalog(events, [], TODAY).events).toEqual([])
  })

  it('endDate > today+3년은 이상치로 제외하고 id·원본 값을 남긴다 — 조용히 버리지 않는다', () => {
    const events = [ev('sc-2626', '2026-08-01', '2626-08-08'), ev('sc-정상', '2026-08-01', '2026-12-31')]
    const out = selectCatalog(events, [], TODAY)
    expect(out.events.map((e) => e.id)).toEqual(['sc-정상'])
    expect(out.anomalies).toEqual([{ id: 'sc-2626', endDate: '2626-08-08' }])
  })

  it('정확히 today+3년은 이상치가 아니다 — 초과만 이상치다', () => {
    const out = selectCatalog([ev('sc-3년', '2026-08-01', '2029-08-31')], [], TODAY)
    expect(out.events.map((e) => e.id)).toEqual(['sc-3년'])
    expect(out.anomalies).toEqual([])
  })

  it('장소는 시간 조건 없이 전부 통과한다 — 장소는 주에 묶이지 않는다', () => {
    expect(selectCatalog([], [somePlace], TODAY).places).toEqual([somePlace])
  })

  it('today는 인자다 — 같은 입력이면 실행 날짜와 무관하게 같은 결과', () => {
    const events = [ev('sc-a', '2026-09-01', '2026-09-02')]
    expect(selectCatalog(events, [], '2026-08-31').events).toHaveLength(1)
    expect(selectCatalog(events, [], '2026-12-01').events).toHaveLength(0)
  })
})

describe('districtFromAddress', () => {
  it('주소에서 자치구를 뽑는다', () => {
    expect(districtFromAddress('서울 용산구 녹사평대로 150 (이태원동)')).toBe('용산구')
    expect(districtFromAddress('서울 종로구 삼청로 71-7')).toBe('종로구')
  })

  it('중구와 중랑구를 섞지 않는다', () => {
    expect(districtFromAddress('서울 중랑구 망우로 353')).toBe('중랑구')
    expect(districtFromAddress('서울 중구 세종대로 110')).toBe('중구')
  })

  it('주소가 없거나 자치구가 없으면 undefined — 0이나 빈 문자열로 채우지 않는다', () => {
    expect(districtFromAddress(undefined)).toBeUndefined()
    expect(districtFromAddress('경기 고양시 일산동구')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/select-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/select-catalog"`

- [ ] **Step 3: 구현**

`src/pipeline/select-catalog.ts`:

```ts
import { addDays } from '~/lib/dates'
import type { EventItem, PlaceItem } from '~/types/item'

export interface CatalogAnomaly {
  id: string
  endDate: string
}

export interface CatalogSelection {
  events: EventItem[]
  places: PlaceItem[]
  horizonEnd: string
  anomalies: CatalogAnomaly[]
}

/**
 * 탐색 카탈로그 선정(스펙 4장): startDate <= today+8주 && endDate >= today.
 * today는 인자다 — 내부 new Date() 금지(레포 규칙).
 *
 * endDate > today+3년은 데이터 오류로 판정해 제외한다. 조건만 쓰면
 * 2626-08-08 같은 원본 오타가 목록 끝에 영원히 남는다(실측 3건).
 * dates.ts의 '상시'(+2년)와 기준이 다르다 — 그쪽은 표기 방어, 여기는 오류 판정.
 * 조용히 버리지 않는다: anomalies로 반환하고 배치가 stderr + meta에 남긴다(Task 5).
 *
 * 장소는 시간 조건 없이 전부 통과한다 — 장소는 주에 묶이지 않는다(AGENTS.md).
 */
export function selectCatalog(
  events: EventItem[],
  places: PlaceItem[],
  today: string,
  horizonWeeks = 8,
): CatalogSelection {
  const horizonEnd = addDays(today, horizonWeeks * 7)
  // YYYY-MM-DD는 사전순 == 시간순. 연도에 +3만 하므로 윤일이 나와도 비교에는 지장이 없다
  const anomalyLimit = `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`

  const anomalies: CatalogAnomaly[] = []
  const selected: EventItem[] = []
  for (const e of events) {
    if (e.endDate > anomalyLimit) {
      anomalies.push({ id: e.id, endDate: e.endDate })
      continue
    }
    if (e.startDate <= horizonEnd && e.endDate >= today) selected.push(e)
  }
  return { events: selected, places, horizonEnd, anomalies }
}

/** 서울 25개 자치구. 하드코딩이 안전한 드문 경우 — 행정구역은 데이터보다 느리게 바뀐다 */
const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중랑구', '중구',
] as const

const DISTRICT_RE = new RegExp(SEOUL_DISTRICTS.join('|'))

/**
 * 주소에서 자치구를 파생한다. 장소 원본에는 district가 0/733이지만
 * address가 714/733에 있고 705건에서 자치구가 뽑힌다(2026-08-31 실측).
 * places.json은 건드리지 않는다 — 슬림 투영 시점에만 쓰는 파생값이다.
 * 실패 시 undefined — 좌표 규칙과 같은 태도(없으면 필드 생략).
 */
export function districtFromAddress(address?: string): string | undefined {
  return address ? (DISTRICT_RE.exec(address)?.[0] ?? undefined) : undefined
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/select-catalog.test.ts`
Expected: PASS (11개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/select-catalog.ts tests/pipeline/select-catalog.test.ts
git commit -m "feat: 8주 카탈로그 선정 selectCatalog 추가

주간 파일은 미래 시작 행사를 0건 담는다(score가 주 단위로 자르므로).
'다가오는 행사를 기다릴 수 없다'는 데이터 문제라 score 뒤에 선택
경로를 하나 더 낸다. endDate>+3년은 오류로 판정해 제외하되 anomalies로
남긴다 — 2626-08-08이 목록 끝에 영원히 남는 것도, 조용히 사라지는
것도 막는다. 장소 자치구는 주소에서 파생한다(원본 district 0/733)."
```

---

## Task 4: 데이터 계약 — `catalogIndexSchema` · `catalogEventsSchema` · `buildCatalogIndex`

스펙 5장의 계약을 코드로 만든다. `src/types/files.ts`에 스키마를 더하고(배치가 쓰는 스키마와 앱이 읽는 스키마가 같은 하나 — Plan 2 Task 1의 원칙 그대로), `select-catalog.ts`에 슬림 투영 `buildCatalogIndex`를 더한다.

슬림 항목은 **목록·필터·거리에 필요한 필드만** 담는다. 상세 정보는 SSG된 상세 페이지가 갖는다(그 원천이 `catalog.json` — "스펙에 없는 구현 결정" #1). 좌표가 없으면 필드를 **생략**한다(`0` 금지). `hours`는 파싱 성공한 526건만 담고 실패분은 필드 생략 — 생략이 곧 "영업시간 미상"의 데이터 표현이다.

**Files:**
- Modify: `src/types/files.ts`, `src/pipeline/select-catalog.ts`
- Test: `tests/pipeline/select-catalog.test.ts` (추가)

**Interfaces:**
- Consumes: `CATEGORY_GROUPS`/`categoryGroup` (Task 1), `CatalogSelection`/`districtFromAddress` (Task 3), `eventItemSchema`/`parsedHoursSchema` (`~/types/item`)
- Produces:
  - `catalogIndexSchema` / `catalogEventsSchema` (zod), `categoryGroupSchema`
  - `type CatalogIndexFile`, `type CatalogIndexItem`, `type CatalogEventIndexItem = Extract<CatalogIndexItem, { kind: 'event' }>`, `type CatalogPlaceIndexItem = Extract<CatalogIndexItem, { kind: 'place' }>`, `type CatalogEventsFile`
  - `buildCatalogIndex(sel: CatalogSelection, generatedAt: string): CatalogIndexFile`
  - Task 5의 emit, Task 6의 필터, Task 9·10의 화면이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/select-catalog.test.ts`에 추가:

```ts
import { buildCatalogIndex, selectCatalog } from '~/pipeline/select-catalog'
import { catalogIndexSchema } from '~/types/files'

function fullEvent(): EventItem {
  return {
    id: 'sc-full', source: 'seoul-culture', kind: 'event', title: '전시',
    category: '전시/미술', place: '시립미술관', district: '중구',
    startDate: '2026-09-03', endDate: '2026-11-30',
    lat: 37.56, lng: 126.97, isFree: true, imageUrl: 'https://example.com/p.jpg',
    // 슬림에서 빠져야 하는 필드들
    address: '서울 중구 덕수궁길 61', linkUrl: 'https://example.com', fee: '무료',
    summary: '요약', subwayInfo: '시청역',
  }
}

function fullPlace(): PlaceItem {
  return {
    id: 'vs-full', source: 'visit-seoul', kind: 'place', title: '서울숲',
    category: '도시공원', place: '서울숲', address: '서울 성동구 뚝섬로 273',
    lat: 37.54, lng: 127.04, isFree: true, imageUrl: 'https://example.com/s.jpg',
    useTime: '05:00~22:00', hours: { open: '05:00', close: '22:00', closedWeekdays: [] },
  }
}

describe('buildCatalogIndex', () => {
  const GENERATED = '2026-08-31T12:00:00.000Z'

  function build(events: EventItem[], places: PlaceItem[]) {
    return buildCatalogIndex(selectCatalog(events, places, TODAY), GENERATED)
  }

  it('스키마를 통과하는 파일을 만든다', () => {
    const file = build([fullEvent()], [fullPlace()])
    expect(() => catalogIndexSchema.parse(file)).not.toThrow()
    expect(file.generatedAt).toBe(GENERATED)
    expect(file.horizonEnd).toBe('2026-10-26')
    expect(file.items).toHaveLength(2)
  })

  it('행사 항목은 목록·필터에 필요한 필드만 담고 group을 계산한다', () => {
    const [item] = build([fullEvent()], []).items
    expect(item).toEqual({
      id: 'sc-full', kind: 'event', title: '전시', group: '전시', district: '중구',
      place: '시립미술관', lat: 37.56, lng: 126.97, isFree: true,
      imageUrl: 'https://example.com/p.jpg', startDate: '2026-09-03', endDate: '2026-11-30',
    })
    // 상세 전용 필드는 슬림에 없다 — payload 61KB가 200KB가 되는 것을 막는 결정(스펙 2장)
    expect(item).not.toHaveProperty('address')
    expect(item).not.toHaveProperty('linkUrl')
    expect(item).not.toHaveProperty('summary')
  })

  it('장소 항목은 자치구를 주소에서 파생하고 hours를 담는다', () => {
    const [item] = build([], [fullPlace()]).items
    expect(item).toEqual({
      id: 'vs-full', kind: 'place', title: '서울숲', group: '공원·자연', district: '성동구',
      lat: 37.54, lng: 127.04, isFree: true, imageUrl: 'https://example.com/s.jpg',
      hours: { open: '05:00', close: '22:00', closedWeekdays: [] },
    })
  })

  it('좌표가 없으면 필드를 생략한다 — 0으로 채우지 않는다', () => {
    const noCoords: PlaceItem = { ...fullPlace(), lat: undefined, lng: undefined }
    const [item] = build([], [noCoords]).items
    expect(item).not.toHaveProperty('lat')
    expect(item).not.toHaveProperty('lng')
  })

  it('hours 파싱 실패(null)는 필드 생략 — 생략이 곧 영업시간 미상이다', () => {
    const unparsed: PlaceItem = { ...fullPlace(), hours: null }
    const [item] = build([], [unparsed]).items
    expect(item).not.toHaveProperty('hours')
  })

  it('주소에서 자치구를 못 뽑으면 district를 생략한다', () => {
    const noAddr: PlaceItem = { ...fullPlace(), address: undefined }
    const [item] = build([], [noAddr]).items
    expect(item).not.toHaveProperty('district')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/select-catalog.test.ts`
Expected: FAIL — `buildCatalogIndex is not exported` / `catalogIndexSchema is not exported`

- [ ] **Step 3: `src/types/files.ts`에 스키마 추가**

기존 스키마 아래에 추가한다:

```ts
import { CATEGORY_GROUPS } from '~/lib/category'
import { eventItemSchema, parsedHoursSchema, placeItemSchema } from '~/types/item' // placeItemSchema는 기존 import

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const categoryGroupSchema = z.enum(CATEGORY_GROUPS)

/**
 * 탐색 카탈로그의 슬림 항목(스펙 5장). 목록·필터·거리에 필요한 필드만 담는다 —
 * 상세 정보는 SSG된 상세 페이지가 갖는다(원천은 catalog.json).
 * 좌표·hours·district는 없으면 필드 생략(0·null로 채우지 않음).
 */
export const catalogIndexItemSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(), kind: z.literal('event'), title: z.string().min(1),
    group: categoryGroupSchema, district: z.string().optional(), place: z.string(),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
    isFree: z.boolean().optional(), imageUrl: z.string().optional(),
    startDate: isoDateSchema, endDate: isoDateSchema,
  }),
  z.object({
    id: z.string(), kind: z.literal('place'), title: z.string().min(1),
    group: categoryGroupSchema, district: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
    isFree: z.boolean().optional(), imageUrl: z.string().optional(),
    hours: parsedHoursSchema.optional(),
  }),
])

export const catalogIndexSchema = z.object({
  generatedAt: z.string(),
  horizonEnd: isoDateSchema,
  items: z.array(catalogIndexItemSchema),
})

/** 8주 카탈로그 행사의 전체 필드 — 빌드 타임 전용. 상세 SSG의 원천이다 */
export const catalogEventsSchema = z.object({
  horizonEnd: isoDateSchema,
  items: z.array(eventItemSchema),
})

export type CatalogIndexFile = z.infer<typeof catalogIndexSchema>
export type CatalogIndexItem = z.infer<typeof catalogIndexItemSchema>
export type CatalogEventIndexItem = Extract<CatalogIndexItem, { kind: 'event' }>
export type CatalogPlaceIndexItem = Extract<CatalogIndexItem, { kind: 'place' }>
export type CatalogEventsFile = z.infer<typeof catalogEventsSchema>
```

`metaSchema`에는 두 필드를 추가한다 (**optional인 이유**: 이 태스크 시점의 커밋된 `meta.json`에는 아직 없다 — Task 5의 배치 실행부터 항상 기록된다):

```ts
export const metaSchema = z.object({
  updatedAt: z.string(),
  llmProvider: z.string(),
  sourceCounts: z.record(z.string(), z.number()),
  weekKey: weekKeySchema,
  counts: z.object({ events: z.number(), places: z.number() }),
  /** 카탈로그에서 제외한 endDate 이상치 건수. 실패를 숨기지 않는다(스펙 4장) */
  anomalies: z.number().int().optional(),
  /** 6그룹에 매핑되지 않아 '기타'로 노출 중인 원시 카테고리. 비어 있는 게 정상 */
  unmappedCategories: z.array(z.string()).optional(),
})
```

- [ ] **Step 4: `src/pipeline/select-catalog.ts`에 `buildCatalogIndex` 추가**

```ts
import { categoryGroup } from '~/lib/category'
import type { CatalogIndexFile, CatalogIndexItem } from '~/types/files'

/**
 * 슬림 투영(스펙 5장). 필드가 없으면 키 자체를 만들지 않는다 —
 * JSON.stringify의 undefined 탈락에 기대지 않고 여기서 생략을 보장한다.
 * 좌표는 쌍으로만 담는다: 한쪽만 있는 좌표는 좌표가 아니다.
 */
export function buildCatalogIndex(sel: CatalogSelection, generatedAt: string): CatalogIndexFile {
  const events = sel.events.map((e): CatalogIndexItem => ({
    id: e.id, kind: 'event', title: e.title, group: categoryGroup(e.category),
    ...(e.district !== undefined && { district: e.district }),
    place: e.place,
    ...(e.lat !== undefined && e.lng !== undefined && { lat: e.lat, lng: e.lng }),
    ...(e.isFree !== undefined && { isFree: e.isFree }),
    ...(e.imageUrl !== undefined && { imageUrl: e.imageUrl }),
    startDate: e.startDate, endDate: e.endDate,
  }))

  const places = sel.places.map((p): CatalogIndexItem => {
    // 장소 원본에는 district가 없다(0/733). 주소에서 파생한다 — 원본은 건드리지 않는다
    const district = p.district ?? districtFromAddress(p.address)
    return {
      id: p.id, kind: 'place', title: p.title, group: categoryGroup(p.category),
      ...(district !== undefined && { district }),
      ...(p.lat !== undefined && p.lng !== undefined && { lat: p.lat, lng: p.lng }),
      ...(p.isFree !== undefined && { isFree: p.isFree }),
      ...(p.imageUrl !== undefined && { imageUrl: p.imageUrl }),
      // hours: null(파싱 실패)도 undefined(원문 없음)도 생략 — 생략이 곧 '영업시간 미상'
      ...(p.hours != null && { hours: p.hours }),
    }
  })

  return { generatedAt, horizonEnd: sel.horizonEnd, items: [...events, ...places] }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/select-catalog.test.ts`
Expected: PASS (Task 3의 11개 + 6개)

- [ ] **Step 6: 전체 테스트 확인**

Run: `npm test`
Expected: PASS — `metaSchema` 확장이 optional이므로 기존 로더·emit 테스트가 그대로 초록이어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add src/types/files.ts src/pipeline/select-catalog.ts tests/pipeline/select-catalog.test.ts
git commit -m "feat: 탐색 카탈로그의 데이터 계약과 슬림 투영 추가

index.json은 목록·필터·거리에 필요한 필드만 담는다 — 전체 필드는
200KB라 부담이고 상세는 SSG된 페이지가 갖는다. 좌표·hours·district는
없으면 키 자체를 생략한다(0·null 금지). 장소 자치구는 주소에서 파생 —
원본 places.json의 district는 0/733이다."
```

---

## Task 5: `emit`·`run` 연결 + 배치 실행 → `data/index.json`·`data/catalog.json`

배치가 실제로 두 파일을 내놓게 한다. `emit`은 기존 규율대로 **전부 검증한 뒤에** 쓰기 시작하고, 참조 무결성 검사를 인덱스까지 넓힌다. `runPipeline`은 병합 직후(주간 창으로 자르기 **전**) `selectCatalog`를 부른다 — 주간 창으로 자른 뒤에는 미래 시작 행사가 이미 사라져 있기 때문이다. 이상치와 미매핑은 stderr로 보고한다("실패를 숨기지 않는다").

마지막에 `npm run batch`를 실제로 돌려 파일을 만들고, 커밋된 실데이터로 스모크 테스트를 확장한다.

**Files:**
- Modify: `src/pipeline/emit.ts`, `src/pipeline/run.ts`, `src/data/load.ts`
- Test: `tests/pipeline/emit.test.ts` (수정+추가), `tests/pipeline/run.test.ts` (추가), `tests/data/load.test.ts` (추가), `tests/data/smoke.test.ts` (추가)
- 산출: `data/index.json`, `data/catalog.json` (+ 배치가 갱신하는 기존 파일들)

**Interfaces:**
- Consumes: `selectCatalog`/`buildCatalogIndex`/`CatalogSelection` (Task 3·4), `unmappedCategories` (Task 1), `catalogIndexSchema`/`catalogEventsSchema` (Task 4)
- Produces:
  - `EmitPayload`에 `catalog: CatalogSelection`, `unmappedCategories: string[]` 추가
  - `loadCatalog(dataDir?: string): CatalogEventsFile`, `loadIndex(dataDir?: string): CatalogIndexFile`
  - 커밋된 `data/index.json`·`data/catalog.json` — Task 8의 프리렌더 목록과 Task 9의 fetch가 읽는다

- [ ] **Step 1: emit 테스트 확장 (실패 확인용)**

`tests/pipeline/emit.test.ts`의 `basePayload`에 두 필드를 추가한다 (기존 테스트가 새 시그니처로 컴파일되도록):

```ts
const basePayload = {
  weekKey: '2026-W33',
  events: [event],
  places: [place],
  curated: [{ id: 'sc-a', reason: '무료 전시' }],
  curatedPlaces: ['vs-b'],
  providerName: 'ollama',
  cache: {},
  sourceCounts: { 'seoul-culture': 1, 'visit-seoul': 1 },
  catalog: {
    events: [event],
    places: [place],
    horizonEnd: '2026-10-26',
    anomalies: [{ id: 'sc-이상', endDate: '2626-08-08' }],
  },
  unmappedCategories: ['수수께끼분류'],
}
```

그리고 새 describe를 추가한다:

```ts
describe('emit: 탐색 카탈로그', () => {
  const NOW = new Date('2026-08-13T00:00:00Z')

  it('catalog.json에 8주 행사의 전체 필드를 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: NOW })
    expect(await readJson('catalog.json')).toMatchObject({
      horizonEnd: '2026-10-26',
      items: [{ id: 'sc-a', source: 'seoul-culture' }], // source가 있다 = 전체 필드
    })
  })

  it('index.json에 슬림 항목을 쓰고 generatedAt은 meta.updatedAt과 같은 now다', async () => {
    await emit(basePayload, { dataDir: dir, now: NOW })
    const index = await readJson('index.json')
    expect(index.generatedAt).toBe('2026-08-13T00:00:00.000Z')
    expect(index.items).toHaveLength(2) // 행사 1 + 장소 1
    expect(index.items[0]).not.toHaveProperty('source') // 슬림이다
  })

  it('meta에 이상치 건수와 미매핑 카테고리를 남긴다 — 실패를 숨기지 않는다', async () => {
    await emit(basePayload, { dataDir: dir, now: NOW })
    expect(await readJson('meta.json')).toMatchObject({
      anomalies: 1,
      unmappedCategories: ['수수께끼분류'],
    })
  })

  it('카탈로그에 스키마 위반이 있으면 어떤 파일도 쓰지 않는다', async () => {
    const bad = {
      ...basePayload,
      catalog: { ...basePayload.catalog, events: [{ ...event, id: 'bad:id' }] as EventItem[] },
    }
    await expect(emit(bad, { dataDir: dir, now: NOW })).rejects.toThrow()
    for (const f of ['events/2026-W33.json', 'places.json', 'catalog.json', 'index.json', 'meta.json']) {
      await expect(readJson(f)).rejects.toThrow()
    }
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/emit.test.ts`
Expected: FAIL — 새 describe 4개가 깨진다 (`catalog.json` 없음 등). 기존 테스트는 payload 필드가 늘어도 통과한다(emit이 아직 안 읽으므로).

- [ ] **Step 3: `src/pipeline/emit.ts` 구현**

import에 추가:

```ts
import { buildCatalogIndex, type CatalogSelection } from '~/pipeline/select-catalog'
import {
  catalogEventsSchema,
  catalogIndexSchema,
  curatedFileSchema,
  metaSchema,
  placesFileSchema,
  weeklyEventsSchema,
} from '~/types/files'
```

`EmitPayload`에 두 필드:

```ts
export interface EmitPayload {
  weekKey: string
  events: EventItem[]
  places: PlaceItem[]
  curated: CuratedEntry[]
  curatedPlaces: string[]
  providerName: string
  cache: DetailCache
  sourceCounts: Record<string, number>
  /** score 뒤의 선택 경로(스펙 4장) — 8주 카탈로그. 주간 events와 겹치지만 다른 창이다 */
  catalog: CatalogSelection
  /** 6그룹에 매핑 안 된 원시 카테고리 — meta로 보고된다 */
  unmappedCategories: string[]
}
```

`emit` 본문 — `curated` 검증 블록 뒤, `meta` 검증 앞에 추가:

```ts
  const catalogEvents = catalogEventsSchema.parse({
    horizonEnd: payload.catalog.horizonEnd,
    items: payload.catalog.events,
  })
  // generatedAt은 meta.updatedAt과 같은 now — 두 도장이 어긋나면 어느 쪽이 진실인지 알 수 없다
  const index = catalogIndexSchema.parse(buildCatalogIndex(payload.catalog, now.toISOString()))

  // 참조 무결성: 인덱스가 가리키는 id는 상세 SSG의 원천에 실제로 있어야 한다.
  // 지금은 둘 다 같은 selection에서 나와 정의상 일치하지만, curated 검사와 같은 이유로
  // 명시한다 — 투영 코드가 갈라지는 미래의 버그를 여기서 잡는다
  const catalogEventIds = new Set(catalogEvents.items.map((i) => i.id))
  for (const item of index.items) {
    if (item.kind === 'event' && !catalogEventIds.has(item.id)) {
      throw new Error(`인덱스가 카탈로그에 없는 행사를 가리킵니다: ${item.id}`)
    }
    if (item.kind === 'place' && !placeIds.has(item.id)) {
      throw new Error(`인덱스가 존재하지 않는 장소를 가리킵니다: ${item.id}`)
    }
  }
```

`meta` 검증에 두 필드 추가:

```ts
  const meta = metaSchema.parse({
    updatedAt: now.toISOString(),
    llmProvider: payload.providerName,
    sourceCounts: payload.sourceCounts,
    weekKey: payload.weekKey,
    counts: { events: weekly.items.length, places: places.items.length },
    anomalies: payload.catalog.anomalies.length,
    unmappedCategories: payload.unmappedCategories,
  })
```

쓰기 블록에 두 줄 추가 (기존 쓰기 뒤):

```ts
  await writeJson(join(dataDir, 'catalog.json'), catalogEvents)
  await writeJson(join(dataDir, 'index.json'), index)
```

- [ ] **Step 4: emit 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/emit.test.ts`
Expected: PASS (기존 9개 + 신규 4개)

- [ ] **Step 5: run 테스트 확장 (실패 확인용)**

`tests/pipeline/run.test.ts`에 추가:

```ts
/** 주간 창(W33) 밖이지만 8주 지평(today 08-13 기준 ~10-08) 안의 미래 행사 */
const futureEvent: Item = {
  id: 'sc-미래', source: 'seoul-culture', kind: 'event', title: '가을 축제',
  category: '축제-문화/예술', place: '어딘가', startDate: '2026-09-20', endDate: '2026-09-22',
}

/** 원본 오타 — endDate가 3년 뒤를 넘는다 */
const farFuture: Item = {
  id: 'sc-이상치', source: 'seoul-culture', kind: 'event', title: '오타 행사',
  category: '전시/미술', place: '어딘가', startDate: '2026-08-10', endDate: '2626-08-08',
}

describe('runPipeline: 탐색 카탈로그', () => {
  // 기존 describe 안의 opts는 스코프 밖이라 여기서 따로 만든다 (같은 값)
  const catalogOpts = {
    sources: [
      fakeSource('seoul-culture', [scEvent, outOfWeek, endedEarlyThisWeek, futureEvent, farFuture]),
      fakeSource('visit-seoul', [vsPlace]),
    ],
    provider: new RuleOnlyProvider(),
    weekKey: '2026-W33',
    today: '2026-08-13',
    cache: {},
    curatedCount: 12,
    placeCount: 6,
  }

  it('카탈로그는 주간 창 밖의 미래 행사를 담는다 — 주간 events에는 없다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.events.map((e) => e.id)).toContain('sc-미래')
    expect(out.events.map((e) => e.id)).not.toContain('sc-미래')
  })

  it('이미 끝난 행사는 카탈로그에도 없다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.events.map((e) => e.id)).not.toContain('sc-old')
  })

  it('endDate 이상치는 카탈로그에서 빠지고 anomalies에 남는다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.events.map((e) => e.id)).not.toContain('sc-이상치')
    expect(out.catalog.anomalies).toEqual([{ id: 'sc-이상치', endDate: '2626-08-08' }])
  })

  it("미매핑 카테고리를 수집한다 — 픽스처의 '전시'는 원시값이 아니다('전시/미술'이 원시값)", async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.unmappedCategories).toEqual(['전시'])
  })

  it('카탈로그의 장소는 places와 같다', async () => {
    const out = await runPipeline(catalogOpts)
    expect(out.catalog.places).toEqual(out.places)
  })
})
```

Run: `npx vitest run tests/pipeline/run.test.ts`
Expected: FAIL — `out.catalog`가 없다.

- [ ] **Step 6: `src/pipeline/run.ts` 구현**

import 추가:

```ts
import { unmappedCategories } from '~/lib/category'
import { selectCatalog } from '~/pipeline/select-catalog'
```

`mergeItems` 호출 뒤의 필터 블록을 다음으로 교체한다 (주간 창으로 자르기 **전에** 카탈로그를 골라야 미래 행사가 살아 있다):

```ts
  const allEvents = merged.filter((i): i is EventItem => i.kind === 'event')
  const places = merged.filter((i): i is PlaceItem => i.kind === 'place')

  // 카탈로그는 주간 창과 무관한 8주 지평이다 — 주간 필터보다 먼저 골라야
  // 미래 시작 행사가 살아 있다(주간 파일의 미래 행사는 0건 — 스펙 3장 실측)
  const catalog = selectCatalog(allEvents, places, today)
  for (const a of catalog.anomalies) {
    // stderr — 실패를 숨기지 않는다. 건수는 emit이 meta.anomalies로 남긴다
    console.error(`[카탈로그] endDate 이상치 제외: ${a.id} (${a.endDate})`)
  }
  const unmapped = unmappedCategories([...catalog.events, ...catalog.places])
  if (unmapped.length > 0) {
    console.error(`[카탈로그] 미매핑 카테고리 ${unmapped.length}건 → '기타'로 노출: ${unmapped.join(', ')}`)
  }
  console.log(`카탈로그 ${catalog.events.length}건 (오늘~${catalog.horizonEnd}) / 이상치 ${catalog.anomalies.length}건`)

  // 과거 컷오프: 유효 시작일은 max(주 시작일, 오늘).
  // 주 시작일만 쓰면 월요일에 끝난 행사가 목요일 화면에 남는다.
  const { start, end } = weekRange(weekKey)
  const from = today > start ? today : start
  const events = allEvents.filter((e) => e.startDate <= end && e.endDate >= from)
```

return에 두 필드 추가:

```ts
  return {
    weekKey,
    events,
    places,
    curated: entries,
    curatedPlaces: pickPlaces(places, weekKey, placeCount),
    providerName,
    cache,
    sourceCounts,
    catalog,
    unmappedCategories: unmapped,
  }
```

- [ ] **Step 7: run 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/run.test.ts`
Expected: PASS (기존 8개 + 신규 5개)

- [ ] **Step 8: 로더 추가 (TDD)**

`tests/data/load.test.ts`의 `beforeEach`에 두 파일을 추가로 쓴다:

```ts
    await writeFile(
      join(dir, 'catalog.json'),
      JSON.stringify({ horizonEnd: '2026-10-26', items: [validEvent] }),
    )
    await writeFile(
      join(dir, 'index.json'),
      JSON.stringify({
        generatedAt: '2026-08-31T00:00:00.000Z',
        horizonEnd: '2026-10-26',
        items: [{
          id: 'sc-1', kind: 'event', title: '행사', group: '전시',
          place: '어딘가', startDate: '2026-08-17', endDate: '2026-08-23',
        }],
      }),
    )
```

테스트 추가:

```ts
  it('loadCatalog가 8주 카탈로그를 검증하며 읽는다', () => {
    expect(loadCatalog(dir).items[0]!.id).toBe('sc-1')
    expect(loadCatalog(dir).horizonEnd).toBe('2026-10-26')
  })

  it('loadIndex가 슬림 인덱스를 검증하며 읽는다', () => {
    expect(loadIndex(dir).items).toHaveLength(1)
  })

  it('인덱스 스키마가 어긋나면 던진다', async () => {
    await writeFile(join(dir, 'index.json'), JSON.stringify({ items: [] }))
    expect(() => loadIndex(dir)).toThrow()
  })
```

실패 확인 후 `src/data/load.ts`에 구현:

```ts
import {
  catalogEventsSchema,
  catalogIndexSchema,
  type CatalogEventsFile,
  type CatalogIndexFile,
  // …기존 import 유지
} from '~/types/files'

export function loadCatalog(dataDir = 'data'): CatalogEventsFile {
  return catalogEventsSchema.parse(readJson(dataDir, 'catalog.json'))
}

export function loadIndex(dataDir = 'data'): CatalogIndexFile {
  return catalogIndexSchema.parse(readJson(dataDir, 'index.json'))
}
```

Run: `npx vitest run tests/data/load.test.ts`
Expected: PASS

- [ ] **Step 9: 배치 실행 — 파일을 실제로 만든다**

```bash
npm run batch 2>&1 | tee /tmp/batch-browse.log
```

키는 `.env.local`에 있다(AGENTS.md). 캐시가 따뜻하므로 수 분 안에 끝난다. 확인할 것:

1. stderr에 `[카탈로그] endDate 이상치 제외` 3줄이 나왔는가 (`sc-1vbax94`·`sc-11jahml`·`sc-1opz6ug` — 원본이 바뀌었으면 다를 수 있다. 나온 대로 기록)
2. `[카탈로그] 미매핑 카테고리` 경고가 **없는가** — 나왔다면 Task 1의 매핑에 그 값을 추가하고 다시 돌린다 (새 원시값이 등장했다는 뜻)
3. 오늘이 배치 기준 새 주차면 `weekKey`가 바뀐다 — 정상이다. 홈은 `meta.weekKey`를 읽으므로 그대로 동작한다

크기 실측 후 이 계획의 "실측 데이터" 절 payload 항목에 기록:

```bash
node -e "
const { readFileSync } = require('fs'); const { gzipSync } = require('zlib');
for (const f of ['data/index.json', 'data/catalog.json']) {
  const raw = readFileSync(f)
  console.log(f, (raw.length / 1024).toFixed(0) + 'KB raw', (gzipSync(raw).length / 1024).toFixed(0) + 'KB gzip')
}
const idx = JSON.parse(readFileSync('data/index.json', 'utf8'))
console.log('items:', idx.items.length,
  'events:', idx.items.filter((i) => i.kind === 'event').length,
  'places:', idx.items.filter((i) => i.kind === 'place').length,
  'horizonEnd:', idx.horizonEnd)
"
```

Expected: 인덱스 ~1,400건, gzip ~85KB 안팎(스펙 3장 추정치). 크게 어긋나면(예: gzip 150KB↑) 멈추고 원인을 본다 — 슬림 투영에 상세 필드가 새고 있을 가능성.

- [ ] **Step 10: 실데이터 스모크 확장**

`tests/data/smoke.test.ts`에 추가:

```ts
import { loadCatalog, loadIndex } from '~/data/load'

/**
 * 탐색 카탈로그의 실데이터 무결성. 빌드(전량 프리렌더 + 클라이언트 fetch)가
 * 기대는 것과 정확히 같은 경로다.
 */
describe('실데이터 스모크: 탐색 카탈로그', () => {
  const index = loadIndex()
  const catalog = loadCatalog()
  const placesFile = loadPlaces()

  it('인덱스의 행사 id가 전부 catalog.json에서 해석된다 — 상세 SSG의 전제', () => {
    const ids = new Set(catalog.items.map((i) => i.id))
    for (const item of index.items) {
      if (item.kind === 'event') expect(ids.has(item.id), item.id).toBe(true)
    }
  })

  it('인덱스의 장소 id가 전부 places.json에서 해석된다', () => {
    const ids = new Set(placesFile.items.map((i) => i.id))
    for (const item of index.items) {
      if (item.kind === 'place') expect(ids.has(item.id), item.id).toBe(true)
    }
  })

  it('horizonEnd가 인덱스와 카탈로그에서 일치한다', () => {
    expect(index.horizonEnd).toBe(catalog.horizonEnd)
  })

  it('(0,0) 좌표가 없다 — 좌표 없으면 생략 규칙의 실데이터 검증', () => {
    for (const item of index.items) {
      if (item.lat !== undefined) expect(item.lat, item.id).not.toBe(0)
    }
  })

  it('meta에 anomalies·unmappedCategories가 기록돼 있다', () => {
    const meta = loadMeta()
    expect(meta.anomalies).toBeTypeOf('number')
    expect(Array.isArray(meta.unmappedCategories)).toBe(true)
  })
})
```

Run: `npx vitest run tests/data/smoke.test.ts`
Expected: PASS

- [ ] **Step 11: 전체 테스트 확인**

Run: `npm test`
Expected: PASS — 전체 초록.

- [ ] **Step 12: 커밋 (코드와 데이터를 함께)**

```bash
git add src/pipeline/emit.ts src/pipeline/run.ts src/data/load.ts \
  tests/pipeline/emit.test.ts tests/pipeline/run.test.ts tests/data/load.test.ts tests/data/smoke.test.ts \
  data/
git commit -m "feat: 배치가 탐색 카탈로그(index.json·catalog.json)를 내놓는다

selectCatalog를 주간 창 필터보다 먼저 부른다 — 주간 파일에는 미래
시작 행사가 0건이라(score가 주 단위로 자름) 그 뒤에는 늦다.
emit은 기존 규율대로 전부 검증한 뒤 쓰고, 인덱스 참조 무결성도
검사한다. 이상치·미매핑은 stderr + meta로 보고 — 실패를 숨기지 않는다.
실측: 인덱스 N건, NKB gzip (여기에 기록)"
```

---

## Task 6: `src/lib/browse-filter.ts` — 필터 · 시간 축 그룹핑 · 거리 정렬 · 완화 제안

탐색 화면의 두뇌 전부. 순수 함수 다섯: `applyFilters` / `groupByTimeline` / `sortByDistance` / `relaxSuggestions` / `formatDistance`. `now`·`today`는 전부 인자다.

**시간 축은 필터가 아니라 목록의 골격이다** (스펙 7장). 그룹은 시간 순으로 넷 — ①오늘~금요일(오늘이 토·일이면 생략) ②이번 주말 ③다음 주 ④월별(horizonEnd까지). **항목은 유효 시작일 `max(startDate, today)`가 속한 그룹에 한 번만 놓는다** — 홈의 `effectiveStart`와 같은 관용구. 결과: 진행 중인 장기 전시(82%)는 전부 첫 그룹에 모이고, 뒤 그룹은 자연히 "그때 새로 시작하는 것"만 남는다. 이게 "다가오는 행사를 기다린다"의 구현이다.

**`지금 열림`은 아는 것만 거른다.** hours가 있는 장소 중 닫힌 곳만 떨어뜨리고, hours 미상 207건은 남긴다(뷰가 "영업시간 미상"으로 표시 — Task 10). 행사는 hours 개념이 없으므로 건드리지 않는다 — `Event`와 `Place`는 시간 의미가 다르다(AGENTS.md).

**거리 정렬은 좌표 없는 항목을 버리지 않는다** — 거리 미상이지 존재 미상이 아니다. 끝에 id 순으로 붙인다(결정론).

**Files:**
- Create: `src/lib/browse-filter.ts`
- Test: `tests/lib/browse-filter.test.ts`

**Interfaces:**
- Consumes: `CatalogIndexItem`/`CatalogEventIndexItem` (`~/types/files`, Task 4), `CategoryGroup` (Task 1), `isOpenNow` (`~/lib/open-now` — 재사용, 스펙 10장), `haversineKm`/`LatLng` (`~/lib/geo` — 재사용), `addDays`/`weekdayOf` (Task 2)
- Produces:
  - `interface BrowseFilters { group?: CategoryGroup; district?: string; free?: boolean; open?: boolean }`
  - `applyFilters(items: CatalogIndexItem[], filters: BrowseFilters, now: Date): CatalogIndexItem[]`
  - `interface TimelineGroup { key: string; label: string; start: string; end: string; items: CatalogEventIndexItem[] }`
  - `groupByTimeline(events: CatalogEventIndexItem[], today: string, horizonEnd: string): TimelineGroup[]`
  - `interface DistanceEntry { item: CatalogIndexItem; km?: number }`
  - `sortByDistance(items: CatalogIndexItem[], origin: LatLng): DistanceEntry[]`
  - `type RelaxableFilter = 'group' | 'district' | 'free' | 'open'` / `interface RelaxSuggestion { filter: RelaxableFilter; count: number }`
  - `relaxSuggestions(items: CatalogIndexItem[], filters: BrowseFilters, now: Date): RelaxSuggestion[]`
  - `FILTER_LABELS: Record<RelaxableFilter, string>` / `formatDistance(km: number): string`
  - Task 9·10의 화면이 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/browse-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyFilters, formatDistance, groupByTimeline, relaxSuggestions, sortByDistance,
} from '~/lib/browse-filter'
import type { CatalogEventIndexItem, CatalogIndexItem, CatalogPlaceIndexItem } from '~/types/files'

const TODAY = '2026-08-31' // 월요일
const HORIZON = '2026-10-26'
/** KST 2026-09-01(화) 14:00 = UTC 05:00 — open-now 테스트와 같은 방식으로 순간을 고정 */
const NOW = new Date('2026-09-01T05:00:00Z')

function evIdx(id: string, over: Partial<CatalogEventIndexItem> = {}): CatalogEventIndexItem {
  return {
    id, kind: 'event', title: `행사 ${id}`, group: '전시', place: '어딘가',
    startDate: '2026-08-01', endDate: '2026-09-30', ...over,
  }
}

function plIdx(id: string, over: Partial<CatalogPlaceIndexItem> = {}): CatalogPlaceIndexItem {
  return { id, kind: 'place', title: `장소 ${id}`, group: '공원·자연', ...over }
}

describe('applyFilters', () => {
  it('그룹 필터 — 단일 선택', () => {
    const items: CatalogIndexItem[] = [evIdx('sc-전시'), evIdx('sc-공연', { group: '공연' })]
    expect(applyFilters(items, { group: '공연' }, NOW).map((i) => i.id)).toEqual(['sc-공연'])
  })

  it('자치구 필터 — district가 없는 항목은 매치되지 않는다', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-종로', { district: '종로구' }),
      evIdx('sc-미상'), // district 없음
    ]
    expect(applyFilters(items, { district: '종로구' }, NOW).map((i) => i.id)).toEqual(['sc-종로'])
  })

  it('무료만 — isFree가 true인 것만. 행사·장소 공통', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-무료', { isFree: true }),
      evIdx('sc-유료', { isFree: false }),
      plIdx('vs-무료', { isFree: true }),
      plIdx('vs-유료', { isFree: false }),
    ]
    expect(applyFilters(items, { free: true }, NOW).map((i) => i.id)).toEqual(['sc-무료', 'vs-무료'])
  })

  it('지금 열림 — 닫힌 장소만 떨어뜨리고, hours 미상은 남긴다', () => {
    const items: CatalogIndexItem[] = [
      plIdx('vs-열림', { hours: { open: '10:00', close: '18:00', closedWeekdays: [] } }),
      plIdx('vs-닫힘', { hours: { open: '19:00', close: '23:00', closedWeekdays: [] } }),
      plIdx('vs-미상'), // hours 없음 — 버리면 화면이 '안 열려 있다'고 거짓말한다(스펙 8장)
    ]
    expect(applyFilters(items, { open: true }, NOW).map((i) => i.id)).toEqual(['vs-열림', 'vs-미상'])
  })

  it('지금 열림은 행사를 건드리지 않는다 — 행사에는 hours 개념이 없다', () => {
    const items: CatalogIndexItem[] = [evIdx('sc-a')]
    expect(applyFilters(items, { open: true }, NOW)).toHaveLength(1)
  })

  it('필터 조합은 AND다', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-a', { group: '공연', district: '마포구', isFree: true }),
      evIdx('sc-b', { group: '공연', district: '마포구', isFree: false }),
      evIdx('sc-c', { group: '공연', district: '중구', isFree: true }),
    ]
    expect(
      applyFilters(items, { group: '공연', district: '마포구', free: true }, NOW).map((i) => i.id),
    ).toEqual(['sc-a'])
  })

  it('빈 필터는 전부 통과 — 기타 그룹도 전체에는 있다(스펙 7장)', () => {
    const items: CatalogIndexItem[] = [evIdx('sc-기타', { group: '기타' })]
    expect(applyFilters(items, {}, NOW)).toHaveLength(1)
  })
})

describe('groupByTimeline', () => {
  it('월요일 기준 그룹 경계: 이번 주 / 이번 주말 / 다음 주 / 월별', () => {
    const groups = groupByTimeline([], TODAY, HORIZON)
    expect(groups.map((g) => ({ label: g.label, start: g.start, end: g.end }))).toEqual([
      { label: '이번 주', start: '2026-08-31', end: '2026-09-04' },
      { label: '이번 주말', start: '2026-09-05', end: '2026-09-06' },
      { label: '다음 주', start: '2026-09-07', end: '2026-09-13' },
      { label: '9월', start: '2026-09-14', end: '2026-09-30' },
      { label: '10월', start: '2026-10-01', end: '2026-10-26' }, // horizonEnd에서 끊긴다
    ])
  })

  it('오늘이 토요일이면 이번 주 그룹이 없다', () => {
    const groups = groupByTimeline([], '2026-09-05', '2026-11-02')
    expect(groups[0]).toMatchObject({ label: '이번 주말', start: '2026-09-05', end: '2026-09-06' })
  })

  it('오늘이 일요일이면 이번 주말은 오늘 하루다', () => {
    const groups = groupByTimeline([], '2026-09-06', '2026-11-02')
    expect(groups[0]).toMatchObject({ label: '이번 주말', start: '2026-09-06', end: '2026-09-06' })
  })

  it('해를 넘는 월 그룹은 연도를 붙인다', () => {
    // 2026-11-30(월) + 8주 = 2027-01-25
    const labels = groupByTimeline([], '2026-11-30', '2027-01-25').map((g) => g.label)
    expect(labels).toContain('12월')
    expect(labels).toContain('2027년 1월')
  })

  it('진행 중인 장기 행사는 전부 첫 그룹에 모인다 — 유효 시작일 max(startDate, today)', () => {
    const events = [evIdx('sc-장기', { startDate: '2026-02-24', endDate: '2026-11-30' })]
    const groups = groupByTimeline(events, TODAY, HORIZON)
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['sc-장기'])
  })

  it('미래 시작 행사는 시작일이 속한 그룹에만 있다 — 뒤 그룹은 "그때 새로 시작하는 것"만 남는다', () => {
    const events = [
      evIdx('sc-주말', { startDate: '2026-09-05', endDate: '2026-09-06' }),
      evIdx('sc-다음주', { startDate: '2026-09-09', endDate: '2026-12-31' }),
      evIdx('sc-9월', { startDate: '2026-09-14', endDate: '2026-09-14' }),
      evIdx('sc-10월', { startDate: '2026-10-26', endDate: '2026-10-31' }),
    ]
    const groups = groupByTimeline(events, TODAY, HORIZON)
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.id)]))
    expect(byLabel).toEqual({
      '이번 주': [], '이번 주말': ['sc-주말'], '다음 주': ['sc-다음주'],
      '9월': ['sc-9월'], '10월': ['sc-10월'],
    })
  })

  it('항목은 정확히 한 그룹에만 놓인다', () => {
    const events = [evIdx('sc-a', { startDate: '2026-09-05', endDate: '2026-10-31' })]
    const total = groupByTimeline(events, TODAY, HORIZON).reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(1)
  })

  it('그룹 안은 유효 시작일 → 종료일 → id 순 — 홈과 같은 결정론', () => {
    const events = [
      evIdx('sc-b', { startDate: '2026-08-01', endDate: '2026-09-20' }),
      evIdx('sc-a', { startDate: '2026-08-01', endDate: '2026-09-20' }),
      evIdx('sc-임박', { startDate: '2026-08-01', endDate: '2026-09-01' }),
      evIdx('sc-수요일', { startDate: '2026-09-02', endDate: '2026-09-30' }),
    ]
    const first = groupByTimeline(events, TODAY, HORIZON)[0]!
    expect(first.items.map((i) => i.id)).toEqual(['sc-임박', 'sc-a', 'sc-b', 'sc-수요일'])
  })
})

describe('sortByDistance', () => {
  const origin = { lat: 37.5665, lng: 126.978 } // 서울시청

  it('가까운 순으로 정렬하고 km를 계산한다 — 행사·장소가 거리 하나로 선다', () => {
    const items: CatalogIndexItem[] = [
      plIdx('vs-멀다', { lat: 37.54, lng: 127.04 }),   // 서울숲 ~6km
      evIdx('sc-가깝다', { lat: 37.566, lng: 126.977 }), // 코앞
    ]
    const out = sortByDistance(items, origin)
    expect(out.map((e) => e.item.id)).toEqual(['sc-가깝다', 'vs-멀다'])
    expect(out[0]!.km!).toBeLessThan(0.2)
    expect(out[1]!.km!).toBeGreaterThan(3)
  })

  it('좌표 없는 항목은 버리지 않고 끝에 id 순으로 둔다 — 거리 미상이지 존재 미상이 아니다', () => {
    const items: CatalogIndexItem[] = [
      plIdx('vs-b없음'), plIdx('vs-a없음'), evIdx('sc-좌표', { lat: 37.57, lng: 126.98 }),
    ]
    const out = sortByDistance(items, origin)
    expect(out.map((e) => e.item.id)).toEqual(['sc-좌표', 'vs-a없음', 'vs-b없음'])
    expect(out[1]!.km).toBeUndefined()
  })
})

describe('relaxSuggestions', () => {
  it('0건일 때 어떤 필터를 풀면 몇 건이 나오는지 계산한다 (스펙 8장)', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-a', { group: '공연', district: '마포구', isFree: false }),
      evIdx('sc-b', { group: '전시', district: '중구', isFree: true }),
    ]
    const filters = { group: '공연' as const, district: '중구', free: true }
    expect(applyFilters(items, filters, NOW)).toHaveLength(0)
    const out = relaxSuggestions(items, filters, NOW)
    // group을 풀면 sc-b가 1건. district·free를 풀어도 0건이라 제안에 없다
    expect(out).toEqual([{ filter: 'group', count: 1 }])
  })

  it('켜져 있지 않은 필터는 제안하지 않는다', () => {
    const out = relaxSuggestions([evIdx('sc-a')], { free: true }, NOW)
    expect(out.map((s) => s.filter)).toEqual(['free'])
  })

  it('여러 제안은 건수 내림차순', () => {
    const items: CatalogIndexItem[] = [
      evIdx('sc-1', { group: '공연', isFree: false }),
      evIdx('sc-2', { group: '공연', isFree: false }),
      evIdx('sc-3', { group: '전시', isFree: true }),
    ]
    const out2 = relaxSuggestions(items, { group: '공연' as const, free: true }, NOW)
    expect(out2).toEqual([
      { filter: 'free', count: 2 },  // free를 풀면 공연 2건
      { filter: 'group', count: 1 }, // group을 풀면 무료 1건
    ])
  })
})

describe('formatDistance', () => {
  it('1km 미만은 m, 이상은 km 한 자리', () => {
    expect(formatDistance(0.85)).toBe('850m')
    expect(formatDistance(1.23)).toBe('1.2km')
    expect(formatDistance(12.04)).toBe('12.0km')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/browse-filter.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/browse-filter"`

- [ ] **Step 3: 구현**

`src/lib/browse-filter.ts`:

```ts
import type { CategoryGroup } from '~/lib/category'
import { addDays, weekdayOf } from '~/lib/dates'
import { haversineKm, type LatLng } from '~/lib/geo'
import { isOpenNow } from '~/lib/open-now'
import type { CatalogEventIndexItem, CatalogIndexItem } from '~/types/files'

export interface BrowseFilters {
  /** undefined = 전체. '기타'는 칩에 없지만 전체에는 있다(스펙 7장) */
  group?: CategoryGroup
  district?: string
  free?: boolean
  open?: boolean
}

/**
 * 필터 조합(AND). now는 인자다 — 내부 new Date() 금지(레포 규칙).
 *
 * `open`은 아는 것만 거른다: hours가 있는 장소 중 닫힌 곳만 떨어뜨리고,
 * hours 미상 207건은 남긴다 — 버리면 화면이 '안 열려 있다'고 거짓말한다(스펙 8장).
 * 행사는 건드리지 않는다: Event와 Place는 시간 의미가 다르다(AGENTS.md).
 */
export function applyFilters(
  items: CatalogIndexItem[],
  filters: BrowseFilters,
  now: Date,
): CatalogIndexItem[] {
  return items.filter((item) => {
    if (filters.group && item.group !== filters.group) return false
    if (filters.district && item.district !== filters.district) return false
    if (filters.free && item.isFree !== true) return false
    if (filters.open && item.kind === 'place' && item.hours && !isOpenNow(item.hours, now)) {
      return false
    }
    return true
  })
}

export interface TimelineGroup {
  key: string
  label: string
  start: string
  end: string
  items: CatalogEventIndexItem[]
}

const maxStr = (a: string, b: string) => (a > b ? a : b)
const minStr = (a: string, b: string) => (a < b ? a : b)

/** 'YYYY-MM-DD'가 속한 달의 마지막 날 */
function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
}

/**
 * 시간 축은 필터가 아니라 목록의 골격이다(스펙 7장).
 * [today, horizonEnd]를 겹침 없이 나눈다: 오늘~금 / 이번 주말 / 다음 주 / 월별.
 * 항목은 유효 시작일 max(startDate, today)가 속한 그룹에 한 번만 놓는다 —
 * 홈의 effectiveStart와 같은 관용구. 진행 중 장기 전시(82%)는 전부 첫 그룹에
 * 모이고, 뒤 그룹은 자연히 "그때 새로 시작하는 것"만 남는다.
 */
export function groupByTimeline(
  events: CatalogEventIndexItem[],
  today: string,
  horizonEnd: string,
): TimelineGroup[] {
  const iso = (weekdayOf(today) + 6) % 7 // 0=월 … 6=일
  const monday = addDays(today, -iso)
  const groups: TimelineGroup[] = []
  const push = (key: string, label: string, start: string, end: string) => {
    if (start <= horizonEnd) groups.push({ key, label, start, end: minStr(end, horizonEnd), items: [] })
  }

  if (iso <= 4) push('week', '이번 주', today, addDays(monday, 4)) // 오늘이 토·일이면 생략(스펙 7장)
  push('weekend', '이번 주말', maxStr(today, addDays(monday, 5)), addDays(monday, 6))
  push('next-week', '다음 주', addDays(monday, 7), addDays(monday, 13))

  let cursor = addDays(monday, 14)
  const todayYear = today.slice(0, 4)
  while (cursor <= horizonEnd) {
    const end = endOfMonth(cursor)
    const [y, m] = cursor.split('-').map(Number)
    const label = String(y) === todayYear ? `${m}월` : `${y}년 ${m}월`
    push(`month-${y}-${m}`, label, cursor, end)
    cursor = addDays(end, 1)
  }

  for (const e of events) {
    const eff = maxStr(e.startDate, today)
    // selectCatalog가 [today, horizonEnd] 밖을 이미 걸렀으므로 항상 찾는다.
    // 못 찾으면 데이터가 계약을 어긴 것 — 조용히 버리지 않도록 마지막 그룹에 넣는다
    const g = groups.find((g) => g.start <= eff && eff <= g.end) ?? groups[groups.length - 1]
    g?.items.push(e)
  }

  // 그룹 안 정렬: 유효 시작일 → 종료일(마감 임박순) → id. 홈 pickHomeItems와 같은 결정론
  for (const g of groups) {
    g.items.sort(
      (a, b) =>
        maxStr(a.startDate, today).localeCompare(maxStr(b.startDate, today)) ||
        a.endDate.localeCompare(b.endDate) ||
        a.id.localeCompare(b.id),
    )
  }
  return groups
}

export interface DistanceEntry {
  item: CatalogIndexItem
  /** 좌표 없는 항목은 undefined — 거리 미상이지 존재 미상이 아니다 */
  km?: number
}

/** 가까운 순. 행사·장소가 거리 하나로 선다 — "여기서 뭐 하고 있지"에서 그 구분은 의미가 없다(스펙 7장) */
export function sortByDistance(items: CatalogIndexItem[], origin: LatLng): DistanceEntry[] {
  const located: DistanceEntry[] = []
  const unlocated: DistanceEntry[] = []
  for (const item of items) {
    if (item.lat !== undefined && item.lng !== undefined) {
      located.push({ item, km: haversineKm(origin, { lat: item.lat, lng: item.lng }) })
    } else {
      unlocated.push({ item })
    }
  }
  located.sort((a, b) => a.km! - b.km! || a.item.id.localeCompare(b.item.id))
  unlocated.sort((a, b) => a.item.id.localeCompare(b.item.id))
  return [...located, ...unlocated]
}

export type RelaxableFilter = 'group' | 'district' | 'free' | 'open'

export interface RelaxSuggestion {
  filter: RelaxableFilter
  count: number
}

export const FILTER_LABELS: Record<RelaxableFilter, string> = {
  group: '카테고리', district: '자치구', free: '무료만', open: '지금 열림',
}

/**
 * 0건일 때 "어떤 필터를 풀면 몇 건이 나오는지"(스펙 8장 — 크리틱 휴리스틱 9의 응답).
 * 켜진 필터를 하나씩 꺼 보고, 0건이 아닌 것만 건수 내림차순으로 돌려준다.
 */
export function relaxSuggestions(
  items: CatalogIndexItem[],
  filters: BrowseFilters,
  now: Date,
): RelaxSuggestion[] {
  const active: RelaxableFilter[] = []
  if (filters.group) active.push('group')
  if (filters.district) active.push('district')
  if (filters.free) active.push('free')
  if (filters.open) active.push('open')

  return active
    .map((f) => ({ filter: f, count: applyFilters(items, { ...filters, [f]: undefined }, now).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || a.filter.localeCompare(b.filter))
}

/** 1km 미만은 m로 — '0.8km'보다 '850m'가 걷는 사람의 단위다 */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/browse-filter.test.ts`
Expected: PASS (17개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/browse-filter.ts tests/lib/browse-filter.test.ts
git commit -m "feat: 탐색의 두뇌 — 필터·시간 축 그룹핑·거리 정렬·완화 제안

시간 축은 필터가 아니라 골격이다. 항목은 유효 시작일(max(startDate,
today))이 속한 그룹에 한 번만 — 진행 중 장기 전시 82%가 첫 그룹에
모이고 뒤 그룹엔 '그때 새로 시작하는 것'만 남는다. 이게 '다가오는
행사를 기다린다'의 구현이다. 지금 열림은 아는 것만 거른다(미상 207건
유지). 거리 정렬은 좌표 없는 항목을 끝에 둔다 — 버리지 않는다."
```

---

## Task 7: `src/lib/browse-search.ts` — URL search params 스키마

필터 상태는 URL search params다. 이유는 공유가 아니라 **뒤로가기** — 크리틱이 휴리스틱 3에 1점을 준 근거가 "12개를 받아들이거나 떠나거나"였는데, 필터를 만들면서 뒤로가기로 되돌릴 수 없게 하면 같은 점수를 다시 받는다(스펙 7장).

잘못된 값은 **던지지 않고 기본값으로 복구**한다(`.catch`) — 손으로 고친 URL이 화면을 깨면 안 된다. 켜짐만 URL에 남긴다(`free=true`는 있고 `free=false`는 없다) — URL이 상태의 최소 표현이 되게.

**Files:**
- Create: `src/lib/browse-search.ts`
- Test: `tests/lib/browse-search.test.ts`

**Interfaces:**
- Consumes: `BrowseFilters` (Task 6), `CategoryGroup` (Task 1), zod
- Produces:
  - `CHIP_GROUPS: readonly ['전시', '체험·배움', '공원·자연', '역사·명소', '축제', '공연']` — `기타`는 칩 밖(스펙 7장: 13건은 칩 한 자리 값을 못 한다. 숨기는 게 아니라 `전체`에 있다)
  - `browseSearchSchema` (zod) / `type BrowseSearch = z.infer<typeof browseSearchSchema>`
  - `toBrowseFilters(search: BrowseSearch): BrowseFilters`
  - Task 10의 라우트 `validateSearch`가 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/browse-search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { browseSearchSchema, CHIP_GROUPS, toBrowseFilters } from '~/lib/browse-search'

describe('browseSearchSchema', () => {
  it('유효한 조합을 그대로 통과시킨다 (왕복)', () => {
    const search = { group: '공연' as const, district: '마포구', free: true as const, near: true as const }
    expect(browseSearchSchema.parse(search)).toEqual(search)
  })

  it('빈 search는 빈 객체다 — 기본 상태에 파라미터를 쓰지 않는다', () => {
    expect(browseSearchSchema.parse({})).toEqual({})
  })

  it('잘못된 group은 던지지 않고 버린다 — 손으로 고친 URL이 화면을 깨면 안 된다', () => {
    expect(browseSearchSchema.parse({ group: '없는그룹' })).toEqual({})
  })

  it('기타는 칩 밖이므로 group 값으로도 받지 않는다', () => {
    expect(browseSearchSchema.parse({ group: '기타' })).toEqual({})
    expect(CHIP_GROUPS).not.toContain('기타')
  })

  it('false·이상한 타입의 토글은 버린다 — 켜짐만 URL에 남는다', () => {
    expect(browseSearchSchema.parse({ free: false })).toEqual({})
    expect(browseSearchSchema.parse({ open: 'yes' })).toEqual({})
    expect(browseSearchSchema.parse({ near: 1 })).toEqual({})
  })

  it('빈 문자열 district는 버린다', () => {
    expect(browseSearchSchema.parse({ district: '' })).toEqual({})
  })
})

describe('toBrowseFilters', () => {
  it('search를 BrowseFilters로 옮긴다 — near는 필터가 아니라 정렬이라 빠진다', () => {
    expect(
      toBrowseFilters({ group: '전시', district: '중구', free: true, open: true, near: true }),
    ).toEqual({ group: '전시', district: '중구', free: true, open: true })
  })

  it('빈 search는 빈 필터다', () => {
    expect(toBrowseFilters({})).toEqual({ group: undefined, district: undefined, free: undefined, open: undefined })
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/browse-search.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/browse-search"`

- [ ] **Step 3: 구현**

`src/lib/browse-search.ts`:

```ts
import { z } from 'zod'
import type { BrowseFilters } from '~/lib/browse-filter'

/**
 * 카테고리 칩 6개. '기타'(13건)는 칩 한 자리 값을 못 해서 뺀다 —
 * 숨기는 게 아니라 '전체'에 그대로 있다(스펙 7장).
 */
export const CHIP_GROUPS = ['전시', '체험·배움', '공원·자연', '역사·명소', '축제', '공연'] as const

/**
 * 필터 상태 = URL search params. 이유는 공유가 아니라 뒤로가기다(스펙 7장).
 * 잘못된 값은 던지지 않고 기본값(없음)으로 복구한다 — 화면을 깨는 대신 필터가 풀린다.
 * 토글은 z.literal(true): 켜짐만 URL에 남긴다. free=false는 free 없음과 같은 상태다.
 */
export const browseSearchSchema = z.object({
  group: z.enum(CHIP_GROUPS).optional().catch(undefined),
  district: z.string().min(1).optional().catch(undefined),
  free: z.literal(true).optional().catch(undefined),
  open: z.literal(true).optional().catch(undefined),
  near: z.literal(true).optional().catch(undefined),
})

export type BrowseSearch = z.infer<typeof browseSearchSchema>

/** near는 필터가 아니라 정렬 축이라 BrowseFilters로 넘기지 않는다 */
export function toBrowseFilters(search: BrowseSearch): BrowseFilters {
  return { group: search.group, district: search.district, free: search.free, open: search.open }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/browse-search.test.ts`
Expected: PASS (9개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/browse-search.ts tests/lib/browse-search.test.ts
git commit -m "feat: 탐색 필터의 URL search param 스키마

필터를 URL에 두는 이유는 공유가 아니라 뒤로가기다 — 필터를 만들면서
뒤로가기로 되돌릴 수 없으면 크리틱 휴리스틱 3의 1점을 다시 받는다.
잘못된 값은 던지지 않고 기본값으로 복구한다(.catch). 켜짐만 URL에
남긴다 — URL이 상태의 최소 표현이다."
```

---

## Task 8: 전량 프리렌더 + 상세의 카탈로그 조회 (게이트: Task 0)

**Task 0의 "확인 결과"가 채워져 있지 않으면 이 태스크를 시작하지 않는다.**

상세 프리렌더를 홈이 링크하는 18개에서 **카탈로그 전량(~1,400)**으로 넓힌다(스펙 4장). `/browse`(Task 9)가 카탈로그 전부로 링크를 걸기 전에 페이지가 먼저 있어야 한다 — Plan 2에서 상세(9)가 홈(10)보다 먼저였던 것과 같은 순서 논리다. 빌드 비용은 페이지당 0.017초 실측 기준 약 +24초. 부수 효과로 크리틱 P1이던 **"링크 안 된 id는 의도적 404"가 사라진다.**

`getDetail`의 조회 사슬에 카탈로그를 끼운다 — 미래 시작 행사는 주간 파일에 없으므로(스펙 3장) 카탈로그 없이는 상세가 `notFound`를 던지고, `failOnError` 빌드가 그 자리에서 깨진다. 그 빌드 실패가 이 연결의 통합 테스트다.

**Files:**
- Modify: `src/routes/e/$id.tsx` (조회 사슬), `vite.config.ts` (프리렌더 목록)
- (경로 B일 때만) Create: `src/routes/all.tsx`, Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `loadCatalog` (Task 5), Task 0의 확인 결과(#1·#2), 커밋된 `data/index.json`
- Produces: 카탈로그 전 항목의 상세 페이지 — Task 9의 탐색 목록이 여기로 링크한다

- [ ] **Step 1: `getDetail` 조회 사슬에 카탈로그 추가**

`src/routes/e/$id.tsx`의 서버 함수 핸들러를 다음으로 교체한다 (import에 `loadCatalog` 추가):

```tsx
const getDetail = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .middleware([staticFunctionMiddleware])
  .handler(({ data: id }): { item: Item; today: string } | null => {
    const meta = loadMeta() // 현재 주차는 meta.weekKey — isoWeekKey(new Date()) 금지
    const week = loadWeek(meta.weekKey)
    const catalog = loadCatalog()
    const places = loadPlaces()
    /**
     * 조회 사슬: 주간 → 카탈로그 → 장소.
     * 주간이 먼저인 이유: endDate 이상치(예: 2626-08-08)는 주간 파일에는 있지만
     * 카탈로그에서는 제외돼 있다 — 홈이 링크하는 id는 전부 여기서 해석돼야 한다.
     * 카탈로그가 있어야 미래 시작 행사(주간 파일에 0건)의 상세가 성립한다.
     */
    const item: Item | undefined =
      week.items.find((i) => i.id === id) ??
      catalog.items.find((i) => i.id === id) ??
      places.items.find((i) => i.id === id)
    if (!item) return null
    return { item, today: kstToday(new Date()) } // 오늘 = 빌드 시각의 KST 날짜
  })
```

- [ ] **Step 2: dev 서버로 미래 행사 상세 확인**

카탈로그에만 있는(주간 파일에 없는) 행사 id를 하나 뽑는다:

```bash
node -e "
const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('data/index.json', 'utf8'));
const meta = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
const week = new Set(JSON.parse(fs.readFileSync('data/events/' + meta.weekKey + '.json', 'utf8')).items.map((i) => i.id));
console.log(idx.items.find((i) => i.kind === 'event' && !week.has(i.id))?.id ?? '(없음 — 미래 행사 0건?)');
"
```

`(없음)`이 나오면 멈추고 원인을 본다 — 카탈로그가 미래 행사를 못 담고 있다는 뜻이고, Task 5의 전제가 깨진 것이다.

```bash
npm run dev & DEV_PID=$!; sleep 8
curl -s "http://localhost:3000/seoulchi/e/<뽑은 id>" | grep -a -c '기간'
kill $DEV_PID
```

Expected: `1` 이상 — 주간 파일에 없는 행사의 상세가 뜬다.

- [ ] **Step 3: `vite.config.ts`에 프리렌더 목록 추가**

**경로 A** (Task 0에서 명시 목록이 확인된 경우) — 키 이름·항목 형태는 **Task 0 확인 결과를 따른다.** 아래는 항목이 `{ path }` 객체 배열이고 플러그인 옵션에 들어가는 경우의 코드다:

```ts
import { readFileSync } from 'node:fs'

/**
 * 카탈로그 전량 프리렌더(스펙 4장). 탐색이 카탈로그 전부로 링크를 걸므로
 * 상세 페이지가 전부 있어야 한다. 페이지당 0.017초 실측 — 약 +24초.
 * config 로드 시점에 데이터를 읽는다: 빌드는 항상 레포 루트에서 돈다(Plan 2 전례).
 * crawlLinks는 유지한다 — endDate 이상치 상세(카탈로그 제외, 주간 파일에는 존재)는
 * 홈 링크의 크롤로만 잡힌다.
 */
const catalogPages = (
  JSON.parse(readFileSync('data/index.json', 'utf8')) as { items: Array<{ id: string }> }
).items.map((item) => ({ path: `/e/${item.id}` }))
```

그리고 `tanstackStart({ … })` 옵션에 Task 0이 확정한 키로 `catalogPages`를 넘긴다 (예: `pages: catalogPages` — **실제 키는 확인 결과가 근거다**). `prerender: { enabled, crawlLinks, failOnError }`는 그대로 둔다.

**경로 B** (명시 목록이 없는 경우) — 전체 id를 `<Link>`로 나열하는 SSG 라우트를 두면 `crawlLinks: true`가 전부 줍는다(스펙 12장 폴백). `src/routes/all.tsx`:

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { PAGE } from '~/components/page'
import { loadIndex } from '~/data/load'

/** 크롤러를 위한 전체 색인. 카탈로그 전 항목의 링크가 여기 있어 crawlLinks가 전부 줍는다 */
const getAllIds = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => loadIndex().items.map((i) => ({ id: i.id, title: i.title })))

export const Route = createFileRoute('/all')({
  loader: () => getAllIds(),
  component: AllIndex,
})

function AllIndex() {
  const items = Route.useLoaderData()
  return (
    <main className={`${PAGE} py-6`}>
      <h1 className="text-xl font-bold">전체 색인</h1>
      <ul className="mt-4 space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <Link to="/e/$id" params={{ id: i.id }} className="underline">{i.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

크롤은 홈에서 시작하므로 홈 푸터에 `/all` 링크를 하나 둔다 (`src/routes/index.tsx` main 끝에):

```tsx
      <footer className="mt-16 border-t border-neutral-border pt-4">
        <Link to="/all" className="text-xs text-ink-subtle underline">전체 색인</Link>
      </footer>
```

숨기지 않고 보이게 둔다 — 화면에 없는 링크를 크롤러에게만 주는 것은 이 레포의 태도가 아니다.

- [ ] **Step 4: 빌드 실측**

```bash
time npm run build
find dist/client -name 'index.html' | wc -l
find dist/client -path '*/e/*' -name 'index.html' | wc -l
```

Expected:
- `e/` 아래 페이지 수 ≈ **인덱스 항목 수** (+ 카탈로그 밖인데 홈이 링크한 이상치 상세 몇 건). 정확한 수와 총 빌드 시간을 기록한다 — Task 13에서 AGENTS.md에 옮긴다.
- 미래 행사 상세 스팟 체크: `grep -a -c '기간' dist/client/e/<Step 2의 id>/index.html` → `1` 이상
- 존재하지 않는 id는 여전히 404: `test -f dist/client/e/sc-nope/index.html && echo '있으면 안 됨' || echo OK`

빌드가 `notFound`로 깨지면 인덱스와 카탈로그가 어긋난 것이다 — Task 5의 스모크(`인덱스의 행사 id가 전부 catalog.json에서 해석된다`)부터 다시 본다.

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add vite.config.ts src/routes/e
git commit -m "feat: 상세 프리렌더를 카탈로그 전량으로 확대

탐색이 카탈로그 전부로 링크를 걸므로 상세가 먼저 전부 있어야 한다
(Plan 2에서 상세가 홈보다 먼저였던 것과 같은 순서). getDetail 조회
사슬에 카탈로그를 끼운다 — 미래 시작 행사는 주간 파일에 0건이라
카탈로그 없이는 notFound다. 크리틱 P1 '링크 안 된 id는 404'가
사라진다. 실측: N페이지, M초 (여기에 기록)"
```

---

## Task 9: `/browse` 화면 1 — 데이터 로드 · 시간 축 목록 · 장소 섹션 · 로딩/에러

탐색 라우트를 세운다. **아직 어디서도 링크하지 않는다** — 헤더 세그먼트는 Task 11이다(라우트가 없는데 링크부터 걸면 `failOnError` 빌드가 깨진다).

껍데기는 SSG, 목록만 클라이언트 fetch다(스펙 8장 "로딩" 행): 프리렌더된 HTML에는 스켈레톤이 있고, 마운트 후 `index.json`을 받아 시간 축 목록을 그린다. **fetch 실패는 명시적 에러 + 재시도** — 빈 목록으로 위장하지 않는다(크리틱 휴리스틱 9의 응답). 데이터가 이 화면에 처음 도달하므로 신선도(`generatedAt`)도 여기서 보여준다.

**월 그룹은 접힌 채 시작한다** — 스펙 7장 스케치의 `9월 112건 ›`가 근거다(가까운 그룹만 펼쳐져 있고 월 그룹에 `›`가 붙어 있다). 접힘 상태는 URL에 넣지 않는다 — 필터가 아니라 목록 안 이동이다.

**Files:**
- Create: `src/routes/browse.tsx`, `src/components/browse.tsx`
- Modify: `vite.config.ts` (경로 A면 `/browse` 페이지 추가)

**Interfaces:**
- Consumes: `groupByTimeline` (Task 6), `relativeDateLabel`/`formatWeekRange`/`formatUpdatedAt` (Task 2·기존), `kstToday` (`~/lib/week`), `catalogIndexSchema`/타입들 (Task 4), `ItemImage`/`OpenNowBadge`/`PAGE` (기존), `formatDistance` (Task 6)
- Produces:
  - 라우트 `/browse` — Task 11의 헤더가 여기로 링크한다
  - `BrowseEventRow` / `BrowsePlaceRow` / `TimelineSection` / `CatalogSkeleton` / `CatalogError` — Task 10이 재사용한다
  - `km`·`hoursUnknownNote` prop — Task 10의 가까운 순·지금 열림이 쓴다

- [ ] **Step 1: 행·섹션·상태 컴포넌트 작성**

`src/components/browse.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import { formatDistance, type TimelineGroup } from '~/lib/browse-filter'
import { relativeDateLabel } from '~/lib/dates'
import type { CatalogEventIndexItem, CatalogPlaceIndexItem } from '~/types/files'

/** '2026-09-05' → '9/5'. 그룹 헤더의 범위 표기 전용 */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

/**
 * 탐색 행사 행. 메타 한 줄은 자치구 · (거리) · (무료) · 상대 날짜 —
 * 스케치의 "성동 · 1.2km · 무료 · 오늘까지" 순서다. 값이 없는 조각은 접는다.
 * ItemImage의 category에는 그룹을 넘긴다(슬림 항목에 원시 카테고리가 없다) —
 * 같은 그룹은 같은 폴백 색이므로 결정론은 유지된다.
 */
export function BrowseEventRow({
  item, today, km,
}: { item: CatalogEventIndexItem; today: string; km?: number }) {
  const pieces = [
    item.district,
    km !== undefined ? formatDistance(km) : undefined,
    item.isFree ? '무료' : undefined,
    relativeDateLabel(item.startDate, item.endDate, today),
  ].filter(Boolean)
  return (
    <Link to="/e/$id" params={{ id: item.id }} className="flex gap-3 border-t border-neutral-border py-3">
      <ItemImage
        src={item.imageUrl} alt="" category={item.group}
        className="aspect-[3/4] w-14 shrink-0 self-start rounded object-cover"
      />
      <div className="min-w-0">
        <h3 className="line-clamp-2 font-medium">{item.title}</h3>
        <p className="mt-0.5 truncate text-sm text-ink-muted">{pieces.join(' · ')}</p>
      </div>
    </Link>
  )
}

/**
 * 탐색 장소 행. '지금 열림' 배지는 OpenNowBadge 재사용(hydration-후 계산 그대로).
 * hoursUnknownNote: '지금 열림' 필터가 켜졌을 때 hours 미상 장소를 버리는 대신
 * "영업시간 미상"으로 남긴다(스펙 8장) — 조용히 없애면 화면이 '안 열려 있다'고 거짓말한다.
 */
export function BrowsePlaceRow({
  item, km, hoursUnknownNote = false,
}: { item: CatalogPlaceIndexItem; km?: number; hoursUnknownNote?: boolean }) {
  const pieces = [
    item.district,
    km !== undefined ? formatDistance(km) : undefined,
    item.isFree ? '무료' : undefined,
  ].filter(Boolean)
  return (
    <Link to="/e/$id" params={{ id: item.id }} className="flex gap-3 border-t border-neutral-border py-3">
      <ItemImage
        src={item.imageUrl} alt="" category={item.group}
        className="aspect-[4/3] w-20 shrink-0 self-start rounded object-cover"
      />
      <div className="min-w-0">
        <h3 className="line-clamp-2 font-medium">{item.title}</h3>
        <p className="mt-0.5 truncate text-sm text-ink-muted">
          {pieces.join(' · ')}
          <OpenNowBadge hours={item.hours ?? null} />
          {hoursUnknownNote && !item.hours && (
            <span className="ml-2 text-xs text-ink-subtle">영업시간 미상</span>
          )}
        </p>
      </div>
    </Link>
  )
}

/**
 * 시간 축 그룹 하나. 빈 그룹은 그리지 않는다.
 * collapsible(월 그룹)은 헤더가 버튼이고, 접힌 채 시작한다 — 스케치의 '9월 112건 ›'.
 */
export function TimelineSection({
  group, today, collapsible, expanded, onToggle,
}: {
  group: TimelineGroup
  today: string
  collapsible: boolean
  expanded: boolean
  onToggle: () => void
}) {
  if (group.items.length === 0) return null
  const header = (
    <>
      <h2 className="text-lg font-bold">
        {group.label}
        <span className="ml-2 text-sm font-normal text-ink-subtle">{md(group.start)}–{md(group.end)}</span>
      </h2>
      <span className="text-sm text-ink-muted">
        {group.items.length}건{collapsible && <span className="ml-1">{expanded ? '⌄' : '›'}</span>}
      </span>
    </>
  )
  return (
    <section className="mt-8">
      {collapsible ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded}
          className="flex w-full items-baseline justify-between text-left">
          {header}
        </button>
      ) : (
        <div className="flex items-baseline justify-between">{header}</div>
      )}
      {expanded && (
        <div className="mt-3">
          {group.items.map((item) => (
            <BrowseEventRow key={item.id} item={item} today={today} />
          ))}
        </div>
      )}
    </section>
  )
}

/** 목록 스켈레톤. 껍데기(세그먼트·칩)는 SSG라 즉시 뜨고 목록만 이걸 본다(스펙 8장) */
export function CatalogSkeleton() {
  return (
    <div aria-hidden className="mt-8 space-y-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="aspect-[3/4] w-14 animate-pulse rounded bg-neutral-subtle-bg" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-subtle-bg" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-subtle-bg" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** fetch 실패의 명시적 표면. 빈 목록으로 위장하지 않는다(스펙 8장, 크리틱 휴리스틱 9) */
export function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-8 rounded-lg border border-error-border bg-error-subtle-bg p-4">
      <p className="font-medium text-error-text-strong">목록을 불러오지 못했습니다</p>
      <p className="mt-1 text-sm text-error-text">{message}</p>
      <button type="button" onClick={onRetry}
        className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface">
        다시 시도
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 라우트 작성**

`src/routes/browse.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import indexUrl from '../../data/index.json?url'
import {
  BrowseEventRow, BrowsePlaceRow, CatalogError, CatalogSkeleton, TimelineSection,
} from '~/components/browse'
import { PAGE } from '~/components/page'
import { groupByTimeline } from '~/lib/browse-filter'
import { formatUpdatedAt, formatWeekRange } from '~/lib/dates'
import { kstToday } from '~/lib/week'
import {
  catalogIndexSchema,
  type CatalogEventIndexItem,
  type CatalogIndexFile,
  type CatalogPlaceIndexItem,
} from '~/types/files'

/**
 * 껍데기는 SSG, 목록만 클라이언트 fetch(스펙 8장). 홈과 달리 서버 함수를 쓰지 않는
 * 이유: 서버 함수 loader면 인덱스 240KB가 프리렌더 HTML에 통째로 박힌다.
 * ?url 임포트라 에셋 URL에 base가 자동으로 붙는다 — static-fn-base가 손으로 풀던
 * 문제(스펙 10장)를 vite가 대신 푼다.
 */
type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: CatalogIndexFile; today: string; now: Date }

export const Route = createFileRoute('/browse')({
  component: Browse,
})

function Browse() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  /** 접힌 월 그룹의 토글. URL에 넣지 않는다 — 필터가 아니라 목록 안 이동이다 */
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetch(indexUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`인덱스를 받지 못했습니다 (HTTP ${res.status})`)
        const parsed = catalogIndexSchema.safeParse(await res.json())
        if (!parsed.success) {
          throw new Error('인덱스가 스키마와 다릅니다 — 배치와 앱 버전이 어긋났을 수 있습니다')
        }
        if (cancelled) return
        const now = new Date() // 브라우저 경계 — 여기서 한 번만. 이후 계산은 전부 이 값을 받는다
        setState({ status: 'ready', index: parsed.data, today: kstToday(now), now })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // 빈 목록으로 위장하지 않는다 — 명시적 에러 + 재시도(스펙 8장)
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <main className={`${PAGE} py-6 md:py-10`}>
      {state.status === 'loading' && <CatalogSkeleton />}
      {state.status === 'error' && (
        <CatalogError message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {state.status === 'ready' && (
        <BrowseList
          index={state.index}
          today={state.today}
          openMonths={openMonths}
          onToggleMonth={(key) =>
            setOpenMonths((prev) => {
              const next = new Set(prev)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }
        />
      )}
    </main>
  )
}

function BrowseList({
  index, today, openMonths, onToggleMonth,
}: {
  index: CatalogIndexFile
  today: string
  openMonths: ReadonlySet<string>
  onToggleMonth: (key: string) => void
}) {
  const events = index.items.filter((i): i is CatalogEventIndexItem => i.kind === 'event')
  const places = index.items
    .filter((i): i is CatalogPlaceIndexItem => i.kind === 'place')
    .sort((a, b) => a.title.localeCompare(b.title, 'ko')) // 위치를 안 쓰는 기본 상태는 이름순(스펙 7장)
  const groups = groupByTimeline(events, today, index.horizonEnd)

  return (
    <>
      <header>
        {/* 범위 줄이 탭마다 다르다 — 탐색에서 '이번 주'가 거짓말이 되지 않게(스펙 7장) */}
        <p className="text-sm text-ink-subtle">{formatWeekRange({ start: today, end: index.horizonEnd })}</p>
        <p className="mt-1 text-xs text-ink-subtle">{formatUpdatedAt(index.generatedAt)}</p>
      </header>

      {groups.map((g) => (
        <TimelineSection
          key={g.key}
          group={g}
          today={today}
          collapsible={g.key.startsWith('month-')}
          expanded={!g.key.startsWith('month-') || openMonths.has(g.key)}
          onToggle={() => onToggleMonth(g.key)}
        />
      ))}

      {/* 장소는 시간 축에 놓지 않는다 — 시작일이 없다(스펙 7장, AGENTS.md) */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">언제든 갈 수 있는 곳</h2>
          <span className="text-sm text-ink-muted">{places.length}건</span>
        </div>
        <div className="mt-3">
          {places.map((p) => (
            <BrowsePlaceRow key={p.id} item={p} />
          ))}
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 3: (경로 A일 때) `/browse`를 프리렌더 목록에 추가**

`vite.config.ts`의 목록에 `{ path: '/browse' }`를 앞에 추가한다:

```ts
const pages = [{ path: '/browse' }, ...catalogPages]
```

경로 B면 이 단계는 건너뛴다 — Task 11에서 헤더가 링크하면 crawlLinks가 줍는다(그때까지 `/browse`는 dev로만 확인).

- [ ] **Step 4: dev 서버로 확인**

```bash
npm run dev & DEV_PID=$!; sleep 8
# SSR 껍데기: 스켈레톤이 렌더되고, 목록 데이터는 HTML에 없다
curl -s http://localhost:3000/seoulchi/browse | grep -a -c 'animate-pulse'
curl -s http://localhost:3000/seoulchi/browse | grep -a -c '언제든 갈 수 있는 곳'
kill $DEV_PID
```

Expected: 스켈레톤 `1` 이상, `언제든 갈 수 있는 곳` **`0`** — 목록은 클라이언트에서만 그려진다.

브라우저(`npm run dev` 후 `http://localhost:3000/seoulchi/browse`)에서:
1. 스켈레톤 → 시간 축 목록 전환. 첫 그룹에 진행 중 행사가 몰려 있고, 뒤 그룹은 새로 시작하는 것만 있다
2. 월 그룹이 접혀 있고 누르면 펼쳐진다
3. 맨 아래 "언제든 갈 수 있는 곳" 733건, 이름순
4. 행사 행을 눌러 상세 이동 — **네트워크 탭에 4xx/5xx 없음** (Task 8의 전량 프리렌더 덕에 어떤 행이든 성립)
5. devtools Network에서 `index.json` 응답이 gzip으로 오는지·크기 확인

- [ ] **Step 5: 빌드 + 에셋 확인 (확인 목록 #3 해소)**

```bash
npm run build
ls dist/client/assets/ | grep -i '\.json$'
grep -rl 'animate-pulse' dist/client/browse/ 2>/dev/null || echo '(경로 B: /browse는 Task 11 후 프리렌더)'
```

Expected: `index-<hash>.json` 같은 에셋이 방출됐다. 아니면 확인 목록 #3의 폴백(vite 플러그인 `emitFile`)으로 바꾸고, 어느 쪽이든 **결과를 "확인 결과" #3에 기록한다.**

- [ ] **Step 6: 전체 테스트 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/routes/browse.tsx src/components/browse.tsx vite.config.ts docs/superpowers/plans/2026-08-31-browse-mode.md
git commit -m "feat: 탐색 화면 /browse — 시간 축 목록과 장소 섹션

껍데기는 SSG, 목록만 클라이언트 fetch. 서버 함수 loader를 안 쓰는
이유: 인덱스 240KB가 프리렌더 HTML에 박힌다. fetch 실패는 명시적
에러 + 재시도 — 빈 목록으로 위장하지 않는다(휴리스틱 9). 장소는
시작일이 없어 시간 축에 놓지 않고 별도 섹션이다. 아직 어디서도
링크하지 않는다 — 헤더 세그먼트는 라우트가 안정된 뒤(Task 11)."
```

---

## Task 10: `/browse` 화면 2 — 필터 칩·토글·자치구 · URL 연결 · 0건 완화 · 가까운 순

컨트롤을 붙이고 필터 상태를 URL에 연결한다. **뒤로가기가 필터를 되돌린다** — `navigate`의 기본 push를 쓰는 이유다(스펙 7장). `가까운 순`은 위치 권한(브라우저 경계)을 요구한다: 거부되면 **비활성 + 사유 한 줄 + 자치구 셀렉트로 유도**(스펙 8장), 허용되면 시간 축이 사라지고 **행사와 장소가 거리 하나로 정렬**된다(스펙 7장 — "여기서 뭐 하고 있지"에서는 그 구분이 의미가 없다).

**Files:**
- Modify: `src/routes/browse.tsx`, `src/components/browse.tsx` (컨트롤·0건 추가)

**Interfaces:**
- Consumes: `browseSearchSchema`/`CHIP_GROUPS`/`toBrowseFilters` (Task 7), `applyFilters`/`sortByDistance`/`relaxSuggestions`/`FILTER_LABELS` (Task 6), `LatLng` (`~/lib/geo`), Task 9의 컴포넌트 전부
- Produces: 완성된 `/browse`. Task 13의 검증 대상

- [ ] **Step 1: 컨트롤·0건 컴포넌트 추가**

`src/components/browse.tsx`에 추가:

```tsx
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { RelaxSuggestion } from '~/lib/browse-filter'
import { FILTER_LABELS } from '~/lib/browse-filter'
import { CHIP_GROUPS, type BrowseSearch } from '~/lib/browse-search'

function Chip({
  active, onClick, disabled = false, children,
}: { active: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
        active ? 'bg-ink font-medium text-surface' : 'border border-neutral-border text-ink-muted'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
    </button>
  )
}

/**
 * 필터 컨트롤(스펙 7장 스케치). 칩 한 줄(가로 스크롤, 단일 선택) + 토글 줄 + 자치구 셀렉트.
 * 모든 변경이 navigate(push)라 뒤로가기가 필터를 되돌린다 — 그게 URL에 두는 이유다.
 * '기타' 13건은 칩에서 뺀다 — 칩 한 자리 값을 못 한다. 숨기는 게 아니라 '전체'에 있다.
 * 자치구 24개는 칩이 안 되므로 셀렉트다.
 */
export function BrowseControls({
  search, districts, nearDisabledReason,
}: { search: BrowseSearch; districts: string[]; nearDisabledReason?: string }) {
  const navigate = useNavigate()
  const patch = (p: Partial<BrowseSearch>) =>
    void navigate({ to: '/browse', search: { ...search, ...p } })

  return (
    <div className="mt-4 space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="카테고리">
        <Chip active={search.group === undefined} onClick={() => patch({ group: undefined })}>전체</Chip>
        {CHIP_GROUPS.map((g) => (
          <Chip key={g} active={search.group === g}
            onClick={() => patch({ group: search.group === g ? undefined : g })}>
            {g}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="정렬과 필터">
        <Chip active={search.near === true} disabled={nearDisabledReason !== undefined}
          onClick={() => patch({ near: search.near ? undefined : true })}>
          ⊙ 가까운 순
        </Chip>
        <Chip active={search.free === true}
          onClick={() => patch({ free: search.free ? undefined : true })}>
          무료만
        </Chip>
        <Chip active={search.open === true}
          onClick={() => patch({ open: search.open ? undefined : true })}>
          지금 열림
        </Chip>
        <select
          value={search.district ?? ''}
          onChange={(e) => patch({ district: e.target.value === '' ? undefined : e.target.value })}
          aria-label="자치구"
          className="rounded-full border border-neutral-border bg-surface px-3 py-1.5 text-sm text-ink-muted"
        >
          <option value="">자치구 전체</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      {nearDisabledReason !== undefined && (
        <p className="text-sm text-warning-text">{nearDisabledReason}</p>
      )}
    </div>
  )
}

/**
 * 0건의 응답(스펙 8장): 막다른 길 대신 어떤 필터를 풀면 몇 건이 나오는지.
 * 제안이 Link라 누르면 그 필터가 풀리고, 뒤로가기로 되돌아온다.
 */
export function EmptyResult({
  suggestions, search,
}: { suggestions: RelaxSuggestion[]; search: BrowseSearch }) {
  return (
    <div className="mt-12 py-8 text-center">
      <p className="font-medium">조건에 맞는 게 없습니다</p>
      {suggestions.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {suggestions.map((s) => (
            <li key={s.filter}>
              <Link to="/browse" search={{ ...search, [s.filter]: undefined }}
                className="text-ink-muted underline">
                '{FILTER_LABELS[s.filter]}'을(를) 풀면 {s.count}건
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-subtle">모든 필터를 풀어도 결과가 없습니다</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 라우트에 search·필터·가까운 순 연결**

`src/routes/browse.tsx`를 다음으로 교체한다 (Task 9와의 차이: `validateSearch`, `BrowseControls`, 필터 적용, 0건, geolocation, 거리 병합 뷰):

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import indexUrl from '../../data/index.json?url'
import {
  BrowseControls, BrowseEventRow, BrowsePlaceRow, CatalogError, CatalogSkeleton,
  EmptyResult, TimelineSection,
} from '~/components/browse'
import { PAGE } from '~/components/page'
import {
  applyFilters, groupByTimeline, relaxSuggestions, sortByDistance,
} from '~/lib/browse-filter'
import { browseSearchSchema, toBrowseFilters, type BrowseSearch } from '~/lib/browse-search'
import { formatUpdatedAt, formatWeekRange } from '~/lib/dates'
import type { LatLng } from '~/lib/geo'
import { kstToday } from '~/lib/week'
import {
  catalogIndexSchema,
  type CatalogEventIndexItem,
  type CatalogIndexFile,
  type CatalogPlaceIndexItem,
} from '~/types/files'

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: CatalogIndexFile; today: string; now: Date }

type GeoState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'ok'; origin: LatLng }
  | { status: 'denied' }

export const Route = createFileRoute('/browse')({
  // 확인 목록 #4: zod v4는 Standard Schema라 스키마를 그대로 넘긴다.
  // 안 되면 (search) => browseSearchSchema.parse(search)로 바꾸고 확인 결과에 기록
  validateSearch: browseSearchSchema,
  component: Browse,
})

function Browse() {
  const search = Route.useSearch()
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(new Set())
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetch(indexUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`인덱스를 받지 못했습니다 (HTTP ${res.status})`)
        const parsed = catalogIndexSchema.safeParse(await res.json())
        if (!parsed.success) {
          throw new Error('인덱스가 스키마와 다릅니다 — 배치와 앱 버전이 어긋났을 수 있습니다')
        }
        if (cancelled) return
        const now = new Date() // 브라우저 경계 — 여기서 한 번만
        setState({ status: 'ready', index: parsed.data, today: kstToday(now), now })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  /** 위치는 near가 켜졌을 때만 묻는다 — 안 쓰는 권한을 미리 조르지 않는다 */
  useEffect(() => {
    if (search.near !== true) {
      setGeo({ status: 'idle' })
      return
    }
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'denied' })
      return
    }
    setGeo({ status: 'waiting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ status: 'ok', origin: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setGeo({ status: 'denied' }),
    )
  }, [search.near])

  return (
    <main className={`${PAGE} py-6 md:py-10`}>
      {state.status === 'ready' && (
        <header>
          <p className="text-sm text-ink-subtle">
            {formatWeekRange({ start: state.today, end: state.index.horizonEnd })}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">{formatUpdatedAt(state.index.generatedAt)}</p>
        </header>
      )}

      {/* 컨트롤은 데이터 없이도 뜬다(자치구 목록만 데이터 의존) — 껍데기 즉시성(스펙 8장) */}
      <BrowseControls
        search={search}
        districts={state.status === 'ready' ? districtsOf(state.index) : []}
        nearDisabledReason={
          geo.status === 'denied'
            ? '위치 권한이 없어 가까운 순을 쓸 수 없습니다 — 자치구로 좁혀 보세요'
            : undefined
        }
      />

      {state.status === 'loading' && <CatalogSkeleton />}
      {state.status === 'error' && (
        <CatalogError message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {state.status === 'ready' && (
        <BrowseResults
          index={state.index} today={state.today} now={state.now} search={search} geo={geo}
          openMonths={openMonths}
          onToggleMonth={(key) =>
            setOpenMonths((prev) => {
              const next = new Set(prev)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }
        />
      )}
    </main>
  )
}

/** 자치구 셀렉트 옵션은 하드코딩하지 않고 데이터에서 도출한다 — 이번 주 없는 구는 목록에도 없다 */
function districtsOf(index: CatalogIndexFile): string[] {
  return [...new Set(index.items.map((i) => i.district).filter((d): d is string => d !== undefined))]
    .sort((a, b) => a.localeCompare(b, 'ko'))
}

function BrowseResults({
  index, today, now, search, geo, openMonths, onToggleMonth,
}: {
  index: CatalogIndexFile
  today: string
  now: Date
  search: BrowseSearch
  geo: GeoState
  openMonths: ReadonlySet<string>
  onToggleMonth: (key: string) => void
}) {
  const filters = toBrowseFilters(search)
  const filtered = applyFilters(index.items, filters, now)

  if (filtered.length === 0) {
    return <EmptyResult suggestions={relaxSuggestions(index.items, filters, now)} search={search} />
  }

  // 가까운 순: 시간 축이 사라지고 행사·장소가 거리 하나로 선다(스펙 7장)
  if (search.near === true && geo.status === 'ok') {
    return (
      <section className="mt-6">
        {sortByDistance(filtered, geo.origin).map(({ item, km }) =>
          item.kind === 'event' ? (
            <BrowseEventRow key={item.id} item={item} today={today} km={km} />
          ) : (
            <BrowsePlaceRow key={item.id} item={item} km={km}
              hoursUnknownNote={search.open === true} />
          ),
        )}
      </section>
    )
  }

  const events = filtered.filter((i): i is CatalogEventIndexItem => i.kind === 'event')
  const places = filtered
    .filter((i): i is CatalogPlaceIndexItem => i.kind === 'place')
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  const groups = groupByTimeline(events, today, index.horizonEnd)

  return (
    <>
      {search.near === true && geo.status === 'waiting' && (
        <p className="mt-4 text-sm text-ink-subtle">위치 확인 중…</p>
      )}
      {groups.map((g) => (
        <TimelineSection key={g.key} group={g} today={today}
          collapsible={g.key.startsWith('month-')}
          expanded={!g.key.startsWith('month-') || openMonths.has(g.key)}
          onToggle={() => onToggleMonth(g.key)} />
      ))}
      {places.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">언제든 갈 수 있는 곳</h2>
            <span className="text-sm text-ink-muted">{places.length}건</span>
          </div>
          <div className="mt-3">
            {places.map((p) => (
              <BrowsePlaceRow key={p.id} item={p} hoursUnknownNote={search.open === true} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
```

Task 9의 `BrowseList`는 이 교체로 사라진다(`BrowseResults`가 대체).

- [ ] **Step 3: 브라우저 확인 (dev)**

`npm run dev` 후 `http://localhost:3000/seoulchi/browse`:

1. **칩 단일 선택**: `공연` 누르면 목록이 줄고 URL에 `?group=공연`. 다시 누르면 해제
2. **뒤로가기가 필터를 되돌린다**: 칩 두 개를 차례로 누른 뒤 브라우저 뒤로가기 — 상태가 한 단계씩 돌아온다. **이게 이 태스크의 합격 기준이다**(휴리스틱 3의 응답)
3. **자치구 셀렉트**: `마포구` 선택 → 목록·URL 반영. 장소도 걸러진다(주소 파생 district)
4. **0건 + 완화 제안**: `공연` + 자치구 아무 구나 + `지금 열림` 조합으로 0건을 만들고, "…을 풀면 N건" 링크가 뜨고 눌러서 동작하는지
5. **지금 열림**: 켰을 때 hours 미상 장소가 사라지지 않고 "영업시간 미상"이 붙는지
6. **가까운 순**: 허용 → 시간 축이 사라지고 행사·장소가 섞여 거리 오름차순, 거리 표기(`850m`/`1.2km`). 거부(브라우저 설정) → 토글 비활성 + 사유 한 줄
7. **새로고침**: `?group=공연&free=true` URL을 직접 열면 그 상태로 시작. `?group=없는값`은 조용히 전체로 복구
8. 390px 뷰포트에서 가로 넘침 없음 (칩 줄만 자체 스크롤)

- [ ] **Step 4: 확인 목록 #4 기록**

`validateSearch: browseSearchSchema`가 동작했는지(타입·런타임), 폴백을 썼는지를 "확인 결과" #4에 기록한다.

- [ ] **Step 5: 빌드·전체 테스트 확인**

```bash
npm run build
npm test
```

Expected: 둘 다 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/routes/browse.tsx src/components/browse.tsx docs/superpowers/plans/2026-08-31-browse-mode.md
git commit -m "feat: 탐색 필터 — 칩·토글·자치구·가까운 순·0건 완화

필터 상태는 URL search params다. 이유는 공유가 아니라 뒤로가기 —
필터를 만들면서 뒤로가기로 되돌릴 수 없으면 휴리스틱 3의 1점을 다시
받는다. 0건은 막다른 길 대신 어떤 필터를 풀면 몇 건인지 제시한다
(휴리스틱 9). 가까운 순은 시간 축을 접고 행사·장소를 거리 하나로
세운다 — '여기서 뭐 하고 있지'에서 그 구분은 의미가 없다. 위치 거부
시 비활성 + 사유 + 자치구 유도. hours 미상 207건은 버리지 않는다."
```

---

## Task 11: 루트 헤더 — 제목과 추천/탐색 세그먼트

두 화면 공통 헤더(스펙 7장). 앱 제목은 유지하고 세그먼트를 그 아래 둔다. 범위 줄은 여기 두지 않는다 — 탭마다 다르므로(추천 `8/31 – 9/6 기준`, 탐색 `8/31 – 10/26 기준`) 각 라우트가 자기 범위 줄을 그린다. 그래서 탐색 탭에서 "이번 주"가 거짓말이 되지 않는다.

이 태스크가 마지막 화면 태스크인 이유: **헤더가 `/browse`로 링크를 거는 순간 `crawlLinks`가 그 링크를 따라간다** — 라우트(Task 9·10)가 먼저 있어야 `failOnError` 빌드가 초록이다.

제목이 루트의 `h1`이 되므로 상세의 항목 제목은 `h2`로 내린다(페이지당 `h1` 하나 — 크리틱 Sam 항목의 헤딩 트리 지적). 세그먼트 활성 표시는 뉴트럴(밑줄)로 한다 — 액센트 주황을 어디 쓸지는 DESIGN.md의 미결정이고 이 계획이 정하지 않는다.

**Files:**
- Modify: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/e/$id.tsx`

**Interfaces:**
- Consumes: 라우트 `/browse` (Task 9·10), `ThemeToggle`/`PAGE` (기존)
- Produces: 모든 페이지 상단의 공통 헤더. 크리틱 P1 "상세 막다른 길"(뒤로 갈 UI 없음)도 이 헤더가 갚는다 — 상세에도 홈·탐색으로 가는 길이 생긴다

- [ ] **Step 1: `__root.tsx`에 헤더 추가**

`RootDocument`의 토글 줄을 헤더로 교체한다:

```tsx
import { createRootRoute, HeadContent, Link, Scripts } from '@tanstack/react-router'
```

```tsx
function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-surface text-ink">
        {/*
         * 두 화면 공통 헤더(스펙 7장). 제목 유지 + 세그먼트.
         * 범위 줄은 탭마다 달라서 여기 없다 — 각 라우트가 자기 범위 줄을 그린다.
         * 상세에서도 이 헤더가 보이므로 '돌아갈 길 없음'(크리틱 P1)이 사라진다.
         */}
        <header className={`${PAGE} pt-4`}>
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-bold md:text-3xl">
              <Link to="/">이번 주 서울</Link>
            </h1>
            <ThemeToggle />
          </div>
          <nav aria-label="화면 전환" className="mt-3 flex gap-6 border-b border-neutral-border">
            <TabLink to="/" label="추천" />
            <TabLink to="/browse" label="탐색" />
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/**
 * 세그먼트 탭. TanStack Link는 활성일 때 .active 클래스를 붙인다 —
 * activeProps의 className 병합 규칙에 기대지 않고 [&.active] 변형으로 스타일링한다.
 * 활성 표시는 뉴트럴 밑줄 — 액센트를 어디 쓸지는 DESIGN.md의 미결정이다.
 */
function TabLink({ to, label }: { to: '/' | '/browse'; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="-mb-px border-b-2 border-transparent pb-2 text-ink-muted [&.active]:border-ink [&.active]:font-bold [&.active]:text-ink"
    >
      {label}
    </Link>
  )
}
```

- [ ] **Step 2: 홈 헤더 축소**

`src/routes/index.tsx`의 `<header>`에서 `h1`을 지운다 (제목이 루트로 올라갔다):

```tsx
      <header className="mb-6 md:mb-10">
        <p className="text-sm text-ink-subtle">{data.weekRangeLabel}</p>
        <p className="mt-1 text-xs text-ink-subtle">{data.updatedLabel}</p>
      </header>
```

main 끝의 주석 `{/* "전체 둘러보기 →"는 넣지 않는다 — /explore가 아직 없다 (스펙 10-1) */}`은 지운다 — 탐색이 생겼고 헤더 세그먼트가 그 역할이다. (경로 B로 `/all` 푸터 링크를 넣었다면 그건 그대로 둔다 — 크롤 시드다.)

- [ ] **Step 3: 상세 제목을 h2로**

`src/routes/e/$id.tsx`에서:

```tsx
          <h2 className="mt-4 text-2xl font-bold md:mt-0 md:text-3xl">{item.title}</h2>
```

(클래스는 그대로, 태그만 `h1` → `h2`. 루트에 `h1`이 생겨 페이지당 h1을 하나로 유지한다.)

- [ ] **Step 4: dev + 빌드 확인**

```bash
npm run dev & DEV_PID=$!; sleep 8
curl -s http://localhost:3000/seoulchi/ | grep -a -c '탐색'          # 홈에 세그먼트
curl -s http://localhost:3000/seoulchi/browse | grep -a -c '추천'    # 탐색에도 세그먼트
kill $DEV_PID
npm run build
grep -a -c '탐색' dist/client/index.html                             # 프리렌더에도 있다
test -f dist/client/browse/index.html && echo 'browse 프리렌더 OK'
npm test
```

Expected: 전부 매치/성공. (경로 B였다면 이 빌드부터 `/browse`가 크롤로 프리렌더된다.)

브라우저에서: 홈 ↔ 탐색 탭 전환, 활성 탭 밑줄, 상세 진입 후 헤더로 홈·탐색 복귀. 390px에서 헤더가 한 줄에 안 넘치는지.

- [ ] **Step 5: 커밋**

```bash
git add src/routes/__root.tsx src/routes/index.tsx src/routes/e
git commit -m "feat: 루트 헤더에 추천/탐색 세그먼트 추가

선별과 탐색은 동등한 지위다(스펙 2장) — 루트 헤더의 세그먼트로 형제가
된다. 범위 줄은 탭마다 달라 각 라우트가 그린다: 탐색에서 '이번 주'가
거짓말이 되지 않게. 상세에도 헤더가 생겨 '돌아갈 길 없음'(크리틱 P1)이
사라진다. 헤더가 마지막인 이유: 링크를 걸면 crawlLinks가 따라가므로
라우트가 먼저 있어야 빌드가 초록이다."
```

---

## Task 12: 문서 변경 — `PRODUCT.md` 포지셔닝 · `AGENTS.md` 데이터 모델

전제가 바뀌었으므로 조용히 우회하지 않고 같이 고친다(스펙 11장, CLAUDE.md "계획을 벗어날 때"). 두 문서 모두 커밋돼 있어 변경이 이력에 남는다.

**Files:**
- Modify: `PRODUCT.md` (Positioning 절), `AGENTS.md` (데이터 모델 서술)

**Interfaces:**
- Consumes: 스펙 2장(동등 결정)·3장(중복 80% 실측)
- Produces: 다음 세션이 잘못 판단하지 않을 문서

- [ ] **Step 1: `PRODUCT.md` Positioning 교체**

현재:

> 서울 행사를 전부 보여주는 곳이 아니라, 이번 주에 실제로 갈 만한 것만 잘라주는 곳.
> 망라는 원본 API가 이미 하고 있고 그건 도움이 안 됩니다. 이 앱이 파는 것은 **줄이는 판단**입니다.

다음으로 교체한다:

```markdown
서울에서 나갈 결정을 돕는 두 개의 동등한 경로.
**추천**은 이번 주에 실제로 갈 만한 것 12개로 잘라 결정 피로를 없애고,
**탐색**은 오늘부터 8주의 카탈로그를 카테고리·자치구·거리로 좁혀
"다가오는 것을 기다리는" 계획을 돕습니다.

망라 자체는 여전히 팔지 않습니다 — 그건 원본 API가 이미 하고 있고 도움이 안 됩니다.
추천이 파는 것이 줄이는 판단이라면, 탐색이 파는 것은 목록이 아니라 **좁히는 도구**입니다.
어느 경로든 성공 판정은 같습니다: 이 화면을 보고 실제로 나갔는가.
```

**성공 판정("외출")은 건드리지 않는다** — 탐색도 나가는 결정을 돕기 위한 것이지 체류시간을 위한 게 아니다(스펙 11장).

- [ ] **Step 2: `AGENTS.md` 데이터 모델 서술 교체**

"Plan 1이 먼저였던 이유:" 문단(현재 "주간 파일 통째 로드 + 전부 SSG" 단층 서술)을 다음 취지로 교체한다:

```markdown
Plan 1이 먼저였던 이유: Task 14에서 측정한 데이터 파일 크기가
앱의 데이터 로딩 설계를 결정하기 때문입니다. 데이터 모델은 **2층**입니다.

- **홈 = 주간 파일 통째 로드 + 전부 SSG.** 빌드 타임에만 읽으므로 클라이언트
  번들에 데이터가 한 건도 들어가지 않습니다(Task 11에서 확인).
- **탐색 = 8주 인덱스(`data/index.json`) + 클라이언트 필터.** 주 단위 슬라이스는
  탐색과 맞지 않기 때문입니다 — 주간 파일은 주마다 약 80%가 같은 행사이고
  (W35의 272건 중 217건이 2주 전 W33에도 있던 행사, 2026-08-31 실측),
  미래 시작 행사는 0건입니다(score가 주 단위로 자르므로). 인덱스는 목록·필터용
  슬림 투영이고, 전체 필드는 `data/catalog.json`(빌드 타임 전용, 상세 SSG의
  원천)이 갖습니다.
```

- [ ] **Step 3: 커밋**

```bash
git add PRODUCT.md AGENTS.md
git commit -m "docs: 포지셔닝과 데이터 모델을 탐색 모드에 맞게 갱신

선별과 탐색이 동등해졌다(스펙 2장) — '전부 보여주는 곳이 아니라'는
포지셔닝이 탐색의 존재와 어긋난다. 성공 판정(외출)은 그대로 둔다.
데이터 모델은 주간 파일 단층에서 2층(주간+8주 인덱스)으로 — 근거로
주 간 중복 80% 실측을 남긴다. 전제가 바뀌면 문서를 같이 고친다."
```

---

## Task 13: 최종 검증 — 테스트 · 빌드 실측 · 정적 서빙 · Playwright · 크리틱 재측정

마지막 게이트. "전부 정적"과 "홈 데이터 0바이트"를 실제 정적 파일 서버로 검증하고, 크리틱과 같은 방법(Playwright 390×844)으로 새 화면을 재진단해 **17/40이 어디까지 올라가는지 기록**한다.

**Files:**
- Modify: `AGENTS.md` (현재 상태 절 — 페이지 수·빌드 시간·새 파일), `docs/2026-08-21-ui-ux-critique.md` (재측정 절 추가), 이 계획 파일 (확인 결과·실측 기록)

**Interfaces:**
- Consumes: Task 0~12 전부
- Produces: 없음 (검증과 기록)

- [ ] **Step 1: 전체 테스트 + 타입 체크**

```bash
npm test
npm run typecheck
```

Expected: 둘 다 초록. 테스트 파일·개수를 기록한다 (기준선 24파일 251테스트에서 얼마나 늘었는지).

- [ ] **Step 2: 빌드 실측**

```bash
rm -rf dist && time npm run build
find dist/client -name 'index.html' | wc -l
du -sh dist/client
```

기록할 것: 총 페이지 수, 빌드 시간(3회 평균), Plan 2의 19페이지 1.3초 대비 페이지당 증분이 0.017초 추정과 맞았는지. 이 계획의 "실측 데이터" 절과 AGENTS.md에 옮긴다.

- [ ] **Step 3: 번들 오염 검사**

```bash
# 데이터가 JS 번들에 새면 안 된다 — 인덱스는 별도 에셋(.json)으로만 존재해야 한다
grep -l 'vs-KOP0' dist/client/assets/*.js && echo '번들 오염!' || echo 'OK: JS에 데이터 없음'
# 홈 HTML은 여전히 인덱스와 무관하다
grep -a -q 'horizonEnd' dist/client/index.html && echo '홈 오염!' || echo 'OK: 홈에 카탈로그 데이터 없음'
```

- [ ] **Step 4: base 경로 포함 정적 서빙 검증**

크리틱과 같은 방법 — base가 `/seoulchi/`이므로 서버 루트가 아니라 그 아래에 얹는다(Plan 2 확인 결과 #3 정정의 교훈):

```bash
tmp=$(mktemp -d) && ln -s "$PWD/dist/client" "$tmp/seoulchi"
(cd "$tmp" && python3 -m http.server 4173 &)
```

브라우저에서 `http://localhost:4173/seoulchi/`, **개발자 도구 네트워크 탭을 연 채**:

1. **홈 첫 로드에 `index.json` 요청이 없다** — 홈 데이터 0바이트 유지의 증거
2. 헤더 `탐색` → `/browse`: 스켈레톤 → 목록. `index.json` fetch가 base 붙은 URL로 200
3. 필터 몇 개 적용 → 뒤로가기로 되돌아온다
4. **홈이 링크하지 않는** 행사 행을 눌러 상세 진입 — 실패 요청(4xx/5xx) 없음 (전량 프리렌더 + 인자별 캐시의 통합 검증)
5. `http://localhost:4173/seoulchi/browse?group=공연&free=true` 직접 진입 — 그 상태로 시작
6. 없는 id(`/seoulchi/e/sc-nope`) 직접 진입 — 404 컴포넌트
7. 다크 토글 — 탐색 화면의 칩·에러 박스·스켈레톤이 다크 토큰으로 따라온다

- [ ] **Step 5: Playwright 390×844 진단 + 크리틱 재측정**

크리틱 문서의 방법 그대로(Playwright로 정적 서빙 화면 계측): 390×844에서 `/browse` 기본·칩 선택·0건 상태·상세, 1440×900에서 가로 넘침 여부를 스크린샷·DOM 계측한다. 확인할 것:

- 390px에서 `scrollWidth` ≤ 390 (칩 줄은 자체 `overflow-x-auto`만)
- 탭·칩·행의 터치 타깃과 대비(역할 토큰이므로 AA는 시스템이 보장하지만, 새 조합이 없는지 확인)
- 첫 화면에서 세그먼트·칩·첫 그룹이 보이는지 (스케치의 정보 밀도)

그리고 `docs/2026-08-21-ui-ux-critique.md` 끝에 **"재측정 (탐색 모드 이후)"** 절을 추가한다: 같은 10개 휴리스틱 표를 다시 채점하고(특히 3 User Control — 내비·필터·뒤로가기, 7 Flexibility — 거리·지금 열림, 9 Error Recovery — 0건 완화·fetch 재시도), 새 합계와 **아직 남은 빚**(예: 페이지별 `<title>`, hover/motion 부재, 출처 표기)을 기록한다. 채점은 화면 실측을 근거로 하고 점수를 미리 정하지 않는다.

- [ ] **Step 6: `AGENTS.md` 현재 상태 갱신**

- "웹앱은 홈(`/`)과 상세(`/e/$id`) 두 화면이 동작합니다 … **19페이지** … 링크되지 않은 id는 프리렌더되지 않고 404입니다" 문단을 실측으로 교체: 세 화면(`/`·`/browse`·`/e/$id`), 프리렌더 N페이지(카탈로그 전량 — 링크 안 된 id 404는 사라짐), 빌드 M초.
- 산출 데이터 나열에 `data/index.json`(슬림 인덱스)·`data/catalog.json`(8주 전체 필드, 빌드 타임 전용)과 meta의 `anomalies`·`unmappedCategories`를 추가.

- [ ] **Step 7: 이 계획의 기록 마무리**

"확인 결과" 절 4항목이 전부 채워졌는지, Task 5(인덱스 크기)·Task 8(페이지 수·시간)·이 태스크의 실측이 적혔는지 확인한다. 비어 있으면 지금 채운다.

- [ ] **Step 8: 커밋**

```bash
git add AGENTS.md docs/2026-08-21-ui-ux-critique.md docs/superpowers/plans/2026-08-31-browse-mode.md
git commit -m "docs: 탐색 모드 완료 — 검증 실측과 크리틱 재측정 기록

정적 서빙(base 포함)으로 홈 데이터 0바이트와 전량 프리렌더를 검증했다.
크리틱을 같은 방법으로 재진단해 17/40이 어디까지 올라갔는지, 무엇이
남았는지 기록했다 — 문서가 현실과 어긋난 채 남으면 다음 세션이 잘못
판단한다."
```

---

## Self-Review 노트 (계획 작성 시점)

**스펙 커버리지:**

- **2장 결정 요약** — 동등 세그먼트(Task 11), 오늘~+8주(Task 3), 시간 축 목록(Task 6·9), 거리 정렬 먼저·지도 보류(Task 6·10, 범위 밖 유지), 6그룹+기타(Task 1), 슬림 인덱스+클라이언트 필터(Task 4·5·9)
- **4장 아키텍처** — score 뒤 선택 경로(Task 5의 run 연결), 기존 파일 불변(Global Constraints + 전 태스크), 이상치 stderr+meta(Task 3·5), 프리렌더 확대(Task 8)
- **5장 데이터 계약** — `catalogIndexSchema`·필드 생략 규칙·hours 포함(Task 4), emit 전부 검증(Task 5)
- **6장 카테고리** — 53종 전량 픽스처·미매핑 기타·수집(Task 1)
- **7장 화면** — 루트 헤더·범위 줄(Task 11), 칩·토글·셀렉트(Task 10), 시간 축 그룹 정의·유효 시작일 1회 배치(Task 6), 장소 별도 섹션·가까운 순 병합(Task 9·10), 기타 칩 제외(Task 7), 상대 날짜(Task 2), URL search params·뒤로가기(Task 7·10)
- **8장 경계와 실패** — 0건 완화(Task 6·10), 위치 거부(Task 10), fetch 실패·재시도(Task 9), 스켈레톤(Task 9), hours 미상 유지(Task 6·10)
- **9장 테스트** — 신규 4파일(category·select-catalog·browse-filter·browse-search) + emit 확장 + 빌드→정적 서빙→Playwright 재진단(Task 13)
- **10장 재사용** — `haversineKm`(Task 6), `open-now`(Task 6·9의 OpenNowBadge), `hours.ts`(그대로 — 파싱 결과만 소비), `dates.ts`(Task 2 확장), `static-fn-base` 전례는 `?url` 임포트로 대체(Task 9 주석에 근거)
- **11장 문서** — Task 12 (성공 판정 유지 명시)
- **12장 게이트** — Task 0 + Task 8 시작 조건 + 폴백 경로 B
- **13장 범위 밖** — 격자 달력·지도·검색 없음. `무료만`은 정식 필터(카탈로그 무료 44%, Global Constraints)

**타입 일관성 확인:** `CategoryGroup`(1→4·6·7), `CatalogSelection`(3→4·5), `CatalogIndexFile`/`CatalogEventIndexItem`/`CatalogPlaceIndexItem`(4→5·6·9·10), `BrowseFilters`(6→7·10), `BrowseSearch`(7→10), `TimelineGroup`/`DistanceEntry`/`RelaxSuggestion`(6→9·10), `loadCatalog`/`loadIndex`(5→8), `EmitPayload.catalog`/`unmappedCategories`(5의 emit·run 양쪽) — 이름·시그니처 대조함.

**의도된 비대칭·중복:**

- `md()`(browse.tsx)와 `formatMonthDay`(dates.ts private)가 같은 일을 한다. private을 export하지 않은 이유: 그룹 헤더 범위 표기는 뷰의 지역 관심사고, 두 줄짜리 중복이 모듈 경계를 여는 것보다 싸다.
- `ItemImage`의 `category`에 슬림 항목의 `group`을 넘긴다 — 원시 카테고리가 슬림에 없다. 같은 그룹 = 같은 폴백 색이므로 결정론은 유지되고, 홈·상세(원시 카테고리 기준)와 폴백 색이 다를 수 있다. 이미지 실패 시에만 보이는 색이라 감수한다(Task 9 주석에 명시).
- `OpenNowBadge`는 자기 effect에서 `new Date()`를 부르고, 탐색 필터는 fetch 시점의 `state.now`를 쓴다. 자정 직전에 두 값이 다를 수 있으나, 배지는 브라우저 경계의 확립된 패턴이라 재사용을 우선했다.
- 시간 축 그룹 키(`week`/`weekend`/`next-week`/`month-YYYY-M`)는 URL에 나가지 않는다 — 접힘 상태는 필터가 아니다(Task 9 주석).

**리뷰어에게 — 합의가 필요한 지점:** 문서 상단 "스펙에 없는 구현 결정" 3건(catalog.json / 장소 district 파생 / 장소 imageUrl·isFree). 셋 다 스펙의 다른 문장을 지키기 위한 최소 수단으로 골랐고, 다르게 합의되면 Task 4·5·8만 고치면 된다.
