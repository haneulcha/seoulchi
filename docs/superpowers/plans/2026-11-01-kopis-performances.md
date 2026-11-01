# KOPIS 공연 소스와 위치 기반 추천 선반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KOPIS 공연을 세 번째 소스로 붙이고, 홈 추천 선반을 주간 큐레이션에서 위치·가격·신선도 규칙으로 바꾼다.

**Architecture:** KOPIS는 기존 `EventSource`(fetchList → hydrate → normalize)로 들어온다. XML 응답은 한 파싱 경계(`kopis-api.ts`)를 지나고, 상세·시설은 커밋되는 캐시(`data/cache/kopis.json`)로 증분 수집한다. 선반은 브라우저가 카탈로그 인덱스에서 고르고(`src/lib/shelf.ts`), 프리렌더는 위치 없는 결과를 굽는다. 큐레이션·LLM 단계는 읽는 곳이 없어지므로 지운다.

**Tech Stack:** TypeScript, zod, vitest, TanStack Start(SSG), GitHub Actions. XML 파서 의존성은 추가하지 않는다.

**Spec:** `docs/superpowers/specs/2026-11-01-kopis-performances-design.md`

## Global Constraints

- KOPIS 키는 `KOPIS_API_KEY` 환경 변수로만 읽는다. 키 값을 저장소의 어떤 파일에도 쓰지 않는다(`.env.local`은 gitignore됨).
- Base URL `https://kopis.or.kr/openApi/restful/`, 키 파라미터 이름 `service`, `signgucode=11`.
- 조회 기간 ≤ 31일, `rows` ≤ 100. 요청 날짜 `YYYYMMDD`, 응답 날짜 `YYYY.MM.DD`.
- 모든 KOPIS 호출은 순차이고, 호출 사이 간격은 상수 `KOPIS_INTERVAL_MS = 3000` 하나다.
- 결과 코드: `returncode`가 있으면 오류. `04`만 빈 결과. XML이 아닌 응답은 차단(`KopisBlockedError`).
- 목록 호출의 오류·차단 → 배치 실패. 상세·시설 단건 차단 → 경고 후 단건 호출 중단. 정규화된 KOPIS 공연 0건 → 배치 실패.
- 상세가 없는 공연은 산출에서 뺀다.
- id `kp-{mt20id}`, source `'kopis'`. 병합 우선순위는 서울시 → 비짓서울 → KOPIS(앞이 id 생존).
- 선반 점수 단위는 km. 가격 미상은 중립. 목록에서 공연은 다른 행사와 똑같이 보인다(가격 필터·강조 없음).
- 새 화면 요소·색을 만들지 않는다. 카드·행은 `src/components/cards.tsx`의 기존 것을 쓴다.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings (스펙 9장 "계획에서 정할 것")

- **중복 판정.** 정확 키가 안 맞으면 행사끼리 `기간 겹침 && 두 좌표 0.5km 이내 && 정규화 제목 포함 관계(짧은 쪽 4자 이상)`면 같은 행사. 백엔드 이관 문서 6장의 blocking(기간 겹침 + 500m)과 같은 축이다. 소스를 모르는 `findMatch` 한 함수로 둔다.
- **큐레이션 단계는 지운다**(Task 9). 선반이 더 이상 읽지 않고, 남기면 매일 배치가 아무도 안 보는 파일을 만든다. 주간 events 파일과 `weekKey`는 남긴다(과거 컷오프·meta가 쓴다).
- **위치 없을 때 생활권 3개.** 생활권마다 최고점 1장을 고르고, 그 5장을 점수순으로 세워 앞 3장. 동점은 생활권 표 순서.
- **가산점 초깃값.** 무료 1.5km, 2만 원 이하 1km, `localVenue` 0.5km, 신선도 1km. 무료와 2만 원 이하는 겹치지 않는다(무료가 이긴다).
- **신선도 기준.** 시작일이 오늘 ±3일 안이거나, 오픈런이 아니고 종료일이 오늘+3일 안. 상수 `FRESH_DAYS = 3`.
- **포스터 https.** 실측(2026-11-01): `https://www.kopis.or.kr/upload/…`는 301로 `https://kopis.or.kr/upload/…`에 가고 거기서 200 image/gif. 정규화에서 `http://www.kopis.or.kr/` 접두사를 `https://kopis.or.kr/`로 바꾼다.
- **시설 목록 엔드포인트는 쓰지 않는다.** 실측상 시설 상세(`prfplc/{mt10id}`)에 `fcltychartr`·`adres`·`la`·`lo`가 다 있다. 구는 `districtFromAddress(adres)`로 뽑는다. 필요한 시설만 1건씩 받는다(오늘 공연 297건의 시설은 227곳).
- **`minPrice`는 인덱스 투영에서 파생한다.** 스펙은 공통 스키마 필드로 적었지만, `district`처럼 `buildCatalogIndex`에서 `isFree ? 0 : parseMinPrice(fee)`로 만들면 소스 코드를 건드리지 않고 같은 값이 인덱스에 실린다. `localVenue`와 `openRun`은 KOPIS 시설·목록에만 있는 정보라 `EventItem` 선택 필드로 둔다(`openRun`은 신선도 규칙 때문에 추가).
- **KOPIS 캐시는 소스가 직접 들고 있다.** `DetailCache`는 비짓서울 모양이라 섞지 않는다. `hydrate`의 `cache` 인자는 무시하고, 생성자로 받은 `KopisCache`를 제자리에서 갱신한다. 저장은 `run-batch.ts`가 한다.
- **`lastRun`은 차단 없이 끝난 실행에서만 오늘로 옮긴다.** 막힌 실행이 옮기면 그날 `afterdate`로 잡힌 변경분을 다음 실행이 놓친다.

