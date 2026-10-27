# 오늘 중심 홈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 "이번 주 12개"에서 추천 선반 3개 + 오늘·내일·이번 주말 행사 전체 목록(지역·내 주변·목적 필터)으로 바꾸고, 카테고리를 목적 4그룹으로 바꾼다.

**Architecture:** 추천 선반은 지금처럼 빌드 타임 서버 함수(`getHomeData`)로 프리렌더한다. 목록은 탐색처럼 `index.json`을 클라이언트에서 받아 브라우저의 오늘로 거른다. 날짜·정렬·선반 규칙은 순수 함수(`src/lib/today.ts`)에 두고, 카탈로그 fetch와 위치 권한은 탐색 라우트에서 훅으로 빼 두 화면이 같이 쓴다.

**Tech Stack:** TanStack Start/Router(정적 프리렌더), React, Tailwind v4(`src/styles/foundation.css` 토큰), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-today-home-design.md`

## 선행 조건

PR #13(`ListRow`)과 #14(배지 줄)가 main에 머지돼 있어야 한다. 이 계획의 목록 행은 #13 이후의 `ListRow`/`BrowseEventRow`를 쓴다. 작업 브랜치는 머지된 main에서 딴다.

## Global Constraints

- 목적 그룹 이름(문자열 그대로): `'보러 가기'`, `'해보러 가기'`, `'걸으러 가기'`, `'놀러 가기'`, `'기타'`.
- 탐색 칩: 기타를 뺀 4개. 홈 칩: `'보러 가기'`, `'해보러 가기'`, `'놀러 가기'` 3개.
- 날짜 탭 라벨: `오늘`, `내일`, `이번 주말`. 기본은 오늘.
- 추천 선반은 최대 3개. 필터·날짜 탭과 무관하다.
- 홈 목록은 행사만. 장소는 홈에 나오지 않는다.
- `new Date()`는 경계(서버 함수 handler, 브라우저 fetch 직후)에서 한 번만. 라이브러리 함수는 `today: string`을 인자로 받는다(레포 규칙).
- 색·간격·글자·모서리는 토큰만(`tests/styles/foundation.test.ts`가 강제). 칩·버튼은 `src/components/ui.tsx`에서 가져온다.

## Review Focus

1. 토요일·일요일에 "이번 주말" 탭. 토요일이면 토·일, 일요일이면 일요일 하루. 주중이면 다가오는 토·일. → Task 2 테스트.
2. 추천이 전부 만료됐거나 주말까지 시작하지 않는 주. 선반이 통째로 사라지고 빈 제목이 남지 않는다. → Task 2(`pickShelf` 0개), Task 4(선반 조건부 렌더).
3. 옛 링크 `/?group=전시`, `/browse?group=공원·자연`. 던지지 않고 필터 없음으로 복구한다. → Task 1, Task 4 스키마 테스트.
4. 필터 결과 0건. 빈 화면 대신 "조건에 맞는 행사가 없습니다"와 풀 수 있는 필터를 보여준다. → Task 4.
5. 위치 권한 거절. 내 주변 칩이 꺼진 모양으로 남고 이유 문구가 보인다(탐색과 같은 동작). → Task 3이 동작을 옮기고 Task 4가 쓴다.

---

### Task 1: 목적 그룹으로 바꾸고 인덱스를 다시 만든다

**Files:**
- Modify: `src/lib/category.ts`(`CATEGORY_GROUPS`, `GROUP_BY_RAW`, 주석의 실측 수)
- Modify: `src/lib/browse-search.ts`(`CHIP_GROUPS`)
- Modify: `data/index.json`(재생성)
- Modify: `docs/superpowers/specs/2026-08-31-browse-mode-design.md`(맨 위에 변경 메모 한 단락)
- Test: `tests/lib/category.test.ts`, `tests/lib/browse-search.test.ts`, `tests/lib/browse-filter.test.ts`, `tests/pipeline/select-catalog.test.ts`

**Interfaces:**
- Produces: `CATEGORY_GROUPS = ['보러 가기', '해보러 가기', '걸으러 가기', '놀러 가기', '기타'] as const`, `CategoryGroup`, `CHIP_GROUPS`(기타 뺀 4개, 같은 순서). `categoryGroupSchema`는 `CATEGORY_GROUPS`에서 나오므로 따라 바뀐다.

매핑(원시값 53종 전부 유지, 그룹만 바꾼다):
- 전시·공연의 원시값 → `보러 가기`
- 체험·배움의 원시값 → `해보러 가기`
- 공원·자연·역사·명소의 원시값 → `걸으러 가기`. 단 `테마공원`, `레저스포츠시설`은 `놀러 가기`
- 축제의 원시값 → `놀러 가기`
- 기타는 그대로

- [ ] **Step 1: 테스트를 새 그룹으로 고친다**

`tests/lib/category.test.ts`의 `FIXTURE`를 위 매핑으로 바꾼다(53종 수는 그대로). `'그룹은 7개 고정'` 테스트는 `CATEGORY_GROUPS`가 5개이고 픽스처가 5그룹을 전부 쓴다고 단언한다. 추가:

```ts
it('테마공원·레저스포츠시설은 걸으러가 아니라 놀러 가기다', () => {
  expect(categoryGroup('테마공원')).toBe('놀러 가기')
  expect(categoryGroup('레저스포츠시설')).toBe('놀러 가기')
})
```

`browse-search.test.ts`에 추가: `browseSearchSchema.parse({ group: '공원·자연' })`이 `{ group: undefined }`(옛 링크 복구). 나머지 세 테스트 파일은 옛 그룹 문자열을 새 그룹으로 바꾸기만 한다.

- [ ] **Step 2: `npm test`로 실패를 확인한다**

Expected: category·browse-search 등에서 옛 그룹 이름 때문에 FAIL.

- [ ] **Step 3: `category.ts`, `browse-search.ts`를 고친다**

`category.ts` 상단 주석의 그룹별 수는 아래 Step 5에서 센 값으로 바꾼다. `CHIP_GROUPS` 주석의 "6개"도 고친다.

- [ ] **Step 4: `npm test` 통과를 확인한다**

- [ ] **Step 5: `data/index.json`의 group을 다시 만든다**

인덱스에는 원시 category가 없다. 원시값은 `data/catalog.json`(행사)과 `data/places.json`(장소)에 있다. 일회성 tsx로 id → `categoryGroup(category)`를 만들어 `index.json`의 각 항목 `group`만 바꾸고 다른 필드·순서·`generatedAt`은 그대로 둔다. 스크립트는 커밋하지 않는다(다음 배치부터는 `buildCatalogIndex`가 새 그룹을 쓴다). 결과를 kind별로 세서 출력한다.

Expected: 행사에 `걸으러 가기`가 0건. 매칭 안 된 id 0건.

- [ ] **Step 6: `npm run typecheck && npm run build`**

Expected: 둘 다 성공. 빌드가 `catalogIndexSchema`로 `index.json`을 검증한다.

- [ ] **Step 7: 탐색 설계에 메모를 남기고 커밋**

`2026-08-31-browse-mode-design.md` 제목 아래에 한 단락: "2026-10-27: 카테고리 6그룹은 목적 4그룹으로 바뀌었다. `2026-10-26-today-home-design.md` 3장."

```bash
git add src/lib/category.ts src/lib/browse-search.ts data/index.json tests docs/superpowers/specs/2026-08-31-browse-mode-design.md
git commit -m "feat: 카테고리를 목적 4그룹으로 바꾼다"
```

---

### Task 2: 날짜 탭·정렬·추천 선반 규칙

**Files:**
- Create: `src/lib/today.ts`
- Modify: `src/lib/home.ts`(`pickHomeItems` 삭제, `HomeEntry`는 남긴다)
- Test: `tests/lib/today.test.ts`, `tests/lib/home.test.ts`(삭제하거나 `HomeEntry`만 쓰면 지운다)

**Interfaces:**
- Consumes: `addDays(iso, n)`, `weekdayOf(iso)`(0=일, `src/lib/dates.ts`), `CatalogEventIndexItem`, `HomeEntry`.
- Produces:
  - `type DayTab = 'today' | 'tomorrow' | 'weekend'`
  - `dayRange(tab: DayTab, today: string): { start: string; end: string }`
  - `eventsOn(items: CatalogEventIndexItem[], range: { start: string; end: string }): CatalogEventIndexItem[]` 기간이 범위와 하루라도 겹치는 것(`startDate <= end && endDate >= start`).
  - `sortByDeadline(items: CatalogEventIndexItem[]): CatalogEventIndexItem[]` `endDate` 오름차순, 같으면 `id`. 원본을 바꾸지 않는다. (스펙의 "사진 있는 것 먼저"는 뺐다. 2026-10-27 실측 오늘 행사 262건 전부 `imageUrl`이 있어 순서를 바꾸지 못한다.)
  - `pickShelf(picks: HomeEntry[], today: string, count = 3): HomeEntry[]` 이번 주말 끝까지 하루도 겹치지 않는 것(`endDate < today` 또는 `startDate > dayRange('weekend', today).end`)을 먼저 빼고 앞에서 `count`개.

- [ ] **Step 1: 실패하는 테스트**

테스트 파일 안의 도우미: `ev(id, startDate, endDate)`는 최소 필드의 `CatalogEventIndexItem`, `pick(id, startDate, endDate)`는 `reason: ''`인 `HomeEntry`(`tests/lib/home.test.ts`의 `ev`와 같은 모양의 `EventItem`).

```ts
// 2026-10-28 수, 10-31 토, 11-01 일
it('오늘·내일은 하루', () => {
  expect(dayRange('today', '2026-10-28')).toEqual({ start: '2026-10-28', end: '2026-10-28' })
  expect(dayRange('tomorrow', '2026-10-28')).toEqual({ start: '2026-10-29', end: '2026-10-29' })
})
it('주중의 이번 주말은 다가오는 토·일', () => {
  expect(dayRange('weekend', '2026-10-28')).toEqual({ start: '2026-10-31', end: '2026-11-01' })
})
it('토요일이면 토·일, 일요일이면 일요일 하루', () => {
  expect(dayRange('weekend', '2026-10-31')).toEqual({ start: '2026-10-31', end: '2026-11-01' })
  expect(dayRange('weekend', '2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-01' })
})
it('eventsOn은 하루라도 겹치면 남긴다', () => {
  const r = { start: '2026-10-31', end: '2026-11-01' }
  const ids = eventsOn([
    ev('끝남', '2026-10-01', '2026-10-30'), ev('나중', '2026-11-02', '2026-11-30'),
    ev('걸침', '2026-10-01', '2026-10-31'), ev('안', '2026-11-01', '2026-11-01'),
  ], r).map((e) => e.id)
  expect(ids).toEqual(['걸침', '안'])
})
it('sortByDeadline: 종료일 → id, 원본 불변', () => {
  const input = [ev('b', '2026-10-01', '2026-11-05'), ev('c', '2026-10-01', '2026-10-30'), ev('a', '2026-10-01', '2026-11-05')]
  expect(sortByDeadline(input).map((e) => e.id)).toEqual(['c', 'a', 'b'])
  expect(input.map((e) => e.id)).toEqual(['b', 'c', 'a'])
})
it('pickShelf: 만료·주말 뒤 시작을 먼저 빼고 3개', () => {
  // today 2026-10-28(수), 주말 끝 11-01
  const picks = [pick('만료', '2026-10-01', '2026-10-27'), pick('먼', '2026-11-02', '2026-11-30'),
    pick('a', '2026-10-01', '2026-11-30'), pick('b', '2026-11-01', '2026-11-01'),
    pick('c', '2026-10-28', '2026-10-28'), pick('d', '2026-10-01', '2026-12-01')]
  expect(pickShelf(picks, '2026-10-28').map((p) => p.item.id)).toEqual(['a', 'b', 'c'])
})
it('pickShelf: 남는 게 없으면 빈 배열', () => {
  expect(pickShelf([pick('만료', '2026-10-01', '2026-10-27')], '2026-10-28')).toEqual([])
})
```

- [ ] **Step 2: `npx vitest run tests/lib/today.test.ts` 실패 확인**
- [ ] **Step 3: `src/lib/today.ts` 구현, `home.ts`의 `pickHomeItems`와 그 테스트 삭제**

`pickHomeItems`의 다른 호출처는 `src/routes/index.tsx`뿐이고 Task 4가 바꾼다. 이 태스크에서는 `index.tsx`가 임시로 `pickShelf`를 부르게 해 빌드를 유지한다. `resolve.ts` 주석의 "부족분은 pickHomeItems가 채운다" 문장은 지운다.

- [ ] **Step 4: `npm test && npm run typecheck` 통과**
- [ ] **Step 5: 커밋** `feat: 날짜 탭과 추천 선반 규칙`

---

### Task 3: 카탈로그 fetch와 위치 권한을 훅으로 뺀다

**Files:**
- Create: `src/components/catalog-hooks.ts`
- Modify: `src/routes/browse.tsx`(fetch effect·geolocation effect·`CatalogState`·`GeoState`를 훅 호출로 바꾼다)
- Modify: `src/components/browse.tsx`, `src/components/ui.tsx`(`Chip` 컴포넌트를 `ui.tsx`로 옮겨 export)

**Interfaces:**
- Produces:
  - `type CatalogState`, `type GeoState`(지금 `browse.tsx`의 정의 그대로)
  - `useCatalog(): { state: CatalogState; retry: () => void }`
  - `useGeo(near: boolean): GeoState`
  - `Chip({ active, onClick, children })`를 `src/components/ui.tsx`에서 export

동작은 바꾸지 않는다. 주석(cancelled 가드의 이유, `new Date()` 경계)은 코드와 함께 옮긴다.

- [ ] **Step 1: 옮긴다**
- [ ] **Step 2: `npm test && npm run typecheck && npm run build`**
- [ ] **Step 3: 탐색을 브라우저에서 확인**

`npm run dev` 후 `/seoulchi/browse`에서 칩 하나, 가까운 순(권한 거절 시 경고 문구), `index.json` fetch 실패 시 에러 콜아웃과 다시 시도. 셋 다 머지 전과 같다.

- [ ] **Step 4: 커밋** `refactor: 카탈로그·위치 훅을 탐색 라우트에서 뺀다`

---

### Task 4: 새 홈

**Files:**
- Create: `src/lib/home-search.ts`
- Create: `src/components/home.tsx`(`HomeControls`, `HomeEmpty`)
- Modify: `src/routes/index.tsx`
- Modify: `src/components/cards.tsx`(`CompactEventRow`, `PlaceCard` 삭제. 다른 사용처 없음을 grep으로 확인)
- Test: `tests/lib/home-search.test.ts`

**Interfaces:**
- Consumes: Task 1 `CategoryGroup`, Task 2 전부, Task 3 `useCatalog`, `useGeo`, `Chip`, `BrowseEventRow`(#13 이후), `sortByDistance`, `isCatalogStale`, `StaleCatalog`, `CatalogError`, `CatalogSkeleton`, `EventPosterCard`, `chip()`.
- Produces:
  - `HOME_GROUPS = ['보러 가기', '해보러 가기', '놀러 가기'] as const`
  - `homeSearchSchema` = `{ day?: 'tomorrow' | 'weekend', group?: HOME_GROUPS, district?: string, near?: true }`. 잘못된 값은 `.catch(undefined)`. `day` 없음이 오늘이다.

화면(위에서 아래, 스펙 4장):
1. 헤더(지금의 갱신 시각 줄은 남긴다. 주 범위 줄은 뺀다).
2. 추천 선반. 로더는 `pickShelf(resolved.picks, 빌드 today, 3)`보다 넉넉하게 살아 있는 picks를 돌려주고(`pickShelf(..., Infinity)`), 화면이 브라우저 today로 `pickShelf(..., 3)`을 한 번 더 부른다. 배포는 매일 06:30 KST라 자정~06:30 사이에는 빌드 today가 하루 늦다. 프리렌더 첫 그림은 빌드 today 기준이고 마운트 후 다시 그린다(`BrowseControls`의 hydrated와 같은 방식). 0개면 `<section>` 자체를 그리지 않는다. 제목은 `추천`.
3. `HomeControls`. 날짜 탭 3개(`Chip`, 단일 선택, 활성은 색으로), 목적 칩 3개(`전체` 포함), 내 주변 칩, 자치구 select. `BrowseControls`의 하이드레이션 우회(`hydrated`/`shown`)와 같은 방식을 쓴다. 이유 주석은 "BrowseControls와 같은 이유"로 한 줄만.
4. 목록. `useCatalog()`의 행사(`kind === 'event'`)를 그룹·자치구로 거르고(`applyFilters` 재사용, 장소는 미리 뺀다), `eventsOn(dayRange(day, 브라우저 today))`, 선반 id 제외, 그다음 near가 켜지고 위치가 있으면 `sortByDistance`, 아니면 `sortByDeadline`. 위에 `N건`. 행은 `BrowseEventRow`.
카탈로그 상태별로 탐색과 같게 그린다: 로딩은 `CatalogSkeleton`, 실패는 `CatalogError`(다시 시도), `isCatalogStale`이면 `StaleCatalog`. 선반과 컨트롤은 카탈로그와 무관하게 먼저 뜬다.
5. 0건이면 `HomeEmpty`: "조건에 맞는 행사가 없습니다" + 켜진 필터(목적·자치구)마다 그것을 푼 링크. 날짜가 오늘이 아니면 "오늘 보기" 링크.

- [ ] **Step 1: `home-search.test.ts`**

```ts
expect(homeSearchSchema.parse({})).toEqual({})
expect(homeSearchSchema.parse({ day: 'weekend', group: '놀러 가기' })).toEqual({ day: 'weekend', group: '놀러 가기' })
expect(homeSearchSchema.parse({ group: '전시', day: 'yesterday' })).toEqual({ group: undefined, day: undefined })
expect(homeSearchSchema.parse({ group: '걸으러 가기' }).group).toBeUndefined() // 홈에는 없는 칩
```

- [ ] **Step 2: 실패 확인 → `home-search.ts` 구현 → 통과**
- [ ] **Step 3: `index.tsx`, `home.tsx`를 쓰고 `cards.tsx`에서 안 쓰는 것을 지운다**

로더에서 `loadPlaces`·`resolved.places`·`weekRangeLabel`을 뺀다. `getHomeData`는 `{ updatedLabel, today, shelf }`를 돌려준다.

- [ ] **Step 4: `npm test && npm run typecheck && npm run build`**

`tests/styles/foundation.test.ts`가 새 파일의 클래스도 검사한다.

- [ ] **Step 5: 브라우저 확인(390px, 320px)**

`/seoulchi/`에서: 선반 3개 이하, 탭 전환 시 목록 수가 바뀜, `?day=weekend&group=놀러 가기` 직접 열기에서 칩이 켜진 모양, 자치구+목적으로 0건 만들기 → `HomeEmpty`, 내 주변 거절 → 경고 문구, 320px에서 가로 넘침 없음. 스크린샷을 남긴다.

- [ ] **Step 6: 커밋** `feat: 홈을 오늘·내일·이번 주말 목록으로 바꾼다`

---

### Task 5: PRODUCT.md를 새 입장으로

**Files:**
- Modify: `PRODUCT.md`(Product Purpose 첫 단락, "무게는 오늘에" 단락 마지막 문장, Positioning 전체, 원칙 "선별은 유지하되…")

바꿀 내용(문장은 다듬어도 되고 입장은 바꾸지 않는다):
- Purpose: "추천은 이번 주에 갈 만한 것을 12개로 추리고" → 홈은 오늘·내일·이번 주말에 갈 수 있는 행사를 다 보여주고 지역·내 주변·목적으로 좁힌다. 탐색은 8주와 장소 전체.
- "무게는 오늘에" 단락의 "홈의 이번 주 12개 구성은 아직 그대로이고…" 문장을 지운다.
- Positioning: "망라 자체는 여전히 팔지 않습니다" 단락을 지운다. 새 입장: 그날 갈 수 있는 것은 다 보여준다. 줄이는 건 필터와 순서(곧 끝나는 것 먼저)가 하고, 추천 선반 3개는 출발점을 건넨다. 장소는 행사에서 이어 들를 곳으로 쓴다(연계는 별도 설계).
- 원칙 "선별은 유지하되 자리를 남은 것으로 채우지 않는다"를 지우고 대신: "**다 보여주고, 좁히는 손잡이를 준다.** 목록을 잘라 결정을 대신하지 않는다. 대신 맨 위에는 곧 끝나는 것이 오고, 목적·지역·거리로 한 번에 좁힐 수 있어야 한다."

- [ ] **Step 1: 고친다**
- [ ] **Step 2: `grep -n "12개\|12칸\|망라" PRODUCT.md`가 비었는지 확인**
- [ ] **Step 3: 커밋** `docs: PRODUCT.md를 오늘 중심 홈에 맞춘다`