## Review Focus

1. **차단이 초기 적재 도중 걸린다.** 이미 받은 상세는 캐시에 남고, 다음 실행이 남은 것만 이어 받아야 한다 → Task 4 테스트 `차단되면 단건 호출을 멈추고 받은 것은 캐시에 남긴다`.
2. **두 31일 창에 걸친 공연이 두 번 나온다.** `mt20id`로 한 번만 → Task 4 테스트 `창 두 개에 걸친 공연은 한 번만`.
3. **같은 장소의 공연 여러 편이 선반을 채운다**(대학로 소극장 한 곳의 3편) → Task 7 테스트 `같은 장소는 1장`.
4. **좌표 없는 공연(시설 상세 실패)이 위치 선반 맨 앞에 온다.** 좌표 없는 항목은 위치 모드에서 좌표 있는 항목 뒤 → Task 7 테스트 `좌표 없는 행사는 뒤로`.
5. **제목이 짧은 서로 다른 행사가 합쳐진다**("콘서트" 같은 제목이 다른 제목에 포함) → Task 5 테스트 `짧은 제목은 포함 관계로 합치지 않는다`.

---

### Task 1: 러너 스파이크와 실측 기록

GitHub Actions 러너 IP에서 KOPIS가 열리는지 확인한다. **이 태스크는 사람이 필요하다**: 사용자가 저장소 시크릿 `KOPIS_API_KEY`를 등록하고, 스파이크 브랜치 push를 승인해야 한다. 막히면(HTTP 400 HTML 또는 연결 실패) 여기서 멈추고 스펙 4장으로 돌아간다.

**Files:**
- Create (임시): `.github/workflows/kopis-spike.yml`
- Modify: `docs/api-findings.md` (KOPIS 절 추가)

- [ ] **Step 1: 사용자에게 시크릿 등록을 요청한다.** `KOPIS_API_KEY` 시크릿이 등록됐다는 답을 받은 뒤 진행한다.
- [ ] **Step 2: 스파이크 워크플로를 쓴다.** `on: push: branches: [spike/kopis-runner]`, `ubuntu-latest`. 스텝 하나에서 `curl -s -w '\nHTTP %{http_code}\n'`로 목록 1회(`pblprfr?service=$KEY&stdate=<오늘>&eddate=<오늘>&cpage=1&rows=5&signgucode=11`), 3초 쉬고 상세 3회(목록에서 나온 mt20id), 3초 쉬고 시설 상세 1회를 부르고 각 응답 앞 300자를 찍는다. 키는 `env: KEY: ${{ secrets.KOPIS_API_KEY }}`로만 넘긴다.
- [ ] **Step 3: `spike/kopis-runner` 브랜치로 push하고 결과를 본다.** `gh run watch` 후 `gh run view --log`. 기대: 5개 응답 모두 `HTTP 200`이고 본문이 `<?xml`로 시작한다.
- [ ] **Step 4: 원격 스파이크 브랜치를 지운다**(`git push origin --delete spike/kopis-runner`). 워크플로 파일은 이 브랜치에 커밋하지 않는다.
- [ ] **Step 5: `docs/api-findings.md`에 `## KOPIS (공연예술통합전산망)` 절을 쓴다.** 스펙 3장의 실측(엔드포인트 표, 결과 코드, 호출 제한, 규모, 가격, 시설 유형) + 이 계획 Rulings의 두 실측(포스터 https 리다이렉트, 시설 상세 필드) + Step 3 결과(날짜와 러너에서 통했는지). 시설 유형 분포는 시설 1,784곳 기준 `민간(대학로 외) 881 / 기타(비공연장) 520 / 민간(대학로) 218 / 공공(기타) 121 / 공공(문예회관) 30 / 국립 14`, 장르 문자열은 `연극 뮤지컬 대중음악 서양음악(클래식) 한국음악(국악) 복합 무용(서양/한국무용) 서커스/마술`.
- [ ] **Step 6: Commit** — `docs: KOPIS 실측과 러너 스파이크 결과 기록`

### Task 2: KOPIS 응답 파싱 경계

**Files:**
- Create: `src/sources/kopis-api.ts`
- Test: `tests/sources/kopis-api.test.ts`
- Fixtures (이미 커밋됨): `tests/fixtures/kopis/{list,detail,detail-free,detail-entities,venue,error-01,error-02,error-04}.xml`, `blocked.html`. 오류·차단 픽스처는 실측 형식을 손으로 옮긴 것이고 나머지는 실응답이다.

**Interfaces:**
- Produces:
  - `class KopisApiError extends Error { readonly code: string }`
  - `class KopisBlockedError extends Error`
  - `parseKopisResponse(status: number, body: string): string[]` — `<db>…</db>` 블록 원문 배열
  - `xmlField(block: string, tag: string): string | undefined` — 첫 `<tag>`의 텍스트. trim, 엔티티 해제, 빈 문자열은 undefined
  - `xmlFields(block: string, tag: string): string[]` — 모든 `<tag>` 텍스트
  - `interface KopisClient { get(path: string, params: Record<string, string | number>): Promise<string[]> }`
  - `createKopisClient(apiKey: string, opts?: { intervalMs?: number; fetchFn?: typeof fetch }): KopisClient`
  - `const KOPIS_INTERVAL_MS = 3000`

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```ts
const fx = (name: string) => readFileSync(`tests/fixtures/kopis/${name}`, 'utf8')

it('정상 목록은 db 블록 배열이다', () => {
  const blocks = parseKopisResponse(200, fx('list.xml'))
  expect(blocks).toHaveLength(3)
  expect(xmlField(blocks[0]!, 'mt20id')).toBe('PF304867')
})
it('04는 빈 결과다', () => expect(parseKopisResponse(200, fx('error-04.xml'))).toEqual([]))
it('01·02는 코드를 담아 던진다', () => {
  expect(() => parseKopisResponse(200, fx('error-02.xml'))).toThrow(KopisApiError)
  try { parseKopisResponse(200, fx('error-01.xml')) } catch (e) { expect((e as KopisApiError).code).toBe('01') }
})
it('XML이 아닌 응답은 차단이다', () => {
  expect(() => parseKopisResponse(400, fx('blocked.html'))).toThrow(KopisBlockedError)
  expect(() => parseKopisResponse(200, fx('blocked.html'))).toThrow(KopisBlockedError)
})
it('엔티티를 풀고 빈 값은 undefined다', () => {
  const [d] = parseKopisResponse(200, fx('detail.xml'))
  expect(xmlField(d!, 'entrpsnm')).toBeUndefined()   // 원문 '<entrpsnm> </entrpsnm>'
  expect(xmlFields(d!, 'relateurl')[0]).toMatch(/^https:\/\//)
  const [e] = parseKopisResponse(200, fx('detail-entities.xml'))
  expect(e).toContain('&amp;')
  expect(xmlFields(e!, 'relateurl')[0]).toContain('?p_marking=&p_new=')
})
it('클라이언트는 호출 사이에 간격을 두고 service·파라미터를 붙인다', async () => {
  const urls: string[] = []
  const fetchFn = (async (u: string) => { urls.push(u); return new Response(fx('list.xml')) }) as typeof fetch
  const c = createKopisClient('K', { intervalMs: 0, fetchFn })
  await c.get('pblprfr', { stdate: '20261101', rows: 100 })
  expect(urls[0]).toBe('https://kopis.or.kr/openApi/restful/pblprfr?service=K&stdate=20261101&rows=100')
})
```

- [ ] **Step 2: 실패를 확인한다.** `npx vitest run tests/sources/kopis-api.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 구현한다.** 정규식으로 `<db>` 블록을 자른다(`/<db>[\s\S]*?<\/db>/g`). `returncode`는 본문 어디든 있으면 본다. 차단 판정: 본문이 `<?xml`로 시작하지 않으면 `KopisBlockedError`(메시지에 HTTP 상태). 엔티티는 `&amp; &lt; &gt; &quot; &apos; &#NN;`만 푼다. 클라이언트는 첫 호출을 빼고 매 호출 전에 `intervalMs`만큼 쉰다. 네트워크 예외는 그대로 던진다.
- [ ] **Step 4: 통과를 확인한다.** 같은 명령 → PASS.
- [ ] **Step 5: Commit** — `feat: KOPIS 응답 파싱 경계`

### Task 3: 가격 파서와 스키마 확장

**Files:**
- Create: `src/lib/price.ts`, `tests/lib/price.test.ts`
- Modify: `src/types/item.ts`, `src/lib/category.ts`, `src/types/files.ts`, `src/pipeline/select-catalog.ts`(`buildCatalogIndex`)
- Test: `tests/types/item.test.ts`, `tests/lib/category.test.ts`, `tests/pipeline/select-catalog.test.ts`

**Interfaces:**
- Produces:
  - `parseMinPrice(fee: string | undefined): number | undefined`
  - `sourceNameSchema`에 `'kopis'`, id 정규식 `/^(sc|vs|kp)-[A-Za-z0-9_-]+$/`
  - `eventItemSchema`에 `openRun: z.boolean().optional()`, `localVenue: z.boolean().optional()`
  - 인덱스 event 항목에 `minPrice?: number`(정수 ≥ 0), `localVenue?: true`, `openRun?: true` — 거짓·미상은 생략

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```ts
// price.test.ts
expect(parseMinPrice('열매(심화) 70,000원, 잎새(초급) 50,000원, 새싹(입문) 30,000원')).toBe(30000)
expect(parseMinPrice('현장판매 15,000원, 사전예약 10,000원')).toBe(10000)
expect(parseMinPrice('전석무료')).toBe(0)
expect(parseMinPrice('청소년 무료, 일반 20,000원')).toBe(20000) // 금액이 있으면 금액이 이긴다
expect(parseMinPrice('3만원')).toBeUndefined()                 // 못 읽으면 중립
expect(parseMinPrice(undefined)).toBeUndefined()
// item.test.ts: 'kp-PF304841' id와 source 'kopis'가 통과, 'kx-1'은 실패
// category.test.ts: Task 1 Step 5의 장르 8종이 전부 '보러 가기'이고 isKnownCategory
// select-catalog.test.ts: buildCatalogIndex가
//   isFree true → minPrice 0, fee '전석 50,000원' → 50000, fee 없음 → minPrice 키 없음,
//   localVenue/openRun true → 그대로, false·undefined → 키 없음
```

- [ ] **Step 2: 실패를 확인한다.** `npx vitest run tests/lib/price.test.ts tests/types tests/lib/category.test.ts tests/pipeline/select-catalog.test.ts` → FAIL.
- [ ] **Step 3: 구현한다.** 금액 정규식은 `/(\d{1,3}(?:,\d{3})+|\d+)\s*원/g`. 금액이 없고 `무료`가 있으면 0. `GROUP_BY_RAW`에 장르 8종을 보러 가기(공연) 줄에 넣는다(`연극`은 이미 있다). 주석의 실측 건수는 건드리지 않는다.
- [ ] **Step 4: 통과 확인 + `npm run typecheck`.**
- [ ] **Step 5: Commit** — `feat: 최저가 파서와 KOPIS용 스키마 필드`

### Task 4: KopisSource

**Files:**
- Create: `src/sources/kopis.ts`, `tests/sources/kopis.test.ts`

**Interfaces:**
- Consumes: Task 2의 `KopisClient`, `xmlField`, `xmlFields`, `KopisBlockedError`. Task 3의 `parseMinPrice`, 스키마 필드. `districtFromAddress`(`~/lib/district`), `addDays`(`~/lib/dates`).
- Produces:

```ts
export interface KopisListRow { mt20id: string; prfnm: string; prfpdfrom: string; prfpdto: string; fcltynm: string; poster?: string; genrenm: string; openrun: boolean }
export interface KopisDetail extends KopisListRow { mt10id?: string; pcseguidance?: string; dtguidance?: string; relateurls: string[] }
export interface KopisVenue { adres?: string; lat?: number; lng?: number; fcltychartr?: string }
export interface KopisCache { lastRun?: string /* YYYYMMDD */; details: Record<string, KopisDetail>; venues: Record<string, KopisVenue> }
export interface KopisStats { listed: number; fetched: number; missing: number; blocked: boolean }
export function listWindows(today: string, horizonEnd: string): Array<{ stdate: string; eddate: string }>
export class KopisSource implements EventSource<KopisListRow, KopisDetail> {
  readonly name = 'kopis'
  stats: KopisStats
  constructor(client: KopisClient, cache: KopisCache, today: string, horizonEnd: string)
}
```

`horizonEnd`는 `selectCatalog`과 같은 값(`addDays(today, 8 * 7)`)을 run-batch가 넘긴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 가짜 `KopisClient`는 `(path, params) => string[]`를 표로 돌려주고 호출을 기록한다. 픽스처 블록은 `parseKopisResponse(200, fx(...))`로 만든다.

```ts
it('지평을 31일 이하 창으로 나눈다', () => {
  expect(listWindows('2026-11-01', '2026-12-27')).toEqual([
    { stdate: '20261101', eddate: '20261201' }, { stdate: '20261202', eddate: '20261227' }])
})
it('창 두 개에 걸친 공연은 한 번만', async () => { /* 두 창이 같은 블록을 돌려줘도 fetchList 결과 mt20id가 유일 */ })
it('쪽은 rows보다 적게 올 때까지 넘긴다', async () => { /* 100건 → 다음 쪽 호출, 3건 → 멈춤 */ })
it('목록 차단·오류는 던진다', async () => { /* client.get이 KopisBlockedError → fetchList reject */ })
it('캐시에 없는 상세와 afterdate 변경분만 부른다', async () => {
  /* cache.details에 A, B가 있고 lastRun '20261031'. 목록 [A,B,C], afterdate 목록 [B]
     → 상세 호출은 B, C뿐. afterdate 호출 params에 afterdate: '20261031' */
})
it('lastRun이 없으면 afterdate 호출을 하지 않는다', async () => {})
it('차단되면 단건 호출을 멈추고 받은 것은 캐시에 남긴다', async () => {
  /* 상세 C는 성공, D에서 KopisBlockedError → E는 호출 안 함.
     cache.details에 C 있음, 결과에서 D·E 빠짐, stats { blocked: true, missing: 2 }, lastRun 그대로 */
})
it('차단 없이 끝나면 lastRun을 오늘로 옮긴다', async () => {})
it('시설은 캐시에 없을 때만 부른다', async () => {})
it('정규화', () => {
  /* detail.xml + venue.xml →
     id 'kp-PF304841', source 'kopis', kind 'event', title, category '무용(서양/한국무용)',
     place '노들섬 (리허설스튜디오)', startDate '2026-10-31', endDate '2026-11-14',
     time '토요일 ~ 일요일(10:00,13:00)', fee 원문, isFree false,
     district '용산구', lat 37.5170464, lng 126.9602196, address '서울특별시 용산구 양녕로 445 (이촌동)',
     localVenue true (공공(기타)), openRun 없음,
     imageUrl 'https://kopis.or.kr/upload/pfmPoster/PF_PF304841_261029_140113.png',
     linkUrl = 첫 relateurl. 결과가 eventItemSchema를 통과 */
})
it('전석무료는 isFree', () => {})
it('정규화 결과가 0건이면 던진다', () => {})
```

- [ ] **Step 2: 실패를 확인한다.** `npx vitest run tests/sources/kopis.test.ts` → FAIL.
- [ ] **Step 3: 구현한다.**
  - `fetchList`: 창마다 `pblprfr`를 `{ stdate, eddate, cpage, rows: 100, signgucode: 11 }`로 부르고 `mt20id`로 모은다. 목록 블록은 zod 스키마(`mt20id`·`prfnm`·`fcltynm`·`genrenm` min(1), 날짜 `/^\d{4}\.\d{2}\.\d{2}$/`, `openrun` `Y|N`)로 검사해 필드가 바뀌면 던진다. `lastRun`이 있으면 같은 창으로 `afterdate: lastRun`을 붙여 한 번 더 돌고 변경 id 집합을 기억한다(차단·오류는 던진다). 상세 블록(`mt20id`·`prfnm` min(1), 날짜 형식)과 시설 블록도 같은 식으로 zod 검사한다 — 단건이 스키마를 어기면 그 한 건만 경고하고 뺀다.
  - `hydrate(rows, _cache)`: 대상 = 캐시에 없음 ∪ 변경 집합. `pblprfr/{id}`를 순서대로 부른다. `KopisBlockedError`면 `console.warn` 후 남은 단건(상세·시설) 호출을 멈춘다. 다른 오류는 그 한 건만 경고하고 넘어간다. 상세가 생기면 `mt10id`가 시설 캐시에 없을 때 `prfplc/{mt10id}`를 부른다. 상세 있는 행만 돌려준다. 끝에 `stats`를 채우고 stderr에 `[kopis] 목록 N / 상세 호출 N / 상세 없음 N / 차단 여부`를 찍는다. 차단이 없었으면 `lastRun = today`(YYYYMMDD).
  - `normalize(details)`: 위 테스트의 필드 매핑. 좌표는 0이나 NaN이면 비운다. `localVenue`는 `fcltychartr`가 `공공(문예회관)` 또는 `공공(기타)`일 때만 true. `openRun`은 `openrun === 'Y'`일 때만 true. 0건이면 `throw new Error('KOPIS 공연이 0건입니다 — 키 만료나 차단을 확인하세요')`.
- [ ] **Step 4: 통과 확인 + `npm run typecheck`.**
- [ ] **Step 5: Commit** — `feat: KOPIS 공연 소스`

### Task 5: 표기가 다른 같은 행사 병합

**Files:**
- Modify: `src/pipeline/merge.ts`
- Test: `tests/pipeline/merge.test.ts`

**Interfaces:**
- Produces: `findMatch(item: Item, known: Item[]): Item | undefined`(export, 테스트용). `mergeItems(groups: Item[][]): Item[]` 시그니처는 그대로.

- [ ] **Step 1: 실패하는 테스트를 쓴다.**

```ts
const sc = event({ id: 'sc-1', title: '숨비소리, 해녀들의 노래', place: '서초문화예술회관', lat: 37.4836, lng: 127.0327, startDate: '2026-10-30', endDate: '2026-11-02' })
const kp = event({ id: 'kp-PF1', source: 'kopis', title: '[서초문화재단] 2026 서울어텀페스타 선정작 [숨비소리, 해녀들의 노래]', place: '서초문화예술회관 (아트홀)', lat: 37.4837, lng: 127.0329, startDate: '2026-11-01', endDate: '2026-11-01', time: '토 19:30' })

it('제목 포함·기간 겹침·500m 이내면 같은 행사다 — 앞 그룹 id가 남고 빈 필드만 채운다', () => {
  const [m, ...rest] = mergeItems([[sc], [kp]])
  expect(rest).toHaveLength(0)
  expect(m!.id).toBe('sc-1')
  expect(m!.mergedFrom).toEqual(['kp-PF1'])
})
it('기간이 안 겹치면 다른 행사', () => {})
it('0.5km 넘게 떨어지면 다른 행사', () => {})
it('좌표가 한쪽이라도 없으면 포함 관계로 합치지 않는다', () => {})
it('짧은 제목은 포함 관계로 합치지 않는다', () => { /* '콘서트' vs '가을 콘서트' 같은 장소·기간 → 2건 */ })
it('기존 정확 키 병합은 그대로', () => {})
```

`event()`는 이 테스트 파일에 이미 있는 팩토리를 쓰고, 없으면 파일 안에 만든다.

- [ ] **Step 2: 실패를 확인한다.** `npx vitest run tests/pipeline/merge.test.ts` → 첫 테스트 FAIL.
- [ ] **Step 3: 구현한다.** `mergeItems`는 지금의 `byKey` 조회를 먼저 하고, 없으면 `findMatch(item, [...byKey.values()])`로 찾는다. 찾으면 그 항목의 키 자리에 `enrich(existing, item)`을 넣는다. 거리 계산은 `haversineKm`(`~/lib/geo`). `ponytail:` 주석으로 "행사 수 × 기존 수 선형 탐색, 소스가 늘어 느려지면 기간·격자로 blocking"을 남긴다. `enrich`는 바꾸지 않는다(`time`은 서울시 쪽이 기준이다).
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit** — `feat: 표기가 다른 같은 행사를 기간·거리·제목으로 병합`

### Task 6: 배치에 KOPIS 연결

**Files:**
- Modify: `scripts/run-batch.ts`, `src/pipeline/emit.ts`, `src/types/files.ts`(`metaSchema`), `.github/workflows/batch.yml`, `.env.example`
- Create: `data/cache/kopis.json` (`{ "details": {}, "venues": {} }`)
- Test: `tests/pipeline/emit.test.ts`

**Interfaces:**
- Consumes: Task 4의 `KopisSource`, `KopisCache`, `KopisStats`, Task 2의 `createKopisClient`.
- Produces: `EmitPayload.kopis?: KopisStats`, `metaSchema.kopis` = `z.object({ listed, fetched, missing: z.number().int(), blocked: z.boolean() }).optional()`.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `emit.test.ts`에 `payload.kopis = { listed: 297, fetched: 3, missing: 0, blocked: false }`면 `meta.json`에 그대로 실리는 테스트.
- [ ] **Step 2: 실패 확인.** `npx vitest run tests/pipeline/emit.test.ts`.
- [ ] **Step 3: 구현한다.**
  - run-batch: `KOPIS_CACHE_PATH = 'data/cache/kopis.json'`을 기존 `loadCache`/`saveCache`로 읽고 쓴다(두 함수 타입을 제네릭으로 넓히거나 `unknown`으로 받는다 — 둘 중 짧은 쪽). KopisSource를 `sources` 배열 **맨 뒤**에 넣는다. 주기 저장·실패 시 저장·정상 종료 시 저장에 KOPIS 캐시를 함께 넣는다. `emit` 전에 `payload.kopis = kopis.stats`.
  - emit: `kopis`를 meta에 실는다.
  - batch.yml 배치 실행 env에 `KOPIS_API_KEY: ${{ secrets.KOPIS_API_KEY }}`. `.env.example`에 `KOPIS_API_KEY=` 한 줄.
- [ ] **Step 4: 통과 확인 + `npm test` + `npm run typecheck`.**
- [ ] **Step 5: Commit** — `feat: 배치에 KOPIS 소스 연결`

### Task 7: 선반 규칙

**Files:**
- Create: `src/lib/shelf.ts`, `tests/lib/shelf.test.ts`

**Interfaces:**
- Consumes: `CatalogEventIndexItem`(Task 3의 `minPrice`·`localVenue`·`openRun` 포함), `dayRange`(`~/lib/today`), `addDays`, `haversineKm`, `LatLng`.
- Produces:

```ts
export const SHELF_BONUS_KM = { free: 1.5, cheap: 1, local: 0.5, fresh: 1 } as const
export const CHEAP_MAX_WON = 20_000
export const FRESH_DAYS = 3
/** 서울 5개 생활권. 순서가 동점 순서다 */
export const ZONES: ReadonlyArray<{ name: string; districts: readonly string[] }>
export function shelfBonusKm(item: CatalogEventIndexItem, today: string): number
export function pickShelf(items: CatalogEventIndexItem[], today: string, origin?: LatLng, count?: number): CatalogEventIndexItem[]
```

`ZONES`의 자치구 이름은 `src/lib/district.ts`와 같은 `구` 붙은 이름이다(`'종로구', '중구', '용산구'` …). 생활권 표는 스펙 5장.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 오늘은 `'2026-11-04'`(수), 주말 끝 `'2026-11-08'`.

```ts
it('후보는 오늘~이번 주말에 하루라도 갈 수 있는 행사', () => { /* endDate 11-03, startDate 11-09 는 빠진다 */ })
it('가산점: 무료 1.5, 2만 원 이하 1, 동네 0.5, 신선도 1, 가격 미상 0', () => {
  expect(shelfBonusKm(ev({ minPrice: 0 }), today)).toBe(1.5)
  expect(shelfBonusKm(ev({ minPrice: 20000 }), today)).toBe(1)
  expect(shelfBonusKm(ev({ minPrice: 20001 }), today)).toBe(0)
  expect(shelfBonusKm(ev({}), today)).toBe(0)                       // 장기·가격 미상
  expect(shelfBonusKm(ev({ localVenue: true }), today)).toBe(0.5)
  expect(shelfBonusKm(ev({ startDate: '2026-11-01' }), today)).toBe(1) // 3일 전 시작
  expect(shelfBonusKm(ev({ endDate: '2026-11-07' }), today)).toBe(1)   // 3일 뒤 종료
  expect(shelfBonusKm(ev({ endDate: '2026-11-07', openRun: true }), today)).toBe(0)
})
// ev()의 기본값: startDate '2026-09-01', endDate '2026-12-31', 가격·장소 신호 없음
it('위치가 있으면 km - 가산점 순', () => { /* 1.0km 유료 vs 2.0km 무료 → 무료(0.5)가 앞 */ })
it('같은 장소는 1장', () => {})
it('좌표 없는 행사는 뒤로', () => {})
it('위치가 없으면 생활권당 1장, 점수순 앞 3개 생활권', () => {
  /* 5개 생활권에 하나씩 + 도심에 하나 더. 결과 3장의 생활권이 서로 다르고 점수 높은 순 */
})
it('위치가 없으면 자치구 없는 행사는 빠진다', () => {})
it('날짜가 바뀌면 결과가 바뀐다 — 같은 날은 같다', () => {
  /* 같은 입력으로 pickShelf 두 번 → toEqual. 11-04와 11-06에 다른 맨 앞 */
})
```

- [ ] **Step 2: 실패 확인.** `npx vitest run tests/lib/shelf.test.ts`.
- [ ] **Step 3: 구현한다.** 동점은 위치 모드에서 id, 위치 없는 모드에서 `endDate` 오름차순 다음 id. 같은 장소 판정은 `place` 문자열 일치.
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit** — `feat: 위치·가격·신선도 기반 추천 선반 규칙`

### Task 8: 홈에 규칙 선반 연결

**Files:**
- Modify: `src/routes/index.tsx`, `src/components/cards.tsx`(`EventPosterCard`), `src/lib/today.ts`(옛 `pickShelf` 삭제)
- Delete: `src/lib/home.ts`
- Test: `tests/lib/today.test.ts`(옛 `pickShelf` 테스트 삭제)

**Interfaces:**
- Consumes: Task 7의 `pickShelf`, `loadIndex`(`~/data/load`).
- Produces: `EventPosterCard({ item, today }: { item: CatalogEventIndexItem; today: string })`.

- [ ] **Step 1: 카드를 바꾼다.** `EventPosterCard`는 `item: CatalogEventIndexItem`을 받는다. `ItemImage`의 `category`는 `item.group`(BrowseEventRow와 같다). `reason` 줄과 그 주석을 지운다.
- [ ] **Step 2: 로더를 바꾼다.** `getHomeData`는 `loadIndex()`의 event 항목으로 `pickShelf(events, today)`(위치 없음)를 구워 `{ today, shelf }`를 돌려준다. `loadCurated`·`loadWeek`·`resolveCurated` import를 뺀다.
- [ ] **Step 3: 화면을 바꾼다.** 카탈로그가 ready면 `pickShelf(readyEvents, state.today, near && geo.status === 'ok' ? geo.origin : undefined)`, 아니면 `data.shelf`. 목록에서 선반 id를 빼는 지금 동작은 그대로.
- [ ] **Step 4: 옛 `pickShelf`와 `HomeEntry`를 지운다.** `grep -rn "HomeEntry\|pickShelf" src tests`가 shelf.ts·그 테스트·index.tsx만 남겨야 한다.
- [ ] **Step 5: 검증한다.** `npm test && npm run typecheck && npm run build`. 빌드된 홈 HTML(`grep -o '/e/[^"]*' .output/public/index.html | head`, 경로는 빌드 산출 위치에 맞춘다)에 선반 링크 3개가 있다.
- [ ] **Step 6: Commit** — `feat: 홈 추천 선반을 위치 기반 규칙으로 바꾼다`

### Task 9: 큐레이션·LLM 단계 삭제

읽는 곳이 없어진 코드를 지운다. 동작 변화가 없어야 한다.

**Files:**
- Delete: `src/pipeline/curate.ts`, `src/pipeline/score.ts`, `src/pipeline/pick-places.ts`, `src/llm/`, `src/data/resolve.ts`, 대응 테스트(`tests/pipeline/{curate,score,pick-places}.test.ts`, `tests/llm/`, `tests/data/resolve.test.ts`), `data/curated/`
- Modify: `src/pipeline/run.ts`(provider·curate·candidates·pickPlaces 제거, 주간 컷오프는 남긴다), `src/pipeline/emit.ts`(curated 파일·참조 검사 제거), `src/types/files.ts`(`curatedFileSchema` 제거, `metaSchema.llmProvider` 제거), `src/data/load.ts`(`loadCurated` 제거), `scripts/run-batch.ts`, `.github/workflows/batch.yml`(`LLM_PROVIDER` 제거), `vite.config.ts` 주석, `AGENTS.md`·`CLAUDE.md`의 해당 언급

- [ ] **Step 1: 지운다.** 먼저 `grep -rln "curate\|llm\|LLM_PROVIDER\|selectCandidates\|pickPlaces\|MAJOR_ORGS\|resolveCurated\|loadCurated\|curatedFileSchema" src scripts tests vite.config.ts .github AGENTS.md CLAUDE.md`로 목록을 만들고, 위 파일 목록과 다른 곳이 나오면 그 사용처가 정말 큐레이션 전용인지 확인한다.
- [ ] **Step 2: 검증한다.** `npm test && npm run typecheck && npm run build`가 통과하고, 같은 grep이 문서의 역사 서술(스펙·계획·docs/의 날짜 문서) 외에는 비어 있다. 기존 `data/meta.json`의 `llmProvider` 키는 zod가 버리므로 로드가 깨지지 않는다(`tests/data/load.test.ts` 통과로 확인).
- [ ] **Step 3: Commit** — `refactor: 읽는 곳이 없어진 주간 큐레이션·LLM 단계를 지운다`

### Task 10: 초기 적재와 화면 확인

**사람이 필요하다**: KOPIS 키가 `.env.local`에 있어야 한다(사용자가 넣거나, 넣어도 되는지 묻는다). 몇십 분 걸린다.

- [ ] **Step 1: 로컬 배치를 돌린다.** `npm run batch`. 차단으로 끝나면 몇 분 뒤 다시 돌린다 — 캐시가 이어 받는다. `stats.missing`이 0이 될 때까지.
- [ ] **Step 2: 캐시만 커밋한다.** `git add data/cache/kopis.json`, 나머지 `data/` 변경은 `git restore data/`. Commit — `chore: KOPIS 상세·시설 캐시 초기 적재`
- [ ] **Step 3: 화면을 본다.** 돌린 배치 산출로 `npm run dev`를 띄워(커밋 전 restore했다면 배치를 한 번 더 돌린 뒤 커밋하지 않고 본다) 홈을 위치 허용·거부 두 상태로 연다. 스펙 8장 실패 목록을 확인한다: 선반이 대학로만으로 차는지, 같은 공연이 두 번 나오는지, 목록이 공연으로 덮이는지. 본 것을 `docs/api-findings.md` KOPIS 절 끝에 몇 줄로 남기고, 가산점을 바꿨다면 그 근거도 적는다. Commit — `docs: KOPIS 연결 후 화면 확인`
