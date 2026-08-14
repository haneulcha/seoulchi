# 데이터 배치 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서울시 문화행사 API와 비짓서울 API에서 데이터를 수집·정규화·선별해 정적 JSON 파일로 커밋하는 배치 파이프라인을 만든다.

**Architecture:** `fetch → hydrate → normalize → merge → score → curate → emit` 7단계 파이프라인. 각 단계는 순수 함수이며 독립적으로 테스트된다. 소스별 지식은 어댑터의 `normalize`에만 존재하고, 이후 단계는 소스를 모른다. LLM은 어댑터 인터페이스 뒤에 감춰져 Ollama ↔ Anthropic ↔ 규칙만 사용을 환경변수로 전환한다.

**Tech Stack:** TypeScript, Node.js 20+, npm, tsx (실행), vitest (테스트), zod (스키마 검증), 네이티브 fetch

**Spec:** `docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md`

## Global Constraints

- Node.js 20 이상 (네이티브 `fetch` 사용, 외부 HTTP 라이브러리 금지)
- 패키지 매니저는 **npm** 고정
- 모든 날짜 계산은 **KST(UTC+9) 기준**. KST는 서머타임이 없으므로 고정 오프셋 +9시간이 정확하다
- 주차 키 형식은 **ISO 8601 주차, 월요일 시작**: `YYYY-Www` (예: `2026-W33`)
- 아이템 `id` 형식: `sc-{원본id}` (서울시 문화행사) / `vs-{cid}` (비짓서울). 콜론 금지 — 상세 라우트 `/e/[id]`에 인코딩 없이 들어가야 한다
- 소스 이름 리터럴: `'seoul-culture'` | `'visit-seoul'`
- **과거 컷오프: 오늘(KST) 이전에 끝난 행사는 출력에 넣지 않는다.** 두 소스 모두 아카이브를
  포함한다(서울시 19,486건 중 97.8%가 종료된 행사, 비짓서울에도 2023년 축제가 남아 있다).
  주간 파일이라고 해서 주 시작일을 기준으로 삼으면 **이번 주 월요일에 끝난 행사가 목요일 화면에 남는다.**
  따라서 **유효 시작일은 `max(주 시작일, 오늘)`**이다. `today`는 순수 함수에 인자로 넘긴다 —
  내부에서 `new Date()`를 부르면 테스트가 날짜에 따라 깨진다
- 지난 주차를 인자로 준 배치 실행(`npm run batch -- 2025-W20`)은 **의도적으로 지원하지 않는다.**
  과거 데이터를 쌓지 않기로 했다. 필요해지면 이 제약을 먼저 되돌린다
- 모든 배치 출력 JSON은 **쓰기 직전 zod 스키마로 검증**한다. 검증 실패 시 파일을 쓰지 않고 프로세스를 0이 아닌 코드로 종료한다
- API 키는 환경변수로만 읽는다. 코드·커밋에 절대 넣지 않는다: `SEOUL_API_KEY`, `VISITSEOUL_API_KEY`
- 커밋 메시지는 한국어 본문 + Conventional Commits 접두사(`feat:`, `test:`, `chore:`, `docs:`)

---

## File Structure

| 경로 | 책임 |
|---|---|
| `src/types/item.ts` | zod 스키마 + 추론 타입 (`EventItem`, `PlaceItem`, `Item`). 앱과 공유하는 단일 진실 |
| `src/lib/week.ts` | ISO 주차 계산, KST 변환, 주 범위, 주 라벨 |
| `src/lib/geo.ts` | Haversine 거리 (앱과 공유) |
| `src/sources/types.ts` | `EventSource`, `DetailCache` 인터페이스 |
| `src/sources/seoul-culture.ts` | 서울시 문화행사 어댑터 (fetch + normalize) |
| `src/sources/visit-seoul.ts` | 비짓서울 어댑터 (fetch + hydrate + normalize) |
| `src/lib/hours.ts` | `cmmn_use_time` / `closed_days` best-effort 파서 |
| `src/pipeline/merge.ts` | 두 소스 병합 + 중복 제거 |
| `src/pipeline/score.ts` | 규칙 기반 점수 → 후보 선정 |
| `src/pipeline/pick-places.ts` | "언제 가도 좋은 곳" 6개 결정론적 선정 |
| `src/llm/types.ts` | `LlmProvider`, `CurationCandidate`, `CurationPick` |
| `src/llm/rule-only.ts` | `RuleOnlyProvider` (폴백 + 테스트용) |
| `src/llm/ollama.ts` | `OllamaProvider` |
| `src/llm/index.ts` | 환경변수로 provider 선택 |
| `src/pipeline/curate.ts` | LLM 호출 + 환각 방어 2겹 + 폴백 |
| `src/pipeline/emit.ts` | JSON 파일 쓰기 + 검증 |
| `scripts/run-batch.ts` | 파이프라인 조립 CLI |
| `scripts/probe-apis.ts` | Task 0 실측 스파이크 |

---

## Task 0: 프로젝트 초기화 + API 실측 스파이크

스펙 14장의 미해결 항목 1~5, 7을 실측으로 해소한다. 이 태스크만 TDD가 아니라 **스파이크**다 — 산출물은 코드가 아니라 확인된 사실이다.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `scripts/probe-apis.ts`
- Create: `docs/api-findings.md`

**Interfaces:**
- Consumes: 없음
- Produces: `docs/api-findings.md` — 이후 모든 태스크가 여기 기록된 실제 필드명을 참조한다

- [ ] **Step 1: 프로젝트 초기화**

```bash
cd /Users/haneul/Study/seoulchi
npm init -y
npm i zod
npm i -D typescript tsx vitest @types/node
```

- [ ] **Step 2: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"],
    "paths": { "~/*": ["./src/*"] }
  },
  "include": ["src", "scripts", "tests"]
}
```

**`baseUrl`이 없는 이유**: TypeScript 7에서 제거됐다(`TS5102`). `paths`의 값을
`./`로 시작하는 상대 경로로 쓰면 `baseUrl` 없이 동작한다. `src/*`처럼 쓰면 `TS5090`으로 죽는다.

- [ ] **Step 3: `package.json`에 `type`과 스크립트 추가**

`package.json`의 최상위에 다음을 병합한다(기존 `name`/`version`은 유지):

```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "probe": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/probe-apis.ts",
    "batch": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/run-batch.ts"
  }
}
```

**`--env-file-if-exists`인 이유**: 로컬에서는 `.env`를 읽고, GitHub Actions에서는
`.env`가 없어도 조용히 넘어가 워크플로가 주입한 실제 환경변수를 쓴다.
`--env-file`(if-exists 없이)을 쓰면 Actions에서 `.env: not found`로 죽는다.
별도 dotenv 패키지는 필요 없다 — Node가 네이티브로 지원한다.

**`.env.local`도 읽는 이유**: 실제 키가 `.env.local`에 들어 있다. 둘 다 `if-exists`이므로
어느 쪽만 있어도 동작하고, 나중 플래그가 이기므로 `.env.local`이 `.env`를 덮어쓴다.
둘 다 `.gitignore`에 있다.

- [ ] **Step 4: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: { globals: true, environment: 'node' },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

- [x] **Step 5: `.gitignore`와 `.env.example` 작성** — 커밋 `bdb4b4f`에서 선반영 완료

실제 커밋된 `.gitignore`는 아래보다 넓다(`.env.local`, `.vinxi/`, `.tanstack/`, `.DS_Store` 포함).
커밋된 쪽을 쓴다. 아래는 최소 요건으로만 남긴다.

`.gitignore`:
```
node_modules/
.env
tmp/
dist/
.output/
```

`.env.example`:
```
SEOUL_API_KEY=
VISITSEOUL_API_KEY=
# Task 0의 카테고리 트리 조사 후 채운다 (쉼표 구분)
VISITSEOUL_CATEGORIES=
LLM_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

- [ ] **Step 6: 스파이크 스크립트 작성**

`scripts/probe-apis.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = 'tmp/probe'

async function dump(name: string, data: unknown) {
  await mkdir(OUT, { recursive: true })
  await writeFile(`${OUT}/${name}.json`, JSON.stringify(data, null, 2))
  console.log(`  → tmp/probe/${name}.json`)
}

async function probeSeoulCulture(key: string) {
  console.log('\n[서울시 문화행사]')
  const url = `http://openapi.seoul.go.kr:8088/${key}/json/culturalEventInfo/1/5/`
  const res = await fetch(url)
  const json = (await res.json()) as any
  await dump('seoul-culture-sample', json)

  const body = json.culturalEventInfo
  if (!body) {
    console.log('  ✗ culturalEventInfo 없음. 응답 확인 필요:', Object.keys(json))
    return
  }
  console.log('  총 건수(list_total_count):', body.list_total_count)
  const first = body.row?.[0]
  if (first) {
    console.log('  필드 목록:', Object.keys(first).join(', '))
    console.log('  MAIN_IMG 존재:', 'MAIN_IMG' in first, '→', first.MAIN_IMG)
    console.log('  LAT:', first.LAT, ' LOT:', first.LOT, ' PLACE:', first.PLACE)
    console.log('  ↑ LAT/LOT 중 어느 쪽이 위도인지 반드시 확인할 것')
  }
}

async function probeVisitSeoul(key: string) {
  const headers = {
    'VISITSEOUL-API-KEY': key,
    Accept: 'application/json;charset=UTF-8',
    'Content-Type': 'application/json;charset=UTF-8',
  }
  const base = 'https://api-call.visitseoul.net/api/v1'

  console.log('\n[비짓서울 - 카테고리]')
  const cat = await (await fetch(`${base}/category/list`, { headers })).json()
  await dump('visitseoul-categories', cat)
  const cats = (cat as any).data ?? []
  console.log('  카테고리 수:', cats.length)
  for (const c of cats) {
    console.log(`    ${'  '.repeat((c.ctgry_level ?? 1) - 1)}${c.com_ctgry_sn}  ${c.ctgry_path}`)
  }

  console.log('\n[비짓서울 - 목록]')
  const list = await (
    await fetch(`${base}/contents/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lang_code_id: 'ko', page_no: 1 }),
    })
  ).json()
  await dump('visitseoul-list', list)
  console.log('  total_count:', (list as any).paging?.total_count)

  const cid = (list as any).data?.[0]?.cid
  if (cid) {
    console.log('\n[비짓서울 - 상세]', cid)
    const info = await (await fetch(`${base}/contents/info?cid=${cid}`, { headers })).json()
    await dump('visitseoul-info', info)
    const d = (info as any).data ?? info
    console.log('  최상위 필드:', Object.keys(d).join(', '))
    console.log('  schdul_info_bgnde:', d.schdul_info_bgnde, '~', d.schdul_info_endde)
    console.log('  traffic:', JSON.stringify(d.traffic))
    console.log('  extra.cmmn_use_time:', d.extra?.cmmn_use_time)
    console.log('  extra.closed_days:', d.extra?.closed_days)
  }

  console.log('\n[비짓서울 - standard/list 존재 여부]')
  const std = await fetch(`${base}/contents/standard/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lang_code_id: 'ko', page_no: 1 }),
  })
  console.log('  status:', std.status)
  const stdJson = await std.json().catch(() => null)
  if (stdJson) {
    await dump('visitseoul-standard-list', stdJson)
    const row = (stdJson as any).data?.[0]
    if (row) console.log('  필드 목록:', Object.keys(row).join(', '))
  }
}

const seoulKey = process.env.SEOUL_API_KEY
const visitKey = process.env.VISITSEOUL_API_KEY

if (seoulKey) await probeSeoulCulture(seoulKey)
else console.log('SEOUL_API_KEY 없음 — 건너뜀')

if (visitKey) await probeVisitSeoul(visitKey)
else console.log('VISITSEOUL_API_KEY 없음 — 건너뜀')
```

- [ ] **Step 7: API 키 발급 후 스파이크 실행**

서울시: <https://data.seoul.go.kr> 로그인 → 인증키 신청 (무료·즉시)
비짓서울: <https://api.visitseoul.net> 에서 키 신청

`.env.example`을 `.env`로 복사하고 키를 채운다. `.env`는 `.gitignore`에 있으므로 커밋되지 않는다.

```bash
cp .env.example .env
# .env를 편집해 SEOUL_API_KEY / VISITSEOUL_API_KEY 채우기
npm run probe
```

- [ ] **Step 8: `docs/api-findings.md`에 결과 기록**

다음 항목에 **실측값**을 채운다. 추측 금지 — 확인 못 한 것은 "확인 실패"라고 적는다.

```markdown
# API 실측 결과 (YYYY-MM-DD)

## 서울시 문화행사 (culturalEventInfo)
- 총 건수: N
- 필드 목록: (그대로 붙여넣기)
- 이미지 필드: MAIN_IMG 존재 여부 / 샘플 URL
- **위도 필드: LAT 또는 LOT 중 어느 쪽인가** — 샘플 장소명과 좌표를 지도에서 대조해 확정
- 날짜 형식: STRTDATE / END_DATE 샘플값

## 비짓서울
- 카테고리 트리 전체 (레벨별)
- **수집 대상 카테고리 확정 목록**: com_ctgry_sn 배열
- 전체 콘텐츠 건수
- /contents/info 응답의 data 래핑 여부
- **/contents/standard/list 사용 가능 여부** — 가능하면 상세 필드 포함되는가

## 결론
- events/YYYY-Www.json 예상 크기:
- hydrate 초회 호출 수:
```

- [ ] **Step 9: 커밋**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example scripts/probe-apis.ts docs/api-findings.md
git commit -m "chore: 프로젝트 초기화 및 API 실측 스파이크

두 API의 실제 응답을 찍어 스펙의 미해결 항목을 해소.
결과는 docs/api-findings.md에 기록."
```

**게이트:** `docs/api-findings.md`의 "위도 필드" 항목이 확정되기 전에는 Task 3을 시작하지 않는다. 좌표가 뒤바뀌면 근처 화면이 조용히 망가진다.

---

## Task 1: 공통 타입 + zod 스키마

**Files:**
- Create: `src/types/item.ts`
- Test: `tests/types/item.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `itemSchema`, `eventItemSchema`, `placeItemSchema`, `parsedHoursSchema` (zod 스키마) / `Item`, `EventItem`, `PlaceItem`, `ParsedHours`, `SourceName` (타입)

zod를 단일 진실로 삼고 타입을 추론한다. 스키마와 타입을 따로 쓰면 반드시 어긋난다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/types/item.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { eventItemSchema, itemSchema, placeItemSchema } from '~/types/item'

const validEvent = {
  id: 'sc-12345',
  source: 'seoul-culture' as const,
  kind: 'event' as const,
  title: '서울시립미술관 특별전',
  category: '전시/미술',
  place: '서울시립미술관',
  startDate: '2026-08-10',
  endDate: '2026-08-16',
}

describe('eventItemSchema', () => {
  it('최소 필수 필드만으로 통과한다', () => {
    expect(eventItemSchema.parse(validEvent)).toMatchObject({ id: 'sc-12345' })
  })

  it('콜론이 들어간 id를 거부한다', () => {
    // 상세 라우트 /e/[id]에 인코딩 없이 들어가야 하므로
    expect(() => eventItemSchema.parse({ ...validEvent, id: 'seoul-culture:12345' })).toThrow()
  })

  it('sc- 또는 vs- 접두사가 없는 id를 거부한다', () => {
    expect(() => eventItemSchema.parse({ ...validEvent, id: '12345' })).toThrow()
  })

  it('날짜 형식이 YYYY-MM-DD가 아니면 거부한다', () => {
    expect(() => eventItemSchema.parse({ ...validEvent, startDate: '2026/08/10' })).toThrow()
  })
})

describe('placeItemSchema', () => {
  const validPlace = {
    id: 'vs-KOPsrn1p5',
    source: 'visit-seoul' as const,
    kind: 'place' as const,
    title: '서울역사박물관',
    category: '문화관광',
    place: '서울역사박물관',
  }

  it('hours가 null이어도 통과한다 (파싱 실패를 표현)', () => {
    expect(placeItemSchema.parse({ ...validPlace, hours: null }).hours).toBeNull()
  })

  it('startDate를 요구하지 않는다', () => {
    expect(() => placeItemSchema.parse(validPlace)).not.toThrow()
  })
})

describe('itemSchema (판별 유니온)', () => {
  it('kind로 분기한다', () => {
    const parsed = itemSchema.parse(validEvent)
    expect(parsed.kind).toBe('event')
  })

  it('알 수 없는 kind를 거부한다', () => {
    expect(() => itemSchema.parse({ ...validEvent, kind: 'venue' })).toThrow()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/types/item.test.ts`
Expected: FAIL — `Failed to resolve import "~/types/item"`

- [ ] **Step 3: 스키마 구현**

`src/types/item.ts`:

```ts
import { z } from 'zod'

export const sourceNameSchema = z.enum(['seoul-culture', 'visit-seoul'])

/** 상세 라우트 /e/[id]에 인코딩 없이 들어가야 하므로 URL-safe 문자만 허용 */
const idSchema = z.string().regex(/^(sc|vs)-[A-Za-z0-9_-]+$/, 'id는 sc- 또는 vs- 접두사와 URL-safe 문자만 허용')
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식')

export const baseItemSchema = z.object({
  id: idSchema,
  source: sourceNameSchema,
  title: z.string().min(1),
  summary: z.string().optional(),
  category: z.string(),
  district: z.string().optional(),
  place: z.string(),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  imageUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  isFree: z.boolean().optional(),
  fee: z.string().optional(),
  subwayInfo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** merge에서 흡수된 다른 소스의 id */
  mergedFrom: z.array(z.string()).optional(),
})

export const eventItemSchema = baseItemSchema.extend({
  kind: z.literal('event'),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
})

/** 0=일요일 ... 6=토요일 */
const weekdaySchema = z.number().int().min(0).max(6)

export const parsedHoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  closedWeekdays: z.array(weekdaySchema),
})

export const placeItemSchema = baseItemSchema.extend({
  kind: z.literal('place'),
  useTime: z.string().optional(),
  closedDays: z.string().optional(),
  /** null = 파싱 실패. 배지를 띄우지 않고 원문(useTime)을 그대로 보여준다 */
  hours: parsedHoursSchema.nullable().optional(),
})

export const itemSchema = z.discriminatedUnion('kind', [eventItemSchema, placeItemSchema])

export type SourceName = z.infer<typeof sourceNameSchema>
export type BaseItem = z.infer<typeof baseItemSchema>
export type EventItem = z.infer<typeof eventItemSchema>
export type PlaceItem = z.infer<typeof placeItemSchema>
export type ParsedHours = z.infer<typeof parsedHoursSchema>
export type Item = z.infer<typeof itemSchema>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/types/item.test.ts`
Expected: PASS (8개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/types/item.ts tests/types/item.test.ts
git commit -m "feat: Event/Place 공통 타입과 zod 스키마 추가

zod를 단일 진실로 삼고 타입을 추론한다.
id는 URL-safe 형식을 강제해 상세 라우트에서 인코딩이 불필요하게 한다."
```

---

## Task 2: ISO 주차 유틸 (KST)

**Files:**
- Create: `src/lib/week.ts`
- Test: `tests/lib/week.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `isoWeekKey(date: Date): string` — `'2026-W33'`
  - `weekRange(key: string): { start: string; end: string }` — KST 기준 월요일~일요일 `YYYY-MM-DD`
  - `weekLabel(key: string): string` — `'2026년 8월 둘째 주'`
  - `kstToday(now: Date): string` — KST 달력 기준 오늘 `YYYY-MM-DD`. 과거 컷오프의 기준값

배치와 앱이 **같은 유틸을 공유**한다. 어긋나면 앱이 존재하지 않는 파일을 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/week.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isoWeekKey, kstToday, weekLabel, weekRange } from '~/lib/week'

describe('isoWeekKey', () => {
  it('2026-08-13(목)은 2026-W33이다', () => {
    expect(isoWeekKey(new Date('2026-08-13T12:00:00+09:00'))).toBe('2026-W33')
  })

  it('같은 주의 월요일과 일요일이 같은 키를 낸다', () => {
    expect(isoWeekKey(new Date('2026-08-10T00:00:00+09:00'))).toBe('2026-W33')
    expect(isoWeekKey(new Date('2026-08-16T23:59:00+09:00'))).toBe('2026-W33')
  })

  it('KST 기준으로 계산한다 — UTC로는 전날인 시각', () => {
    // 2026-08-17T00:30+09:00 = 2026-08-16T15:30Z. KST로는 월요일이므로 W34.
    expect(isoWeekKey(new Date('2026-08-17T00:30:00+09:00'))).toBe('2026-W34')
  })

  it('연말 경계: 2026-01-01(목)은 2026-W01이다', () => {
    expect(isoWeekKey(new Date('2026-01-01T12:00:00+09:00'))).toBe('2026-W01')
  })

  it('연말 경계: 2025-12-29(월)은 2026-W01이다', () => {
    // ISO 주차는 목요일이 속한 해를 따른다
    expect(isoWeekKey(new Date('2025-12-29T12:00:00+09:00'))).toBe('2026-W01')
  })

  it('주차를 두 자리로 0 패딩한다', () => {
    expect(isoWeekKey(new Date('2026-03-05T12:00:00+09:00'))).toMatch(/^2026-W\d{2}$/)
  })
})

describe('weekRange', () => {
  it('2026-W33은 08-10(월)~08-16(일)이다', () => {
    expect(weekRange('2026-W33')).toEqual({ start: '2026-08-10', end: '2026-08-16' })
  })

  it('2026-W01은 2025-12-29~2026-01-04이다', () => {
    expect(weekRange('2026-W01')).toEqual({ start: '2025-12-29', end: '2026-01-04' })
  })

  it('잘못된 키 형식을 거부한다', () => {
    expect(() => weekRange('2026-33')).toThrow()
  })
})

describe('weekLabel', () => {
  it('그 주 목요일이 속한 달의 몇 번째 목요일인지로 센다', () => {
    // 2026년 8월의 목요일: 6, 13, 20, 27 → 8/13은 두 번째
    expect(weekLabel('2026-W33')).toBe('2026년 8월 둘째 주')
  })

  it('첫째 주를 올바르게 센다', () => {
    // 2026-W32의 목요일은 8/6 → 첫 번째
    expect(weekLabel('2026-W32')).toBe('2026년 8월 첫째 주')
  })
})

describe('kstToday', () => {
  it('KST 달력 날짜를 YYYY-MM-DD로 준다', () => {
    expect(kstToday(new Date('2026-08-13T12:00:00+09:00'))).toBe('2026-08-13')
  })

  it('UTC로는 전날인 이른 새벽도 KST 날짜로 준다', () => {
    // 2026-08-13T00:30+09:00 = 2026-08-12T15:30Z
    expect(kstToday(new Date('2026-08-13T00:30:00+09:00'))).toBe('2026-08-13')
  })

  it('UTC로는 다음날인 늦은 밤도 KST 날짜로 준다', () => {
    // 2026-08-13T23:30+09:00 = 2026-08-13T14:30Z — 여기선 UTC와 같은 날
    // 경계를 넘는 쪽: 2026-08-14T08:00+09:00 = 2026-08-13T23:00Z
    expect(kstToday(new Date('2026-08-14T08:00:00+09:00'))).toBe('2026-08-14')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/week.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/week"`

- [ ] **Step 3: 구현**

`src/lib/week.ts`:

```ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/

/**
 * 순간(Date)을 KST 달력 날짜로 옮긴다.
 * 반환된 Date의 UTC 필드를 읽으면 KST의 연/월/일이 나온다.
 * KST는 서머타임이 없으므로 고정 오프셋으로 정확하다.
 */
function toKstCalendarDate(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  )
}

/** 월=0 ... 일=6 (ISO 요일 인덱스) */
function isoDayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}

/** 그 날짜가 속한 ISO 주의 목요일 */
function thursdayOfWeek(d: Date): Date {
  const t = new Date(d)
  t.setUTCDate(t.getUTCDate() - isoDayIndex(d) + 3)
  return t
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function isoWeekKey(date: Date): string {
  const thursday = thursdayOfWeek(toKstCalendarDate(date))
  const isoYear = thursday.getUTCFullYear()

  // ISO 1주차는 1월 4일이 속한 주. 그 주의 목요일이 기준점.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const week1Thursday = thursdayOfWeek(jan4)

  // 목요일 간 차이는 정확히 7의 배수이므로 반올림이 안전하다
  const weekNo = Math.round((thursday.getTime() - week1Thursday.getTime()) / WEEK_MS) + 1
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`
}

function mondayOfWeekKey(key: string): Date {
  const m = WEEK_KEY_RE.exec(key)
  if (!m) throw new Error(`잘못된 주차 키: ${key} (형식: YYYY-Www)`)
  const isoYear = Number(m[1])
  const weekNo = Number(m[2])

  const week1Thursday = thursdayOfWeek(new Date(Date.UTC(isoYear, 0, 4)))
  const thursday = new Date(week1Thursday.getTime() + (weekNo - 1) * WEEK_MS)
  return new Date(thursday.getTime() - 3 * DAY_MS)
}

export function weekRange(key: string): { start: string; end: string } {
  const monday = mondayOfWeekKey(key)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  return { start: formatIsoDate(monday), end: formatIsoDate(sunday) }
}

const ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'] as const

/**
 * '2026년 8월 둘째 주'.
 * 기준은 그 주의 목요일 — ISO 주차가 목요일이 속한 해를 따르므로 일관된다.
 * 해당 월의 몇 번째 목요일인지로 순번을 매긴다.
 */
export function weekLabel(key: string): string {
  const thursday = new Date(mondayOfWeekKey(key).getTime() + 3 * DAY_MS)
  const year = thursday.getUTCFullYear()
  const month = thursday.getUTCMonth() + 1
  const nth = Math.ceil(thursday.getUTCDate() / 7)
  const ordinal = ORDINALS[nth - 1] ?? `${nth}번째`
  return `${year}년 ${month}월 ${ordinal} 주`
}

/**
 * KST 달력 기준 오늘. 과거 컷오프(`max(주 시작일, 오늘)`)의 기준값이다.
 * `now`를 인자로 받는 이유는 이 유틸을 쓰는 순수 함수들이
 * 실행 날짜에 따라 결과가 바뀌지 않게 하기 위해서다 — 호출 측이 한 번만 정한다.
 */
export function kstToday(now: Date): string {
  return formatIsoDate(toKstCalendarDate(now))
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/week.test.ts`
Expected: PASS (14개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/week.ts tests/lib/week.test.ts
git commit -m "feat: KST 기준 ISO 주차 유틸 추가

주차 키(YYYY-Www)는 배치가 쓰고 앱이 읽으므로 같은 유틸을 공유한다.
KST는 서머타임이 없어 고정 +9 오프셋으로 정확하다.
연말 경계(2025-12-29 → 2026-W01)를 테스트로 고정."
```

---

## Task 3: 소스 인터페이스 + Haversine

**Files:**
- Create: `src/sources/types.ts`
- Create: `src/lib/geo.ts`
- Test: `tests/lib/geo.test.ts`

**Interfaces:**
- Consumes: `Item` (Task 1)
- Produces:
  - `EventSource` 인터페이스, `DetailCache` 타입
  - `haversineKm(a: LatLng, b: LatLng): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/geo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { haversineKm } from '~/lib/geo'

const seoulCityHall = { lat: 37.5663, lng: 126.9779 }
const gangnamStation = { lat: 37.4979, lng: 127.0276 }

describe('haversineKm', () => {
  it('같은 지점은 0이다', () => {
    expect(haversineKm(seoulCityHall, seoulCityHall)).toBe(0)
  })

  it('시청~강남역은 약 8.8km다', () => {
    expect(haversineKm(seoulCityHall, gangnamStation)).toBeCloseTo(8.8, 0)
  })

  it('대칭이다', () => {
    expect(haversineKm(seoulCityHall, gangnamStation)).toBeCloseTo(
      haversineKm(gangnamStation, seoulCityHall),
      6,
    )
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/geo"`

- [ ] **Step 3: 구현**

`src/lib/geo.ts`:

```ts
export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number) => (deg * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}
```

`src/sources/types.ts`:

```ts
import type { Item } from '~/types/item'

/** 비짓서울 상세 응답 캐시. cid → { 마지막으로 본 updt_dt_text, 응답 } */
export type DetailCache = Record<string, { updtDtText: string; detail: unknown }>

export interface EventSource<TListItem = unknown, TItem = unknown> {
  readonly name: string

  /** 원본 목록 수집 */
  fetchList(): Promise<TListItem[]>

  /**
   * 상세가 필요한 소스만 구현. 필요 없으면 목록을 그대로 반환한다.
   * 캐시를 제자리에서 갱신한다 — 호출 측이 이후 저장한다.
   */
  hydrate(items: TListItem[], cache: DetailCache): Promise<TItem[]>

  /** 공통 스키마로 변환. 소스별 지식이 사는 유일한 곳. */
  normalize(items: TItem[]): Item[]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: PASS (3개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/geo.ts src/sources/types.ts tests/lib/geo.test.ts
git commit -m "feat: 소스 어댑터 인터페이스와 Haversine 거리 추가

hydrate는 상세가 필요한 소스만 구현하고 나머지는 통과시킨다."
```

---

## Task 4: 서울시 문화행사 어댑터

**게이트:** Task 0의 `docs/api-findings.md`에서 **위도 필드가 LAT인지 LOT인지 확정된 뒤**에 시작한다. 아래 코드는 `LAT=위도, LOT=경도`를 가정하며, 실측이 반대면 `normalize`의 두 줄을 바꾼다.

**Files:**
- Create: `src/sources/seoul-culture.ts`
- Test: `tests/sources/seoul-culture.test.ts`
- Test fixture: `tests/fixtures/seoul-culture-row.json` (Task 0의 `tmp/probe/seoul-culture-sample.json`에서 실제 row 1건 복사)

**Interfaces:**
- Consumes: `EventSource` (Task 3), `EventItem` (Task 1)
- Produces: `SeoulCultureSource` 클래스 — `new SeoulCultureSource(apiKey: string)`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sources/seoul-culture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SeoulCultureSource } from '~/sources/seoul-culture'
import { eventItemSchema } from '~/types/item'

const row = {
  CODENAME: '전시/미술',
  GUNAME: '중구',
  TITLE: '서울의 지하철',
  DATE: '2026-08-10~2026-09-30',
  PLACE: '서울역사박물관',
  ORG_NAME: '서울역사박물관',
  USE_TRGT: '전체관람가',
  USE_FEE: '무료',
  PLAYER: '',
  PROGRAM: '',
  ETC_DESC: '',
  ORG_LINK: 'https://museum.seoul.go.kr/example',
  MAIN_IMG: 'https://culture.seoul.go.kr/img/example.jpg',
  STRTDATE: '2026-08-10 00:00:00.0',
  END_DATE: '2026-09-30 00:00:00.0',
  LOT: '126.9706',
  LAT: '37.5705',
  IS_FREE: '무료',
  HMPG_ADDR: 'https://culture.seoul.go.kr/detail/12345',
}

const source = new SeoulCultureSource('test-key')

describe('SeoulCultureSource.normalize', () => {
  it('id에 sc- 접두사를 붙인다', () => {
    const [item] = source.normalize([row])
    expect(item!.id).toMatch(/^sc-/)
  })

  it('모든 항목이 kind=event다', () => {
    expect(source.normalize([row])[0]!.kind).toBe('event')
  })

  it('날짜를 YYYY-MM-DD로 자른다', () => {
    const [item] = source.normalize([row])
    expect(item).toMatchObject({ startDate: '2026-08-10', endDate: '2026-09-30' })
  })

  it('좌표를 숫자로 변환한다 — LAT=위도, LOT=경도', () => {
    const [item] = source.normalize([row])
    // 서울역사박물관은 위도 37.x, 경도 126.x. 뒤바뀌면 근처 화면이 조용히 망가진다.
    expect(item!.lat).toBeCloseTo(37.5705, 4)
    expect(item!.lng).toBeCloseTo(126.9706, 4)
  })

  it('IS_FREE로 무료 여부를 판정한다', () => {
    expect(source.normalize([row])[0]!.isFree).toBe(true)
    expect(source.normalize([{ ...row, IS_FREE: '유료' }])[0]!.isFree).toBe(false)
  })

  it('좌표가 비어 있으면 lat/lng를 생략한다 (0으로 채우지 않는다)', () => {
    const [item] = source.normalize([{ ...row, LAT: '', LOT: '' }])
    expect(item!.lat).toBeUndefined()
    expect(item!.lng).toBeUndefined()
  })

  it('날짜가 없는 행은 버린다', () => {
    expect(source.normalize([{ ...row, STRTDATE: '', END_DATE: '' }])).toHaveLength(0)
  })

  it('출력이 zod 스키마를 통과한다', () => {
    expect(() => eventItemSchema.parse(source.normalize([row])[0])).not.toThrow()
  })
})

describe('SeoulCultureSource.hydrate', () => {
  it('목록을 그대로 통과시킨다 (상세 호출 없음)', async () => {
    expect(await source.hydrate([row], {})).toEqual([row])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/sources/seoul-culture.test.ts`
Expected: FAIL — `Failed to resolve import "~/sources/seoul-culture"`

- [ ] **Step 3: 구현**

`src/sources/seoul-culture.ts`:

```ts
import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem, Item } from '~/types/item'

/** 서울열린데이터광장 문화행사 API의 원본 행. 필드는 docs/api-findings.md 참조. */
export interface SeoulCultureRow {
  CODENAME?: string
  GUNAME?: string
  TITLE?: string
  PLACE?: string
  ORG_NAME?: string
  USE_TRGT?: string
  USE_FEE?: string
  ORG_LINK?: string
  MAIN_IMG?: string
  STRTDATE?: string
  END_DATE?: string
  LOT?: string
  LAT?: string
  IS_FREE?: string
  HMPG_ADDR?: string
  [key: string]: unknown
}

const PAGE_SIZE = 1000
const BASE = 'http://openapi.seoul.go.kr:8088'

/** '2026-08-10 00:00:00.0' → '2026-08-10'. 파싱 불가면 null. */
function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** 빈 문자열·0·NaN은 좌표 없음으로 취급한다. 0으로 채우면 아프리카 앞바다에 찍힌다. */
function toCoord(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw.trim())
  return Number.isFinite(n) && n !== 0 ? n : undefined
}

export class SeoulCultureSource implements EventSource<SeoulCultureRow, SeoulCultureRow> {
  readonly name = 'seoul-culture'

  constructor(private readonly apiKey: string) {}

  async fetchList(): Promise<SeoulCultureRow[]> {
    const rows: SeoulCultureRow[] = []
    let start = 1

    for (;;) {
      const end = start + PAGE_SIZE - 1
      const url = `${BASE}/${this.apiKey}/json/culturalEventInfo/${start}/${end}/`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`서울시 문화행사 API ${res.status}: ${url.replace(this.apiKey, '***')}`)

      const json = (await res.json()) as {
        culturalEventInfo?: { list_total_count?: number; row?: SeoulCultureRow[] }
        RESULT?: { CODE?: string; MESSAGE?: string }
      }

      if (!json.culturalEventInfo) {
        throw new Error(`서울시 문화행사 API 응답 이상: ${json.RESULT?.CODE} ${json.RESULT?.MESSAGE}`)
      }

      const page = json.culturalEventInfo.row ?? []
      rows.push(...page)

      const total = json.culturalEventInfo.list_total_count ?? rows.length
      if (rows.length >= total || page.length === 0) break
      start += PAGE_SIZE
    }

    return rows
  }

  /** 이 소스는 목록에 모든 필드가 들어 있으므로 상세 호출이 없다. */
  async hydrate(items: SeoulCultureRow[], _cache: DetailCache): Promise<SeoulCultureRow[]> {
    return items
  }

  normalize(rows: SeoulCultureRow[]): Item[] {
    const items: EventItem[] = []

    for (const row of rows) {
      const startDate = toIsoDate(row.STRTDATE)
      const endDate = toIsoDate(row.END_DATE)
      const title = row.TITLE?.trim()

      // 기간이나 제목이 없으면 이 제품에서 쓸 수 없다
      if (!startDate || !endDate || !title) continue

      const sourceId = `${row.HMPG_ADDR ?? ''}|${title}|${startDate}`
      items.push({
        id: `sc-${hashId(sourceId)}`,
        source: 'seoul-culture',
        kind: 'event',
        title,
        category: row.CODENAME?.trim() || '기타',
        district: row.GUNAME?.trim() || undefined,
        place: row.PLACE?.trim() || '장소 미상',
        lat: toCoord(row.LAT),
        lng: toCoord(row.LOT),
        imageUrl: row.MAIN_IMG?.trim() || undefined,
        linkUrl: row.HMPG_ADDR?.trim() || row.ORG_LINK?.trim() || undefined,
        isFree: row.IS_FREE?.trim() === '무료',
        fee: row.USE_FEE?.trim() || undefined,
        startDate,
        endDate,
      })
    }

    return items
  }
}

/**
 * 이 API는 안정적인 기본키를 주지 않으므로 (링크|제목|시작일)로 결정론적 id를 만든다.
 * URL-safe 문자만 나오는 32비트 FNV-1a 해시.
 */
function hashId(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/sources/seoul-culture.test.ts`
Expected: PASS (10개 통과 — fixture 검증 1건 추가)

- [ ] **Step 5: 실제 응답으로 검증**

```bash
npx tsx --env-file-if-exists=.env -e "
import { SeoulCultureSource } from './src/sources/seoul-culture'
const s = new SeoulCultureSource(process.env.SEOUL_API_KEY!)
const rows = await s.fetchList()
const items = s.normalize(rows)
console.log('원본', rows.length, '→ 정규화', items.length)
console.log('좌표 있음:', items.filter(i => i.lat != null).length)
console.log('이미지 있음:', items.filter(i => i.imageUrl).length)
console.log(items[0])
"
```

좌표가 있는 항목의 `lat`이 33~39, `lng`가 124~132 범위인지 눈으로 확인한다. 벗어나면 LAT/LOT이 뒤바뀐 것이다.

- [ ] **Step 6: 커밋**

```bash
git add src/sources/seoul-culture.ts tests/sources/seoul-culture.test.ts
git commit -m "feat: 서울시 문화행사 소스 어댑터 추가

목록 한 번으로 전량을 받고 상세 호출이 없어 hydrate는 통과시킨다.
안정적 기본키가 없어 (링크|제목|시작일) FNV-1a 해시로 id를 만든다.
좌표가 비면 0으로 채우지 않고 생략한다."
```

---

## Task 5: 영업시간 파서 (best-effort)

**Files:**
- Create: `src/lib/hours.ts`
- Test: `tests/lib/hours.test.ts`

**Interfaces:**
- Consumes: `ParsedHours` (Task 1)
- Produces: `parseHours(useTime?: string, closedDays?: string): ParsedHours | null`

스펙 6장의 명시된 제약: 100% 파싱되지 않는다. **실패를 조용히 숨기지 않고 `null`을 반환**해 호출 측이 원문을 그대로 보여주게 한다.

**Task 6 실측 후 규칙 하나를 추가했다.** 파싱 실패 원문의 최빈 패턴이
`24시간` / `상시개방` 계열이었다(실패 116건 중 40건). `00:00~24:00`으로 읽는다 —
스키마도 새 필드도 건드리지 않고 "지금 열려 있나" 계산이 그대로 돈다.
성공률 **54% → 86%**.

`연중무휴`는 이 규칙에 넣지 않는다. 쉬는 날이 없다는 뜻이지 24시간이라는 뜻이 아니다
(`연중무휴 10:00~18:00`이 흔하다). 그건 `closedWeekdays` 쪽 관심사다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/hours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseHours } from '~/lib/hours'

describe('parseHours — 성공 케이스', () => {
  it('물결 구분 시간대를 읽는다', () => {
    expect(parseHours('10:00~18:00')).toEqual({
      open: '10:00',
      close: '18:00',
      closedWeekdays: [],
    })
  })

  it('하이픈 구분도 읽는다', () => {
    expect(parseHours('09:30 - 17:30')).toMatchObject({ open: '09:30', close: '17:30' })
  })

  it('한 자리 시각을 0 패딩한다', () => {
    expect(parseHours('9:00~18:00')).toMatchObject({ open: '09:00' })
  })

  it('useTime 안의 휴관 요일을 읽는다', () => {
    expect(parseHours('10:00~18:00, 매주 월요일 휴관')).toEqual({
      open: '10:00',
      close: '18:00',
      closedWeekdays: [1],
    })
  })

  it('closedDays 인자에서 휴관 요일을 읽는다', () => {
    expect(parseHours('10:00~18:00', '매주 화요일')).toMatchObject({ closedWeekdays: [2] })
  })

  it('여러 요일을 읽는다', () => {
    expect(parseHours('10:00~18:00', '월요일, 화요일 휴관')).toMatchObject({
      closedWeekdays: [1, 2],
    })
  })

  it('연중무휴는 휴무 없음으로 본다', () => {
    expect(parseHours('10:00~18:00', '연중무휴')).toMatchObject({ closedWeekdays: [] })
  })
})

describe('parseHours — 실패 시 null', () => {
  it('입력이 없으면 null', () => {
    expect(parseHours(undefined)).toBeNull()
    expect(parseHours('')).toBeNull()
  })

  it('시간대를 못 찾으면 null', () => {
    expect(parseHours('상시 개방')).toBeNull()
  })

  it('시각이 아닌 숫자 범위에 속지 않는다', () => {
    expect(parseHours('관람료 1000~2000원')).toBeNull()
  })

  it('불가능한 시각은 null', () => {
    expect(parseHours('25:00~30:00')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lib/hours.test.ts`
Expected: FAIL — `Failed to resolve import "~/lib/hours"`

- [ ] **Step 3: 구현**

`src/lib/hours.ts`:

```ts
import type { ParsedHours } from '~/types/item'

/** 일=0 ... 토=6 */
const WEEKDAY_INDEX: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
}

/** 'HH:MM ~ HH:MM'. 콜론을 요구해 '1000~2000원' 같은 숫자 범위를 걸러낸다. */
const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/

const CLOSED_WEEKDAY_RE = /([일월화수목금토])요일/g
const ALWAYS_OPEN_RE = /연중\s*무휴|상시\s*운영/

function pad(n: string): string {
  return n.padStart(2, '0')
}

function isValidTime(h: number, m: number): boolean {
  return h >= 0 && h <= 24 && m >= 0 && m <= 59
}

function extractClosedWeekdays(text: string): number[] {
  if (ALWAYS_OPEN_RE.test(text)) return []
  const found = new Set<number>()
  for (const m of text.matchAll(CLOSED_WEEKDAY_RE)) {
    const idx = WEEKDAY_INDEX[m[1]!]
    if (idx !== undefined) found.add(idx)
  }
  return [...found].sort((a, b) => a - b)
}

/**
 * 한국어 자유 텍스트에서 영업시간을 best-effort로 파싱한다.
 * 실패하면 null — 호출 측은 배지를 띄우지 않고 원문을 그대로 보여준다.
 * 조용히 틀린 값을 내는 것보다 모른다고 말하는 편이 낫다.
 */
export function parseHours(useTime?: string, closedDays?: string): ParsedHours | null {
  if (!useTime?.trim()) return null

  const m = TIME_RANGE_RE.exec(useTime)
  if (!m) return null

  const openH = Number(m[1])
  const openM = Number(m[2])
  const closeH = Number(m[3])
  const closeM = Number(m[4])
  if (!isValidTime(openH, openM) || !isValidTime(closeH, closeM)) return null

  return {
    open: `${pad(String(openH))}:${pad(String(openM))}`,
    close: `${pad(String(closeH))}:${pad(String(closeM))}`,
    closedWeekdays: extractClosedWeekdays(`${useTime} ${closedDays ?? ''}`),
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/hours.test.ts`
Expected: PASS (21개 통과 — 상시 개방 규칙 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/hours.ts tests/lib/hours.test.ts
git commit -m "feat: 영업시간 best-effort 파서 추가

파싱 실패 시 null을 반환해 호출 측이 원문을 그대로 보여주게 한다.
콜론을 요구해 '1000~2000원' 같은 숫자 범위에 속지 않는다."
```

---

## Task 6: 비짓서울 어댑터

**게이트 해소 (2026-08-13):** `/contents/standard/list`는 **404 — 존재하지 않는다**(`docs/api-findings.md`).
벌크 조회 우회로가 없으므로 아래의 캐시 기반 `hydrate`를 그대로 구현한다.

**Task 0 실측으로 아래 코드에서 바뀐 것 (전부 반영됨):**

| 항목 | 계획이 가정한 것 | 실측 |
|---|---|---|
| 상세 호출 | `GET /contents/info?cid=` | **`POST` + body `{cid, lang_code_id}`.** GET은 405, 쿼리스트링 POST는 400 |
| 목록 호출 | 항상 성공 | **`com_ctgry_sn` 필터가 약 30% 확률로 500.** 재시도 필요 |
| 상세 호출 간격 | 120ms면 충분 | **레이트 리밋이 500으로 위장돼 나온다.** 120ms에서 성공률 50%, 400ms에서 67%, 1000ms에서 100%. 재시도 필수 |
| 상세 실패 | 건너뛰면 됨 | **조용히 건너뛰면 데이터의 60%가 사라진다.** 재시도 후에도 실패한 비율이 높으면 배치를 깨뜨려야 한다 |
| `cate_depth` | `'문화관광 > 전시시설'` | **선행 공백이 있다** (`' 축제/공연/행사 > 축제'`). `trim()` 필수 |
| `extra.closed_days` | 항상 존재 | **행사 항목에는 없다.** 옵셔널 |
| `page_size` | 기본 50 | **200까지 지정 가능** — 초회 수집 요청 수를 1/4로 줄인다 |

**Files:**
- Create: `src/sources/visit-seoul.ts`
- Test: `tests/sources/visit-seoul.test.ts`

**Interfaces:**
- Consumes: `EventSource`, `DetailCache` (Task 3), `parseHours` (Task 5)
- Produces: `VisitSeoulSource` 클래스 — `new VisitSeoulSource(apiKey: string, categoryIds: string[])`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sources/visit-seoul.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { VisitSeoulSource } from '~/sources/visit-seoul'
import { itemSchema } from '~/types/item'
import type { DetailCache } from '~/sources/types'

const listItem = {
  cid: 'KOPsrn1p5',
  com_ctgry_sn: 'Cg1x6l1',
  main_img: 'https://example.com/a.jpg',
  post_sj: '서울의 지하철',
  sumry: '서울역사박물관 기획전시',
  updt_dt_text: '2026.08.01',
}

const detail = {
  cid: 'KOPsrn1p5',
  cate_depth: ' 문화관광 > 전시시설',
  main_img: 'https://example.com/a.jpg',
  post_sj: '서울의 지하철',
  sumry: '서울역사박물관 기획전시',
  schdul_info_bgnde: '2026.08.10',
  schdul_info_endde: '2026.09.30',
  tag: ['전시', '역사'],
  extra: {
    cmmn_hmpg_url: 'https://museum.seoul.go.kr',
    cmmn_use_time: '10:00~18:00, 매주 월요일 휴관',
    trrsrt_use_chrge: 'F',
    trrsrt_use_chrge_guidance: '무료',
    closed_days: '매주 월요일',
  },
  traffic: {
    new_adres: '서울특별시 종로구 새문안로 55',
    map_position_x: '126.9706',
    map_position_y: '37.5705',
    subway_info: '5호선 서대문역 4번 출구',
  },
}

const source = new VisitSeoulSource('test-key', ['Cg1x6l1'])

describe('VisitSeoulSource.normalize', () => {
  it('id에 vs- 접두사를 붙인다', () => {
    expect(source.normalize([detail])[0]!.id).toBe('vs-KOPsrn1p5')
  })

  it('행사 기간이 있으면 kind=event다', () => {
    const [item] = source.normalize([detail])
    expect(item!.kind).toBe('event')
    expect(item).toMatchObject({ startDate: '2026-08-10', endDate: '2026-09-30' })
  })

  it('행사 기간이 없으면 kind=place다', () => {
    const [item] = source.normalize([
      { ...detail, schdul_info_bgnde: '', schdul_info_endde: '' },
    ])
    expect(item!.kind).toBe('place')
  })

  it('점 구분 날짜를 ISO로 변환한다', () => {
    expect(source.normalize([detail])[0]).toMatchObject({ startDate: '2026-08-10' })
  })

  it('map_position_y를 위도, x를 경도로 읽는다', () => {
    const [item] = source.normalize([detail])
    expect(item!.lat).toBeCloseTo(37.5705, 4)
    expect(item!.lng).toBeCloseTo(126.9706, 4)
  })

  it('trrsrt_use_chrge가 F면 무료다', () => {
    expect(source.normalize([detail])[0]!.isFree).toBe(true)
    const paid = { ...detail, extra: { ...detail.extra, trrsrt_use_chrge: 'C' } }
    expect(source.normalize([paid])[0]!.isFree).toBe(false)
  })

  it('place에 파싱된 영업시간을 붙인다', () => {
    const placeDetail = { ...detail, schdul_info_bgnde: '', schdul_info_endde: '' }
    const [item] = source.normalize([placeDetail])
    expect(item).toMatchObject({ kind: 'place', hours: { open: '10:00', closedWeekdays: [1] } })
  })

  it('영업시간 파싱에 실패하면 hours가 null이고 원문이 남는다', () => {
    const placeDetail = {
      ...detail,
      schdul_info_bgnde: '',
      schdul_info_endde: '',
      extra: { ...detail.extra, cmmn_use_time: '상시 개방' },
    }
    const [item] = source.normalize([placeDetail]) as any
    expect(item.hours).toBeNull()
    expect(item.useTime).toBe('상시 개방')
  })

  it('cate_depth의 마지막 마디를 카테고리로 쓴다', () => {
    expect(source.normalize([detail])[0]!.category).toBe('전시시설')
  })

  it('지하철 정보를 담는다', () => {
    expect(source.normalize([detail])[0]!.subwayInfo).toBe('5호선 서대문역 4번 출구')
  })

  it('출력이 zod 스키마를 통과한다', () => {
    expect(() => itemSchema.parse(source.normalize([detail])[0])).not.toThrow()
  })
})

describe('VisitSeoulSource.hydrate', () => {
  it('updt_dt_text가 같으면 상세를 호출하지 않는다', async () => {
    const cache: DetailCache = {
      KOPsrn1p5: { updtDtText: '2026.08.01', detail },
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const out = await source.hydrate([listItem], cache)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(out).toEqual([detail])
    fetchSpy.mockRestore()
  })

  it('updt_dt_text가 바뀌면 상세를 호출하고 캐시를 갱신한다', async () => {
    const cache: DetailCache = {
      KOPsrn1p5: { updtDtText: '2026.07.01', detail: { stale: true } },
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: detail, result_code: 200 })))

    const out = await source.hydrate([listItem], cache)

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(out).toEqual([detail])
    expect(cache.KOPsrn1p5).toEqual({ updtDtText: '2026.08.01', detail })
    fetchSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/sources/visit-seoul.test.ts`
Expected: FAIL — `Failed to resolve import "~/sources/visit-seoul"`

- [ ] **Step 3: 구현**

`src/sources/visit-seoul.ts`:

```ts
import { parseHours } from '~/lib/hours'
import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem, Item, PlaceItem } from '~/types/item'

const BASE = 'https://api-call.visitseoul.net/api/v1'
/**
 * 상세 호출 간 간격(ms). 배려가 아니라 필수다 —
 * 비짓서울은 레이트 리밋을 500으로 위장해 돌려준다(Task 0 실측).
 * 120ms면 성공률 50%, 400ms면 67%, 1000ms면 100%. 재시도와 함께 쓴다.
 */
const DETAIL_DELAY_MS = 400
/** 재시도 후에도 실패한 상세가 이 비율을 넘으면 배치를 깨뜨린다. */
const MAX_DETAIL_FAILURE_RATIO = 0.1
/** 실측상 200까지 받는다. 초회 수집 요청 수를 기본값(50)의 1/4로 줄인다. */
const LIST_PAGE_SIZE = 200
/** 카테고리 필터 요청의 간헐적 500에 대한 재시도. */
const LIST_MAX_ATTEMPTS = 4
const RETRY_BASE_MS = 250

export interface VisitSeoulListItem {
  cid: string
  com_ctgry_sn?: string
  main_img?: string
  post_sj?: string
  sumry?: string
  updt_dt_text?: string
  [key: string]: unknown
}

export interface VisitSeoulDetail {
  cid: string
  cate_depth?: string | string[]
  main_img?: string
  post_sj?: string
  sumry?: string
  schdul_info_bgnde?: string
  schdul_info_endde?: string
  tag?: string[]
  extra?: {
    cmmn_hmpg_url?: string
    cmmn_use_time?: string
    trrsrt_use_chrge?: string
    trrsrt_use_chrge_guidance?: string
    closed_days?: string
    [key: string]: unknown
  }
  traffic?: {
    adres?: string
    new_adres?: string
    map_position_x?: string
    map_position_y?: string
    subway_info?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** '2026.08.10' 또는 '2026-08-10' → '2026-08-10'. 불가면 null. */
function toIsoDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(raw.trim())
  if (!m) return null
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
}

function toCoord(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw.trim())
  return Number.isFinite(n) && n !== 0 ? n : undefined
}

/** ' 문화관광 > 전시시설' → '전시시설' */
function lastCategorySegment(depth: string | string[] | undefined): string {
  const text = Array.isArray(depth) ? depth.join(' > ') : (depth ?? '')
  const parts = text.split('>').map((s) => s.trim()).filter(Boolean)
  return parts.at(-1) ?? '기타'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class VisitSeoulSource
  implements EventSource<VisitSeoulListItem, VisitSeoulDetail>
{
  readonly name = 'visit-seoul'

  constructor(
    private readonly apiKey: string,
    /** docs/api-findings.md에서 확정한 수집 대상 카테고리 */
    private readonly categoryIds: string[],
  ) {}

  private get headers() {
    return {
      'VISITSEOUL-API-KEY': this.apiKey,
      Accept: 'application/json;charset=UTF-8',
      'Content-Type': 'application/json;charset=UTF-8',
    }
  }

  async fetchList(): Promise<VisitSeoulListItem[]> {
    const seen = new Map<string, VisitSeoulListItem>()

    for (const categoryId of this.categoryIds) {
      for (let page = 1; ; page++) {
        // 카테고리 필터 요청은 약 30% 확률로 500을 낸다(서버 측 불안정, Task 0 실측).
        // 재시도 없이는 배치가 임의로 깨진다.
        const res = await this.postWithRetry(`${BASE}/contents/list`, {
          com_ctgry_sn: categoryId,
          lang_code_id: 'ko',
          page_no: page,
          page_size: LIST_PAGE_SIZE,
        })
        if (!res.ok) throw new Error(`비짓서울 목록 ${res.status} (카테고리 ${categoryId}, 재시도 후에도 실패)`)

        const json = (await res.json()) as {
          data?: VisitSeoulListItem[]
          paging?: { page_no: number; page_size: number; total_count: number }
        }
        const rows = json.data ?? []
        for (const row of rows) seen.set(row.cid, row)

        const paging = json.paging
        if (!paging || rows.length === 0) break
        if (paging.page_no * paging.page_size >= paging.total_count) break
      }
    }

    return [...seen.values()]
  }

  /** 500이 나면 선형 백오프로 재시도한다. 마지막 응답을 그대로 돌려준다. */
  private async postWithRetry(url: string, payload: unknown): Promise<Response> {
    let res!: Response
    for (let attempt = 1; attempt <= LIST_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await sleep(RETRY_BASE_MS * attempt)
      res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      })
      if (res.ok) return res
    }
    return res
  }

  /**
   * cid + updt_dt_text를 키로 상세 응답을 캐시한다.
   * 갱신되지 않은 항목은 상세 호출을 생략하므로 정상 상태에서 호출량이 0에 수렴한다.
   * cache는 제자리에서 갱신되며, 호출 측이 이후 파일로 저장한다.
   */
  async hydrate(
    items: VisitSeoulListItem[],
    cache: DetailCache,
  ): Promise<VisitSeoulDetail[]> {
    const out: VisitSeoulDetail[] = []
    let fetched = 0
    let failed = 0

    for (const item of items) {
      const updtDtText = item.updt_dt_text ?? ''
      const cached = cache[item.cid]

      if (cached && cached.updtDtText === updtDtText) {
        out.push(cached.detail as VisitSeoulDetail)
        continue
      }

      if (fetched > 0) await sleep(DETAIL_DELAY_MS)

      // GET은 405, 쿼리스트링 POST는 400. cid를 body에 실은 POST만 통한다(Task 0 실측).
      // 레이트 리밋이 500으로 오므로 목록과 같은 재시도를 태운다.
      const res = await this.postWithRetry(`${BASE}/contents/info`, {
        cid: item.cid,
        lang_code_id: 'ko',
      })
      fetched++

      if (!res.ok) {
        // 캐시된 구본이 있으면 쓰고, 없으면 이 항목은 사라진다 — 아래에서 비율을 따진다.
        console.warn(`비짓서울 상세 ${res.status}: ${item.cid} — 재시도 후에도 실패`)
        failed++
        if (cached) out.push(cached.detail as VisitSeoulDetail)
        continue
      }

      const json = (await res.json()) as { data?: VisitSeoulDetail } & VisitSeoulDetail
      const detail = json.data ?? json
      cache[item.cid] = { updtDtText, detail }
      out.push(detail)
    }

    console.log(`  [visit-seoul] 상세 호출 ${fetched}건 / 전체 ${items.length}건 / 실패 ${failed}건`)

    // 조용히 절반이 빈 채로 나가는 것보다 배치가 깨지는 게 낫다.
    if (fetched > 0 && failed / fetched > MAX_DETAIL_FAILURE_RATIO) {
      throw new Error(
        `비짓서울 상세 실패율이 너무 높습니다: ${failed}/${fetched}건. ` +
          `레이트 리밋일 가능성이 높으니 DETAIL_DELAY_MS를 올리세요.`,
      )
    }

    return out
  }

  normalize(details: VisitSeoulDetail[]): Item[] {
    const items: Item[] = []

    for (const d of details) {
      const title = d.post_sj?.trim()
      if (!title) continue

      const base = {
        id: `vs-${d.cid}`,
        source: 'visit-seoul' as const,
        title,
        summary: d.sumry?.trim() || undefined,
        category: lastCategorySegment(d.cate_depth),
        place: title,
        address: d.traffic?.new_adres?.trim() || d.traffic?.adres?.trim() || undefined,
        lat: toCoord(d.traffic?.map_position_y),
        lng: toCoord(d.traffic?.map_position_x),
        imageUrl: d.main_img?.trim() || undefined,
        linkUrl: d.extra?.cmmn_hmpg_url?.trim() || undefined,
        isFree: d.extra?.trrsrt_use_chrge?.trim().toUpperCase() === 'F',
        fee: d.extra?.trrsrt_use_chrge_guidance?.trim() || undefined,
        subwayInfo: d.traffic?.subway_info?.trim() || undefined,
        tags: d.tag?.length ? d.tag : undefined,
      }

      const startDate = toIsoDate(d.schdul_info_bgnde)
      const endDate = toIsoDate(d.schdul_info_endde)

      if (startDate && endDate) {
        const event: EventItem = { ...base, kind: 'event', startDate, endDate }
        items.push(event)
      } else {
        const useTime = d.extra?.cmmn_use_time?.trim() || undefined
        const closedDays = d.extra?.closed_days?.trim() || undefined
        const place: PlaceItem = {
          ...base,
          kind: 'place',
          useTime,
          closedDays,
          hours: parseHours(useTime, closedDays),
        }
        items.push(place)
      }
    }

    return items
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/sources/visit-seoul.test.ts`
Expected: PASS (19개 통과 — 실측으로 드러난 재시도·실패율 케이스 추가)

- [ ] **Step 5: 커밋**

```bash
git add src/sources/visit-seoul.ts tests/sources/visit-seoul.test.ts
git commit -m "feat: 비짓서울 소스 어댑터 추가

cid + updt_dt_text 캐시로 변경분만 상세를 호출한다.
행사 기간 유무로 event/place를 판정한다.
상세 한 건의 실패가 배치 전체를 멈추지 않게 한다."
```

---

## Task 7: merge — 두 소스 병합과 중복 제거

**Files:**
- Create: `src/pipeline/merge.ts`
- Test: `tests/pipeline/merge.test.ts`

**Interfaces:**
- Consumes: `Item` (Task 1)
- Produces: `mergeItems(groups: Item[][]): Item[]`

스펙 7장의 생존 id 규칙: 겹치면 **`sc-` 항목의 id를 남기고**, 흡수된 `vs-` id는 `mergedFrom[]`에 보존한다. 비짓서울의 `summary`/`imageUrl`/`subwayInfo`는 얹는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mergeItems } from '~/pipeline/merge'
import type { EventItem } from '~/types/item'

const scEvent: EventItem = {
  id: 'sc-abc123',
  source: 'seoul-culture',
  kind: 'event',
  title: '서울의 지하철',
  category: '전시/미술',
  place: '서울역사박물관',
  district: '종로구',
  startDate: '2026-08-10',
  endDate: '2026-09-30',
  isFree: true,
}

const vsEvent: EventItem = {
  id: 'vs-KOPsrn1p5',
  source: 'visit-seoul',
  kind: 'event',
  title: '서울의 지하철',
  category: '전시시설',
  place: '서울 역사 박물관',
  summary: '서울역사박물관 기획전시',
  imageUrl: 'https://example.com/a.jpg',
  subwayInfo: '5호선 서대문역 4번 출구',
  startDate: '2026-08-10',
  endDate: '2026-09-30',
}

describe('mergeItems', () => {
  it('겹치지 않으면 둘 다 남긴다', () => {
    const other = { ...vsEvent, id: 'vs-other', title: '완전히 다른 행사' }
    expect(mergeItems([[scEvent], [other]])).toHaveLength(2)
  })

  it('제목과 장소가 같으면 하나로 합친다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])).toHaveLength(1)
  })

  it('공백과 기호를 무시하고 장소를 비교한다', () => {
    // '서울역사박물관' vs '서울 역사 박물관'
    expect(mergeItems([[scEvent], [vsEvent]])).toHaveLength(1)
  })

  it('서울시 문화행사의 id를 남긴다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])[0]!.id).toBe('sc-abc123')
  })

  it('흡수된 id를 mergedFrom에 남긴다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])[0]!.mergedFrom).toEqual(['vs-KOPsrn1p5'])
  })

  it('비짓서울의 summary/imageUrl/subwayInfo를 얹는다', () => {
    const [merged] = mergeItems([[scEvent], [vsEvent]])
    expect(merged).toMatchObject({
      summary: '서울역사박물관 기획전시',
      imageUrl: 'https://example.com/a.jpg',
      subwayInfo: '5호선 서대문역 4번 출구',
    })
  })

  it('기준 항목에 이미 있는 값은 덮어쓰지 않는다', () => {
    const withImage = { ...scEvent, imageUrl: 'https://seoul.go.kr/own.jpg' }
    expect(mergeItems([[withImage], [vsEvent]])[0]!.imageUrl).toBe('https://seoul.go.kr/own.jpg')
  })

  it('기준 항목의 district를 유지한다', () => {
    expect(mergeItems([[scEvent], [vsEvent]])[0]!.district).toBe('종로구')
  })

  it('kind가 다르면 합치지 않는다', () => {
    const asPlace = { ...vsEvent, kind: 'place' as const, startDate: undefined, endDate: undefined }
    delete (asPlace as any).startDate
    delete (asPlace as any).endDate
    expect(mergeItems([[scEvent], [asPlace as any]])).toHaveLength(2)
  })

  it('비짓서울에만 있는 항목은 vs- id를 그대로 쓴다', () => {
    expect(mergeItems([[], [vsEvent]])[0]!.id).toBe('vs-KOPsrn1p5')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/merge.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/merge"`

- [ ] **Step 3: 구현**

`src/pipeline/merge.ts`:

```ts
import type { Item } from '~/types/item'

/** 비교용 정규화: 공백·기호 제거, 소문자화. '서울 역사 박물관' === '서울역사박물관' */
function normalizeForCompare(text: string): string {
  return text.replace(/[\s\-–—_()[\]<>「」『』"'·,.]/g, '').toLowerCase()
}

function dedupeKey(item: Item): string {
  return `${item.kind}|${normalizeForCompare(item.title)}|${normalizeForCompare(item.place)}`
}

/** 기준 항목에 비어 있는 값만 채운다. 이미 있는 값은 덮어쓰지 않는다. */
const ENRICHABLE = ['summary', 'imageUrl', 'subwayInfo', 'address', 'fee', 'linkUrl'] as const

function enrich(base: Item, other: Item): Item {
  const merged: Record<string, unknown> = { ...base }

  for (const key of ENRICHABLE) {
    if (merged[key] == null && other[key] != null) merged[key] = other[key]
  }
  if (merged.tags == null && other.tags?.length) merged.tags = other.tags

  const from = new Set<string>([...((base.mergedFrom ?? []) as string[]), ...(other.mergedFrom ?? [])])
  from.add(other.id)
  from.delete(base.id)
  merged.mergedFrom = [...from]

  return merged as Item
}

/**
 * 여러 소스의 아이템을 병합한다.
 * 인자 순서가 우선순위다 — 앞 그룹의 항목이 기준(id 생존)이 되고, 뒤 그룹은 필드를 얹는다.
 * 근거: 서울시 문화행사가 망라성을 담당하므로 그쪽 id가 안정적인 기준선이 된다.
 */
export function mergeItems(groups: Item[][]): Item[] {
  const byKey = new Map<string, Item>()

  for (const group of groups) {
    for (const item of group) {
      const key = dedupeKey(item)
      const existing = byKey.get(key)
      byKey.set(key, existing ? enrich(existing, item) : item)
    }
  }

  return [...byKey.values()]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/merge.test.ts`
Expected: PASS (12개 통과 — 순수성·그룹 내 중복 케이스 추가)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/merge.ts tests/pipeline/merge.test.ts
git commit -m "feat: 두 소스 병합과 중복 제거 추가

인자 순서가 우선순위. 서울시 문화행사가 기준이 되어 id를 남기고,
비짓서울은 비어 있는 필드만 채운다.
흡수된 id는 mergedFrom에 보존해 원본 추적이 가능하게 한다."
```

---

## Task 8: score — 규칙 기반 후보 선정

**Files:**
- Create: `src/pipeline/score.ts`
- Test: `tests/pipeline/score.test.ts`

**Interfaces:**
- Consumes: `Item`, `EventItem` (Task 1), `weekRange` (Task 2)
- Produces:
  - `MAJOR_ORGS: readonly string[]`
  - `scoreEvent(event: EventItem, weekKey: string): number`
  - `selectCandidates(items: Item[], weekKey: string, today: string, limit?: number): EventItem[]`

**과거 컷오프가 사는 곳이 여기다.** `today`(KST `YYYY-MM-DD`)를 받아 이미 끝난 행사를 뺀다.
자세한 근거는 Global Constraints의 "과거 컷오프" 항목 참조.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { scoreEvent, selectCandidates } from '~/pipeline/score'
import type { EventItem, PlaceItem } from '~/types/item'

// 2026-W33 = 2026-08-10(월) ~ 2026-08-16(일)
const WEEK = '2026-W33'

function evt(over: Partial<EventItem> = {}): EventItem {
  return {
    id: `sc-${Math.random().toString(36).slice(2)}`,
    source: 'seoul-culture',
    kind: 'event',
    title: '행사',
    category: '전시/미술',
    place: '어딘가',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    ...over,
  }
}

describe('scoreEvent', () => {
  it('이번 주에 시작하는 행사에 가점한다', () => {
    const startsThisWeek = evt({ startDate: '2026-08-12', endDate: '2026-08-20' })
    const startedLongAgo = evt({ startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(scoreEvent(startsThisWeek, WEEK)).toBeGreaterThan(scoreEvent(startedLongAgo, WEEK))
  })

  it('주말에 열리는 행사에 가점한다', () => {
    const weekend = evt({ startDate: '2026-08-15', endDate: '2026-08-16' })
    const weekdayOnly = evt({ startDate: '2026-08-11', endDate: '2026-08-12' })
    expect(scoreEvent(weekend, WEEK)).toBeGreaterThan(scoreEvent(weekdayOnly, WEEK))
  })

  it('무료 행사에 가점한다', () => {
    expect(scoreEvent(evt({ isFree: true }), WEEK)).toBeGreaterThan(
      scoreEvent(evt({ isFree: false }), WEEK),
    )
  })

  it('대형 기관에 가점한다', () => {
    expect(scoreEvent(evt({ place: '서울시립미술관' }), WEEK)).toBeGreaterThan(
      scoreEvent(evt({ place: '동네 주민센터' }), WEEK),
    )
  })

  it('이번 주에 끝나는 행사에 마감 임박 가점한다', () => {
    const endingSoon = evt({ startDate: '2026-01-01', endDate: '2026-08-14' })
    const endingLater = evt({ startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(scoreEvent(endingSoon, WEEK)).toBeGreaterThan(scoreEvent(endingLater, WEEK))
  })

  it('이미지가 있으면 가점한다', () => {
    expect(scoreEvent(evt({ imageUrl: 'https://x/a.jpg' }), WEEK)).toBeGreaterThan(
      scoreEvent(evt(), WEEK),
    )
  })
})

describe('selectCandidates', () => {
  // 주 시작일(월). 컷오프가 없을 때의 동작을 보는 기준값.
  const MONDAY = '2026-08-10'

  it('이번 주에 열리지 않는 행사를 제외한다', () => {
    const past = evt({ startDate: '2026-07-01', endDate: '2026-07-31' })
    const future = evt({ startDate: '2026-09-01', endDate: '2026-09-30' })
    const current = evt({ startDate: '2026-08-12', endDate: '2026-08-13' })
    const picked = selectCandidates([past, future, current], WEEK, MONDAY)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.startDate).toBe('2026-08-12')
  })

  it('주 경계에 걸친 행사를 포함한다', () => {
    const spanning = evt({ startDate: '2026-08-01', endDate: '2026-08-31' })
    expect(selectCandidates([spanning], WEEK, MONDAY)).toHaveLength(1)
  })

  it('오늘 이전에 끝난 행사를 뺀다 — 같은 주라도', () => {
    // 목요일에 돌린 배치. 화요일에 끝난 행사는 주에는 걸치지만 이미 지났다.
    const endedTuesday = evt({ startDate: '2026-08-10', endDate: '2026-08-11' })
    const stillRunning = evt({ startDate: '2026-08-10', endDate: '2026-08-16' })
    const picked = selectCandidates([endedTuesday, stillRunning], WEEK, '2026-08-13')
    expect(picked).toHaveLength(1)
    expect(picked[0]!.endDate).toBe('2026-08-16')
  })

  it('오늘 끝나는 행사는 남긴다', () => {
    const endsToday = evt({ startDate: '2026-08-10', endDate: '2026-08-13' })
    expect(selectCandidates([endsToday], WEEK, '2026-08-13')).toHaveLength(1)
  })

  it('지난 주차를 넘겨도 과거 행사가 새어나오지 않는다', () => {
    const lastWeek = evt({ startDate: '2026-08-03', endDate: '2026-08-09' })
    expect(selectCandidates([lastWeek], '2026-W32', '2026-08-13')).toHaveLength(0)
  })

  it('place는 후보에서 제외한다', () => {
    const place: PlaceItem = {
      id: 'vs-x',
      source: 'visit-seoul',
      kind: 'place',
      title: '박물관',
      category: '문화관광',
      place: '박물관',
    }
    expect(selectCandidates([place], WEEK, MONDAY)).toHaveLength(0)
  })

  it('limit 개수만큼만 반환한다', () => {
    const many = Array.from({ length: 100 }, () => evt())
    expect(selectCandidates(many, WEEK, MONDAY, 40)).toHaveLength(40)
  })

  it('점수 내림차순으로 정렬한다', () => {
    const low = evt({ title: '낮음', isFree: false })
    const high = evt({ title: '높음', isFree: true, imageUrl: 'https://x/a.jpg', place: '서울시립미술관' })
    expect(selectCandidates([low, high], WEEK, MONDAY)[0]!.title).toBe('높음')
  })

  it('점수가 같으면 제목 순으로 안정 정렬한다', () => {
    const a = evt({ title: '가나다' })
    const b = evt({ title: '나다라' })
    const first = selectCandidates([b, a], WEEK, MONDAY)
    expect(first.map((e) => e.title)).toEqual(['가나다', '나다라'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/score.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/score"`

- [ ] **Step 3: 구현**

`src/pipeline/score.ts`:

```ts
import { weekRange } from '~/lib/week'
import type { EventItem, Item } from '~/types/item'

/**
 * 대형·주요 기관 화이트리스트.
 * 구청 문화강좌와 시립미술관 특별전을 규칙만으로 구분할 수 없으므로,
 * 손으로 관리하는 목록으로 기준선을 만든다. 실제 데이터를 보며 늘려간다.
 */
export const MAJOR_ORGS: readonly string[] = [
  '서울시립미술관', '서울역사박물관', '국립중앙박물관', '국립현대미술관',
  '예술의전당', '세종문화회관', '국립극장', '아르코예술극장',
  '동대문디자인플라자', 'DDP', '북서울미술관', '남서울미술관',
  '서울공예박물관', '서울식물원', '한가람미술관', '블루스퀘어',
  '롯데콘서트홀', '국립국악원', '정동극장', '대학로예술극장',
]

const WEIGHTS = {
  startsThisWeek: 30,
  endsThisWeek: 20,
  weekend: 15,
  free: 10,
  majorOrg: 25,
  hasImage: 8,
  hasSummary: 5,
  hasCoords: 5,
} as const

function overlaps(event: EventItem, start: string, end: string): boolean {
  return event.startDate <= end && event.endDate >= start
}

/** 주말(토·일)에 열리는가 */
function includesWeekend(event: EventItem, weekStart: string): boolean {
  const saturday = addDays(weekStart, 5)
  const sunday = addDays(weekStart, 6)
  return (
    (event.startDate <= saturday && event.endDate >= saturday) ||
    (event.startDate <= sunday && event.endDate >= sunday)
  )
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function isMajorOrg(event: EventItem): boolean {
  const haystack = `${event.place} ${event.title}`
  return MAJOR_ORGS.some((org) => haystack.includes(org))
}

export function scoreEvent(event: EventItem, weekKey: string): number {
  const { start, end } = weekRange(weekKey)
  let score = 0

  if (event.startDate >= start && event.startDate <= end) score += WEIGHTS.startsThisWeek
  if (event.endDate >= start && event.endDate <= end) score += WEIGHTS.endsThisWeek
  if (includesWeekend(event, start)) score += WEIGHTS.weekend
  if (event.isFree) score += WEIGHTS.free
  if (isMajorOrg(event)) score += WEIGHTS.majorOrg
  if (event.imageUrl) score += WEIGHTS.hasImage
  if (event.summary) score += WEIGHTS.hasSummary
  if (event.lat != null && event.lng != null) score += WEIGHTS.hasCoords

  return score
}

/**
 * 이번 주에 열리는 event만 골라 점수순 상위 N개를 반환한다.
 * 점수가 같으면 제목 순으로 안정 정렬해 빌드 재현성을 지킨다.
 *
 * `today`(KST, YYYY-MM-DD)를 인자로 받아 **이미 끝난 행사를 뺀다.**
 * 주 시작일만 기준으로 삼으면 월요일에 끝난 행사가 목요일 화면에 남는다.
 * `today`를 내부에서 만들지 않는 이유는 테스트가 실행 날짜에 따라 깨지지 않게 하기 위해서다.
 */
export function selectCandidates(
  items: Item[],
  weekKey: string,
  today: string,
  limit = 40,
): EventItem[] {
  const { start, end } = weekRange(weekKey)
  // 유효 시작일 = max(주 시작일, 오늘). 지난 주차를 넘겨도 과거 행사가 새어나오지 않는다.
  const from = today > start ? today : start

  return items
    .filter((item): item is EventItem => item.kind === 'event' && overlaps(item, from, end))
    .map((event) => ({ event, score: scoreEvent(event, weekKey) }))
    .sort((a, b) => b.score - a.score || a.event.title.localeCompare(b.event.title, 'ko'))
    .slice(0, limit)
    .map(({ event }) => event)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/score.test.ts`
Expected: PASS (15개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/score.ts tests/pipeline/score.test.ts
git commit -m "feat: 규칙 기반 후보 선정 추가

이번 주 시작/마감 임박/주말/무료/대형 기관/이미지에 가중치를 준다.
동점은 제목 순으로 안정 정렬해 빌드 재현성을 지킨다."
```

---

## Task 9: LLM 어댑터 인터페이스 + RuleOnlyProvider

**Files:**
- Create: `src/llm/types.ts`
- Create: `src/llm/rule-only.ts`
- Test: `tests/llm/rule-only.test.ts`

**Interfaces:**
- Consumes: `EventItem` (Task 1)
- Produces:
  - `CurationCandidate`, `CurationPick`, `LlmProvider` (스펙 8장 확정 인터페이스)
  - `toCandidate(event: EventItem): CurationCandidate`
  - `RuleOnlyProvider` 클래스

스펙 8장의 결측값 처리: `district`는 `'미상'`, `isFree`는 `false`로 채운다. **항목을 버리지 않는다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/llm/rule-only.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RuleOnlyProvider } from '~/llm/rule-only'
import { toCandidate } from '~/llm/types'
import type { EventItem } from '~/types/item'

function evt(over: Partial<EventItem> = {}): EventItem {
  return {
    id: 'sc-a',
    source: 'seoul-culture',
    kind: 'event',
    title: '행사',
    category: '전시',
    place: '어딘가',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    ...over,
  }
}

describe('toCandidate', () => {
  it('district가 없으면 "미상"으로 채운다', () => {
    expect(toCandidate(evt({ district: undefined })).district).toBe('미상')
  })

  it('isFree가 없으면 false로 채운다', () => {
    expect(toCandidate(evt({ isFree: undefined })).isFree).toBe(false)
  })

  it('있는 값은 그대로 쓴다', () => {
    expect(toCandidate(evt({ district: '종로구', isFree: true }))).toMatchObject({
      district: '종로구',
      isFree: true,
    })
  })
})

describe('RuleOnlyProvider', () => {
  const provider = new RuleOnlyProvider()

  it('name이 rule이다', () => {
    expect(provider.name).toBe('rule')
  })

  it('앞에서부터 count개를 고른다 (후보는 이미 점수순)', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map((id) => toCandidate(evt({ id: `sc-${id}` })))
    const picks = await provider.curate({ candidates, count: 2, weekLabel: '테스트 주' })
    expect(picks.map((p) => p.id)).toEqual(['sc-a', 'sc-b'])
  })

  it('후보가 count보다 적으면 있는 만큼만 반환한다', async () => {
    const candidates = [toCandidate(evt())]
    expect(await provider.curate({ candidates, count: 12, weekLabel: 'x' })).toHaveLength(1)
  })

  it('reason은 빈 문자열이다 (규칙만으로는 코멘트를 쓸 수 없다)', async () => {
    const picks = await provider.curate({
      candidates: [toCandidate(evt())],
      count: 1,
      weekLabel: 'x',
    })
    expect(picks[0]!.reason).toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/llm/rule-only.test.ts`
Expected: FAIL — `Failed to resolve import "~/llm/rule-only"`

- [ ] **Step 3: 구현**

`src/llm/types.ts`:

```ts
import type { EventItem } from '~/types/item'

export interface CurationCandidate {
  id: string
  title: string
  category: string
  district: string
  place: string
  startDate: string
  endDate: string
  isFree: boolean
  target?: string
  org?: string
}

export interface CurationPick {
  /** 반드시 candidates 안의 id */
  id: string
  /** 한 줄 코멘트 (40자 내외). 규칙 폴백일 때는 빈 문자열. */
  reason: string
}

export interface LlmProvider {
  /** meta.json에 기록된다 */
  readonly name: string
  curate(input: {
    candidates: CurationCandidate[]
    count: number
    weekLabel: string
  }): Promise<CurationPick[]>
}

/**
 * EventItem → CurationCandidate.
 * 결측값은 항목을 버리지 않고 기본값으로 채운다 —
 * 자치구가 비었다는 이유로 좋은 행사를 후보에서 떨어뜨리면 선별 품질이 떨어진다.
 */
export function toCandidate(event: EventItem): CurationCandidate {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    district: event.district ?? '미상',
    place: event.place,
    startDate: event.startDate,
    endDate: event.endDate,
    isFree: event.isFree ?? false,
    org: event.place || undefined,
  }
}
```

`src/llm/rule-only.ts`:

```ts
import type { CurationPick, LlmProvider } from '~/llm/types'

/**
 * LLM 없이 후보 순서를 그대로 쓴다.
 * 후보는 selectCandidates에서 이미 점수순으로 정렬돼 있다.
 * 폴백 경로이자 테스트용이며, LLM_PROVIDER=rule로 직접 선택할 수도 있다.
 */
export class RuleOnlyProvider implements LlmProvider {
  readonly name = 'rule'

  async curate({
    candidates,
    count,
  }: {
    candidates: { id: string }[]
    count: number
    weekLabel: string
  }): Promise<CurationPick[]> {
    return candidates.slice(0, count).map((c) => ({ id: c.id, reason: '' }))
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/llm/rule-only.test.ts`
Expected: PASS (7개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/llm/types.ts src/llm/rule-only.ts tests/llm/rule-only.test.ts
git commit -m "feat: LLM 어댑터 인터페이스와 규칙 전용 provider 추가

결측값은 항목을 버리지 않고 기본값('미상', false)으로 채운다.
RuleOnlyProvider는 폴백 경로이자 테스트용이다."
```

---

## Task 10: OllamaProvider

**Files:**
- Create: `src/llm/ollama.ts`
- Create: `src/llm/index.ts`
- Test: `tests/llm/ollama.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`, `CurationCandidate`, `CurationPick` (Task 9)
- Produces:
  - `OllamaProvider` 클래스 — `new OllamaProvider(host?: string, model?: string)`
  - `createProvider(): LlmProvider` — 환경변수로 선택

**Task 9 이후 실측으로 정한 것 (qwen3:30b, 후보 12개 중 4개 선정 기준):**

| 설정 | 값 | 근거 |
|---|---|---|
| thinking | **켠다(기본값 유지)** | 끄면 2초로 빨라지지만 **40자 제약을 전부 어긴다**(50·60·54·44자). 켜면 32~54초에 최대 36자. 하루 한 번 도는 배치라 시간은 문제가 아니다 |
| `seed` | **42 고정** | 같은 seed로 2회 실행 시 선정 id와 코멘트가 **완전히 동일**했다. 출력이 `data/*.json`으로 커밋되므로, 데이터가 안 바뀐 날 diff가 생기면 "지난주엔 뭐가 있었지"를 git으로 보는 이점이 흐려진다 |
| `temperature` | 0.3 | 계획 그대로 |
| 기본 모델 | `qwen3:30b` | `.env.local`과 맞춘다 |

**`think: false`를 넣지 마라.** Ollama는 추론을 `message.thinking`으로 분리하므로
`message.content`는 어차피 깨끗한 JSON이다 — 끌 이유가 없고, 끄면 지시 준수가 무너진다.
길이 초과는 Task 11의 `MAX_REASON_LENGTH` 절단이 마지막으로 막는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/llm/ollama.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OllamaProvider } from '~/llm/ollama'
import { createProvider } from '~/llm/index'
import type { CurationCandidate } from '~/llm/types'

const candidates: CurationCandidate[] = [
  {
    id: 'sc-a', title: '전시 A', category: '전시', district: '종로구',
    place: '미술관', startDate: '2026-08-10', endDate: '2026-08-16', isFree: true,
  },
  {
    id: 'sc-b', title: '공연 B', category: '공연', district: '중구',
    place: '극장', startDate: '2026-08-12', endDate: '2026-08-14', isFree: false,
  },
]

function ollamaResponse(picks: unknown) {
  return new Response(
    JSON.stringify({ message: { content: JSON.stringify({ picks }) } }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('OllamaProvider', () => {
  const provider = new OllamaProvider('http://localhost:11434', 'test-model')

  it('name이 ollama다', () => {
    expect(provider.name).toBe('ollama')
  })

  it('응답의 picks를 파싱한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ollamaResponse([{ id: 'sc-a', reason: '무료 전시' }]),
    )
    const picks = await provider.curate({ candidates, count: 1, weekLabel: '테스트 주' })
    expect(picks).toEqual([{ id: 'sc-a', reason: '무료 전시' }])
  })

  it('JSON 스키마를 format으로 강제한다', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ollamaResponse([{ id: 'sc-a', reason: 'x' }]))

    await provider.curate({ candidates, count: 1, weekLabel: 'x' })

    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.format).toBeDefined()
    expect(body.stream).toBe(false)
    expect(body.model).toBe('test-model')
  })

  it('프롬프트에 후보의 id와 제목을 담는다', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ollamaResponse([{ id: 'sc-a', reason: 'x' }]))

    await provider.curate({ candidates, count: 1, weekLabel: '2026년 8월 둘째 주' })

    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    const prompt = body.messages.map((m: { content: string }) => m.content).join('\n')
    expect(prompt).toContain('sc-a')
    expect(prompt).toContain('전시 A')
    expect(prompt).toContain('2026년 8월 둘째 주')
  })

  it('HTTP 오류를 던진다 (호출 측이 폴백하도록)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(provider.curate({ candidates, count: 1, weekLabel: 'x' })).rejects.toThrow()
  })

  it('JSON이 아닌 응답을 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: { content: '이건 JSON이 아님' } })),
    )
    await expect(provider.curate({ candidates, count: 1, weekLabel: 'x' })).rejects.toThrow()
  })

  it('스키마에 안 맞는 picks를 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ollamaResponse([{ nope: 1 }]))
    await expect(provider.curate({ candidates, count: 1, weekLabel: 'x' })).rejects.toThrow()
  })
})

describe('createProvider', () => {
  it('LLM_PROVIDER=rule이면 RuleOnlyProvider를 준다', () => {
    vi.stubEnv('LLM_PROVIDER', 'rule')
    expect(createProvider().name).toBe('rule')
    vi.unstubAllEnvs()
  })

  it('LLM_PROVIDER=ollama면 OllamaProvider를 준다', () => {
    vi.stubEnv('LLM_PROVIDER', 'ollama')
    expect(createProvider().name).toBe('ollama')
    vi.unstubAllEnvs()
  })

  it('알 수 없는 값이면 던진다 (조용히 폴백하지 않는다)', () => {
    vi.stubEnv('LLM_PROVIDER', 'gpt')
    expect(() => createProvider()).toThrow(/LLM_PROVIDER/)
    vi.unstubAllEnvs()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/llm/ollama.test.ts`
Expected: FAIL — `Failed to resolve import "~/llm/ollama"`

- [ ] **Step 3: 구현**

`src/llm/ollama.ts`:

```ts
import { z } from 'zod'
import type { CurationCandidate, CurationPick, LlmProvider } from '~/llm/types'

const pickResponseSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
})

/** Ollama의 format 필드에 넣을 JSON 스키마. Anthropic의 output_config.format과 같은 모양. */
const RESPONSE_FORMAT = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['picks'],
} as const

/** 빌드 재현성을 위한 고정 시드. 바꾸면 같은 데이터에서도 다른 선정이 나온다. */
const CURATION_SEED = 42

const SYSTEM_PROMPT = `당신은 서울의 문화행사를 고르는 편집자입니다.

주어진 후보 목록에서 이번 주에 가장 볼 만한 행사를 골라주세요.

규칙:
- 반드시 후보 목록에 있는 id만 고릅니다. 새로운 행사를 지어내지 마세요.
- 카테고리와 지역이 한쪽에 쏠리지 않게 다양하게 고릅니다.
- reason은 40자 내외의 한 줄 코멘트입니다. "왜 이번 주에 볼 만한가"를 씁니다.
- reason에 행사 제목을 그대로 반복하지 마세요. 읽는 사람이 이미 제목을 봅니다.
- 요청한 개수만큼 고릅니다.`

function buildUserPrompt(candidates: CurationCandidate[], count: number, weekLabel: string): string {
  const lines = candidates.map((c) =>
    [
      `- id: ${c.id}`,
      `  제목: ${c.title}`,
      `  분류: ${c.category} / ${c.district}`,
      `  장소: ${c.place}`,
      `  기간: ${c.startDate} ~ ${c.endDate}`,
      `  요금: ${c.isFree ? '무료' : '유료'}`,
    ].join('\n'),
  )

  return `${weekLabel}입니다. 아래 후보 ${candidates.length}개 중 ${count}개를 골라주세요.

${lines.join('\n')}`
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama'

  constructor(
    private readonly host = process.env.OLLAMA_HOST ?? 'http://localhost:11434',
    private readonly model = process.env.OLLAMA_MODEL ?? 'qwen3:30b',
  ) {}

  async curate({
    candidates,
    count,
    weekLabel,
  }: {
    candidates: CurationCandidate[]
    count: number
    weekLabel: string
  }): Promise<CurationPick[]> {
    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: RESPONSE_FORMAT,
        // seed 고정 = 재현성. 이 출력이 data/*.json으로 커밋되므로
        // 데이터가 안 바뀐 날에는 diff도 없어야 한다.
        // thinking은 끄지 않는다 — 끄면 40자 제약을 지키지 못한다(실측).
        options: { temperature: 0.3, seed: CURATION_SEED },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(candidates, count, weekLabel) },
        ],
      }),
    })

    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const json = (await res.json()) as { message?: { content?: string } }
    const content = json.message?.content
    if (!content) throw new Error('Ollama 응답에 message.content가 없습니다')

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error(`Ollama가 JSON이 아닌 응답을 반환했습니다: ${content.slice(0, 200)}`)
    }

    return pickResponseSchema.parse(parsed).picks
  }
}
```

`src/llm/index.ts`:

```ts
import { OllamaProvider } from '~/llm/ollama'
import { RuleOnlyProvider } from '~/llm/rule-only'
import type { LlmProvider } from '~/llm/types'

/**
 * LLM_PROVIDER 환경변수로 provider를 고른다.
 * 알 수 없는 값이면 던진다 — 오타를 조용히 폴백으로 삼키면
 * 왜 코멘트가 비었는지 알 수 없게 된다.
 *
 * anthropic은 GitHub Actions로 이관할 때 추가한다 (Ollama는 러너에서 돌지 않는다).
 */
export function createProvider(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? 'ollama'

  switch (name) {
    case 'ollama':
      return new OllamaProvider()
    case 'rule':
      return new RuleOnlyProvider()
    default:
      throw new Error(`알 수 없는 LLM_PROVIDER: ${name} (ollama | rule)`)
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/llm/ollama.test.ts`
Expected: PASS (12개 통과 — seed·thinking 설정 고정 2건 추가)

- [ ] **Step 5: 실제 Ollama로 확인**

```bash
ollama pull qwen3:8b
npx tsx --env-file-if-exists=.env -e "
import { OllamaProvider } from './src/llm/ollama'
const p = new OllamaProvider()
const picks = await p.curate({
  candidates: [
    { id: 'sc-a', title: '서울시립미술관 특별전', category: '전시', district: '중구', place: '서울시립미술관', startDate: '2026-08-10', endDate: '2026-08-16', isFree: true },
    { id: 'sc-b', title: '구민 노래교실', category: '교육', district: '강북구', place: '강북구민회관', startDate: '2026-08-11', endDate: '2026-08-11', isFree: true },
  ],
  count: 1,
  weekLabel: '2026년 8월 둘째 주',
})
console.log(picks)
"
```

기대: `sc-a`가 선택되고 reason이 한국어 한 줄로 나온다.

- [ ] **Step 6: 커밋**

```bash
git add src/llm/ollama.ts src/llm/index.ts tests/llm/ollama.test.ts
git commit -m "feat: Ollama provider와 환경변수 기반 provider 선택 추가

format에 JSON 스키마를 넣어 응답 구조를 강제한다.
알 수 없는 LLM_PROVIDER는 조용히 폴백하지 않고 던진다."
```

---

## Task 11: curate — 환각 방어와 폴백

**Files:**
- Create: `src/pipeline/curate.ts`
- Test: `tests/pipeline/curate.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`, `toCandidate` (Task 9), `EventItem` (Task 1)
- Produces:
  - `CuratedEntry` — `{ id: string; reason: string }`
  - `curate(events, opts): Promise<{ entries: CuratedEntry[]; providerName: string }>`

스펙 8장의 환각 방어 2겹을 여기서 강제한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/curate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { curate } from '~/pipeline/curate'
import type { LlmProvider } from '~/llm/types'
import type { EventItem } from '~/types/item'

function evt(id: string): EventItem {
  return {
    id, source: 'seoul-culture', kind: 'event', title: `행사 ${id}`,
    category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-16',
  }
}

const events = ['sc-a', 'sc-b', 'sc-c', 'sc-d'].map(evt)

function fakeProvider(picks: { id: string; reason: string }[]): LlmProvider {
  return { name: 'fake', curate: vi.fn().mockResolvedValue(picks) }
}

function throwingProvider(): LlmProvider {
  return { name: 'fake', curate: vi.fn().mockRejectedValue(new Error('죽음')) }
}

describe('curate — 정상 경로', () => {
  it('provider가 고른 순서를 유지한다', async () => {
    const provider = fakeProvider([
      { id: 'sc-c', reason: '좋음' },
      { id: 'sc-a', reason: '괜찮음' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries.map((e) => e.id)).toEqual(['sc-c', 'sc-a'])
  })

  it('사용된 provider 이름을 반환한다', async () => {
    const { providerName } = await curate(events, {
      provider: fakeProvider([{ id: 'sc-a', reason: 'x' }]),
      count: 1,
      weekLabel: 'x',
    })
    expect(providerName).toBe('fake')
  })
})

describe('curate — 환각 방어', () => {
  it('후보에 없는 id를 버린다', async () => {
    const provider = fakeProvider([
      { id: 'sc-a', reason: '진짜' },
      { id: 'sc-지어냄', reason: '가짜' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries.map((e) => e.id)).not.toContain('sc-지어냄')
  })

  it('버린 만큼 규칙 상위에서 채운다', async () => {
    const provider = fakeProvider([
      { id: 'sc-c', reason: '진짜' },
      { id: 'sc-없음', reason: '가짜' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(entries).toHaveLength(2)
    expect(entries[0]!.id).toBe('sc-c')
    // 후보 순서(sc-a가 맨 앞)에서 아직 안 쓰인 것으로 채운다
    expect(entries[1]!.id).toBe('sc-a')
  })

  it('중복 id를 한 번만 쓴다', async () => {
    const provider = fakeProvider([
      { id: 'sc-a', reason: '1' },
      { id: 'sc-a', reason: '2' },
    ])
    const { entries } = await curate(events, { provider, count: 2, weekLabel: 'x' })
    expect(new Set(entries.map((e) => e.id)).size).toBe(2)
  })

  it('reason이 너무 길면 자른다', async () => {
    const provider = fakeProvider([{ id: 'sc-a', reason: '아'.repeat(200) }])
    const { entries } = await curate(events, { provider, count: 1, weekLabel: 'x' })
    expect(entries[0]!.reason.length).toBeLessThanOrEqual(60)
  })
})

describe('curate — 폴백', () => {
  it('provider가 던지면 규칙 상위로 채운다', async () => {
    const { entries, providerName } = await curate(events, {
      provider: throwingProvider(),
      count: 3,
      weekLabel: 'x',
    })
    expect(entries.map((e) => e.id)).toEqual(['sc-a', 'sc-b', 'sc-c'])
    expect(providerName).toBe('rule (fake 실패)')
  })

  it('폴백된 항목의 reason은 빈 문자열이다', async () => {
    const { entries } = await curate(events, {
      provider: throwingProvider(),
      count: 1,
      weekLabel: 'x',
    })
    expect(entries[0]!.reason).toBe('')
  })

  it('후보가 count보다 적으면 있는 만큼만 반환한다', async () => {
    const { entries } = await curate([evt('sc-a')], {
      provider: throwingProvider(),
      count: 12,
      weekLabel: 'x',
    })
    expect(entries).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/curate.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/curate"`

- [ ] **Step 3: 구현**

`src/pipeline/curate.ts`:

```ts
import { toCandidate, type CurationPick, type LlmProvider } from '~/llm/types'
import type { EventItem } from '~/types/item'

export interface CuratedEntry {
  id: string
  reason: string
}

const MAX_REASON_LENGTH = 60

/**
 * 후보를 LLM에 넘겨 최종 선별을 받는다.
 *
 * 환각 방어 2겹:
 *   (a) LLM은 후보의 id만 고른다 (프롬프트와 응답 스키마로 강제)
 *   (b) 여기서 후보에 없는 id를 버리고, 부족분을 규칙 상위로 채운다
 *
 * LLM이 죽으면 규칙 상위 count개로 폴백한다 — 화면이 절대 비지 않는다.
 */
export async function curate(
  candidates: EventItem[],
  opts: { provider: LlmProvider; count: number; weekLabel: string },
): Promise<{ entries: CuratedEntry[]; providerName: string }> {
  const { provider, count, weekLabel } = opts
  const byId = new Map(candidates.map((e) => [e.id, e]))

  let picks: CurationPick[]
  let providerName = provider.name

  try {
    picks = await provider.curate({
      candidates: candidates.map(toCandidate),
      count,
      weekLabel,
    })
  } catch (error) {
    console.warn(`  [curate] ${provider.name} 실패 — 규칙 상위로 폴백:`, error)
    picks = []
    providerName = `rule (${provider.name} 실패)`
  }

  const entries: CuratedEntry[] = []
  const used = new Set<string>()

  // (b) 실재하는 id만, 중복 없이
  for (const pick of picks) {
    if (entries.length >= count) break
    if (!byId.has(pick.id) || used.has(pick.id)) continue
    used.add(pick.id)
    entries.push({
      id: pick.id,
      reason: pick.reason.trim().slice(0, MAX_REASON_LENGTH),
    })
  }

  // 부족분은 규칙 상위(candidates는 이미 점수순)에서 채운다
  for (const event of candidates) {
    if (entries.length >= count) break
    if (used.has(event.id)) continue
    used.add(event.id)
    entries.push({ id: event.id, reason: '' })
  }

  return { entries, providerName }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/curate.test.ts`
Expected: PASS (11개 통과 — 빈 후보·개수 상한 2건 추가)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/curate.ts tests/pipeline/curate.test.ts
git commit -m "feat: 큐레이션 환각 방어와 폴백 추가

후보에 없는 id를 버리고 부족분을 규칙 상위로 채운다.
LLM이 죽으면 전량 규칙 폴백 — 화면이 절대 비지 않는다."
```

---

## Task 12: pick-places — "언제 가도 좋은 곳" 6개

**Files:**
- Create: `src/pipeline/pick-places.ts`
- Test: `tests/pipeline/pick-places.test.ts`

**Interfaces:**
- Consumes: `Item`, `PlaceItem` (Task 1)
- Produces: `pickPlaces(items: Item[], weekKey: string, count?: number): string[]` — place id 배열

스펙 10-1의 규칙: 자격 필터(이미지 **and** 좌표) → 점수 → **주차 시드 결정론적 회전**.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/pick-places.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pickPlaces } from '~/pipeline/pick-places'
import type { EventItem, Item, PlaceItem } from '~/types/item'

function place(id: string, over: Partial<PlaceItem> = {}): PlaceItem {
  return {
    id, source: 'visit-seoul', kind: 'place', title: `장소 ${id}`,
    category: '문화관광', place: `장소 ${id}`,
    imageUrl: 'https://example.com/a.jpg', lat: 37.5, lng: 127.0,
    ...over,
  }
}

const pool: Item[] = Array.from({ length: 30 }, (_, i) => place(`vs-${i}`))

describe('pickPlaces — 자격 필터', () => {
  it('이미지가 없으면 제외한다', () => {
    const items = [place('vs-a', { imageUrl: undefined }), ...pool]
    expect(pickPlaces(items, '2026-W33')).not.toContain('vs-a')
  })

  it('좌표가 없으면 제외한다', () => {
    const items = [place('vs-a', { lat: undefined, lng: undefined }), ...pool]
    expect(pickPlaces(items, '2026-W33')).not.toContain('vs-a')
  })

  it('event는 제외한다', () => {
    const event: EventItem = {
      id: 'sc-x', source: 'seoul-culture', kind: 'event', title: '행사',
      category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-16',
      imageUrl: 'https://example.com/a.jpg', lat: 37.5, lng: 127.0,
    }
    expect(pickPlaces([event, ...pool], '2026-W33')).not.toContain('sc-x')
  })
})

describe('pickPlaces — 개수와 결정론', () => {
  it('기본 6개를 반환한다', () => {
    expect(pickPlaces(pool, '2026-W33')).toHaveLength(6)
  })

  it('자격 있는 항목이 6개 미만이면 있는 만큼만 반환한다', () => {
    expect(pickPlaces([place('vs-a'), place('vs-b')], '2026-W33')).toHaveLength(2)
  })

  it('같은 주에는 항상 같은 결과다 (빌드 재현성)', () => {
    expect(pickPlaces(pool, '2026-W33')).toEqual(pickPlaces(pool, '2026-W33'))
  })

  it('주가 바뀌면 조합이 달라진다', () => {
    // 결정론적이므로 항상 통과하거나 항상 실패한다.
    // 두 주의 시드가 우연히 pool 길이로 합동이면 다른 주차 쌍으로 바꾼다.
    expect(pickPlaces(pool, '2026-W33')).not.toEqual(pickPlaces(pool, '2026-W34'))
  })

  it('중복 없이 반환한다', () => {
    const picked = pickPlaces(pool, '2026-W33')
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('입력 순서가 바뀌어도 같은 결과다', () => {
    expect(pickPlaces([...pool].reverse(), '2026-W33')).toEqual(pickPlaces(pool, '2026-W33'))
  })
})

describe('pickPlaces — 점수', () => {
  it('summary/subwayInfo/무료가 있는 곳을 선호한다', () => {
    const rich = place('vs-rich', {
      summary: '좋은 곳', subwayInfo: '2호선 시청역', isFree: true,
    })
    const plain = Array.from({ length: 20 }, (_, i) => place(`vs-plain-${i}`))
    expect(pickPlaces([rich, ...plain], '2026-W33')).toContain('vs-rich')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/pick-places.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/pick-places"`

- [ ] **Step 3: 구현**

`src/pipeline/pick-places.ts`:

```ts
import type { Item, PlaceItem } from '~/types/item'

const WEIGHTS = {
  hasSummary: 10,
  hasSubwayInfo: 8,
  isFree: 6,
  hasHours: 5,
  hasAddress: 3,
} as const

/**
 * 자격: 이미지와 좌표가 둘 다 있는 place만.
 * 이미지 없는 카드는 홈 하단에서 초라해 보이고,
 * 좌표가 없으면 근처 화면으로 이어지지 않는다.
 */
function isEligible(item: Item): item is PlaceItem {
  return item.kind === 'place' && !!item.imageUrl && item.lat != null && item.lng != null
}

function scorePlace(p: PlaceItem): number {
  let score = 0
  if (p.summary) score += WEIGHTS.hasSummary
  if (p.subwayInfo) score += WEIGHTS.hasSubwayInfo
  if (p.isFree) score += WEIGHTS.isFree
  if (p.hours) score += WEIGHTS.hasHours
  if (p.address) score += WEIGHTS.hasAddress
  return score
}

/** 문자열 → 32비트 시드 (FNV-1a) */
function seedFrom(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * "언제 가도 좋은 곳" 선정.
 *
 * 점수순으로 정렬한 뒤 주차 시드로 시작 위치를 옮겨 count개를 순환 추출한다.
 * 매주 다른 조합이 나오면서도 같은 주에는 항상 같은 결과가 나온다(빌드 재현성).
 *
 * LLM을 쓰지 않는 이유: place는 상설이라 "이번 주에 왜 볼 만한가"라는
 * 판단이 성립하지 않는다. 회전만으로 신선함이 충분하다.
 */
export function pickPlaces(items: Item[], weekKey: string, count = 6): string[] {
  const eligible = items
    .filter(isEligible)
    .map((p) => ({ p, score: scorePlace(p) }))
    // 동점은 id 순으로 안정 정렬 — 입력 순서에 의존하지 않는다
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .map(({ p }) => p.id)

  if (eligible.length <= count) return eligible

  const offset = seedFrom(weekKey) % eligible.length
  return Array.from({ length: count }, (_, i) => eligible[(offset + i) % eligible.length]!)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/pick-places.test.ts`
Expected: PASS (10개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/pick-places.ts tests/pipeline/pick-places.test.ts
git commit -m "feat: '언제 가도 좋은 곳' 결정론적 선정 추가

이미지와 좌표가 둘 다 있는 place만 자격을 준다.
주차 시드로 회전해 매주 조합이 바뀌되 같은 주엔 같은 결과가 나온다."
```

---

## Task 13: emit — 검증 후 JSON 쓰기

**Files:**
- Create: `src/pipeline/emit.ts`
- Test: `tests/pipeline/emit.test.ts`

**Interfaces:**
- Consumes: `Item`, `itemSchema` (Task 1), `CuratedEntry` (Task 11), `DetailCache` (Task 3)
- Produces:
  - `weeklyEventsSchema`, `placesFileSchema`, `curatedFileSchema`, `metaSchema` (zod)
  - `emit(payload, opts): Promise<void>`

스펙 12장: 검증 실패 시 **파일을 쓰지 않고** 던진다. 조용히 빈 화면이 나가는 것보다 배치가 깨지는 게 낫다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/emit.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emit } from '~/pipeline/emit'
import type { EventItem, PlaceItem } from '~/types/item'

const event: EventItem = {
  id: 'sc-a', source: 'seoul-culture', kind: 'event', title: '행사',
  category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-16',
}

const place: PlaceItem = {
  id: 'vs-b', source: 'visit-seoul', kind: 'place', title: '장소',
  category: '문화관광', place: '장소',
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'seoulchi-emit-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const basePayload = {
  weekKey: '2026-W33',
  events: [event],
  places: [place],
  curated: [{ id: 'sc-a', reason: '무료 전시' }],
  curatedPlaces: ['vs-b'],
  providerName: 'ollama',
  cache: {},
  sourceCounts: { 'seoul-culture': 1, 'visit-seoul': 1 },
}

async function readJson(path: string) {
  return JSON.parse(await readFile(join(dir, path), 'utf8'))
}

describe('emit', () => {
  it('주간 이벤트 파일을 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('events/2026-W33.json')).toMatchObject({
      weekKey: '2026-W33',
      items: [{ id: 'sc-a' }],
    })
  })

  it('place는 주 파일이 아니라 places.json에 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    const weekly = await readJson('events/2026-W33.json')
    expect(weekly.items.map((i: { id: string }) => i.id)).not.toContain('vs-b')
    expect((await readJson('places.json')).items[0].id).toBe('vs-b')
  })

  it('큐레이션 파일에 선별과 장소를 함께 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('curated/2026-W33.json')).toMatchObject({
      weekKey: '2026-W33',
      picks: [{ id: 'sc-a', reason: '무료 전시' }],
      places: ['vs-b'],
    })
  })

  it('meta에 갱신 시각과 provider를 쓴다', async () => {
    await emit(basePayload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('meta.json')).toMatchObject({
      updatedAt: '2026-08-13T00:00:00.000Z',
      llmProvider: 'ollama',
      sourceCounts: { 'seoul-culture': 1 },
    })
  })

  it('캐시 파일을 쓴다', async () => {
    const payload = {
      ...basePayload,
      cache: { KOP1: { updtDtText: '2026.08.01', detail: { a: 1 } } },
    }
    await emit(payload, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') })
    expect(await readJson('cache/visitseoul.json')).toMatchObject({
      KOP1: { updtDtText: '2026.08.01' },
    })
  })

  it('스키마에 안 맞는 항목이 있으면 던지고 파일을 쓰지 않는다', async () => {
    const bad = { ...basePayload, events: [{ ...event, id: 'bad:id' }] as EventItem[] }
    await expect(
      emit(bad, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') }),
    ).rejects.toThrow()
    await expect(readJson('events/2026-W33.json')).rejects.toThrow()
  })

  it('큐레이션 id가 이벤트 목록에 없으면 던진다', async () => {
    const bad = { ...basePayload, curated: [{ id: 'sc-없음', reason: 'x' }] }
    await expect(
      emit(bad, { dataDir: dir, now: new Date('2026-08-13T00:00:00Z') }),
    ).rejects.toThrow(/큐레이션/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/emit.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/emit"`

- [ ] **Step 3: 구현**

`src/pipeline/emit.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { CuratedEntry } from '~/pipeline/curate'
import type { DetailCache } from '~/sources/types'
import { eventItemSchema, placeItemSchema, type EventItem, type PlaceItem } from '~/types/item'

const weekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/)

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

export interface EmitPayload {
  weekKey: string
  events: EventItem[]
  places: PlaceItem[]
  curated: CuratedEntry[]
  curatedPlaces: string[]
  providerName: string
  cache: DetailCache
  sourceCounts: Record<string, number>
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/**
 * 모든 파일을 쓰기 **전에** 전부 검증한다.
 * 하나라도 실패하면 아무것도 쓰지 않고 던진다 —
 * 조용히 빈 화면이 나가는 것보다 배치가 깨지는 게 낫다.
 */
export async function emit(
  payload: EmitPayload,
  opts: { dataDir?: string; now?: Date } = {},
): Promise<void> {
  const dataDir = opts.dataDir ?? 'data'
  const now = opts.now ?? new Date()

  const weekly = weeklyEventsSchema.parse({
    weekKey: payload.weekKey,
    items: payload.events,
  })
  const places = placesFileSchema.parse({ items: payload.places })

  // 참조 무결성: 큐레이션이 가리키는 id가 실제로 존재해야 한다
  const eventIds = new Set(weekly.items.map((i) => i.id))
  const placeIds = new Set(places.items.map((i) => i.id))

  for (const pick of payload.curated) {
    if (!eventIds.has(pick.id)) {
      throw new Error(`큐레이션이 존재하지 않는 이벤트를 가리킵니다: ${pick.id}`)
    }
  }
  for (const id of payload.curatedPlaces) {
    if (!placeIds.has(id)) {
      throw new Error(`큐레이션이 존재하지 않는 장소를 가리킵니다: ${id}`)
    }
  }

  const curated = curatedFileSchema.parse({
    weekKey: payload.weekKey,
    picks: payload.curated,
    places: payload.curatedPlaces,
  })

  const meta = metaSchema.parse({
    updatedAt: now.toISOString(),
    llmProvider: payload.providerName,
    sourceCounts: payload.sourceCounts,
    weekKey: payload.weekKey,
    counts: { events: weekly.items.length, places: places.items.length },
  })

  // 여기까지 왔으면 전부 유효하다. 이제 쓴다.
  await writeJson(join(dataDir, 'events', `${payload.weekKey}.json`), weekly)
  await writeJson(join(dataDir, 'places.json'), places)
  await writeJson(join(dataDir, 'curated', `${payload.weekKey}.json`), curated)
  await writeJson(join(dataDir, 'meta.json'), meta)
  await writeJson(join(dataDir, 'cache', 'visitseoul.json'), payload.cache)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/emit.test.ts`
Expected: PASS (7개 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/emit.ts tests/pipeline/emit.test.ts
git commit -m "feat: 검증 후 JSON 쓰기 추가

쓰기 전에 전부 검증하고 하나라도 실패하면 아무것도 쓰지 않는다.
큐레이션이 가리키는 id의 참조 무결성도 확인한다.
place는 주 파일이 아니라 places.json에 쓴다."
```

---

## Task 14: 파이프라인 조립 CLI

**Files:**
- Create: `scripts/run-batch.ts`
- Create: `src/pipeline/run.ts`
- Test: `tests/pipeline/run.test.ts`

**Interfaces:**
- Consumes: 전 태스크의 산출물 전부
- Produces: `runPipeline(opts): Promise<EmitPayload>` — 순수 조립 함수(파일 쓰기는 하지 않음)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runPipeline } from '~/pipeline/run'
import { RuleOnlyProvider } from '~/llm/rule-only'
import type { EventSource } from '~/sources/types'
import type { Item } from '~/types/item'

function fakeSource(name: string, items: Item[]): EventSource<Item, Item> {
  return {
    name,
    fetchList: async () => items,
    hydrate: async (i) => i,
    normalize: (i) => i,
  }
}

const scEvent: Item = {
  id: 'sc-a', source: 'seoul-culture', kind: 'event', title: '전시 A',
  category: '전시', place: '서울시립미술관', startDate: '2026-08-10', endDate: '2026-08-16',
  isFree: true,
}

const vsPlace: Item = {
  id: 'vs-b', source: 'visit-seoul', kind: 'place', title: '박물관',
  category: '문화관광', place: '박물관',
  imageUrl: 'https://example.com/a.jpg', lat: 37.5, lng: 127.0,
}

const outOfWeek: Item = {
  id: 'sc-old', source: 'seoul-culture', kind: 'event', title: '지난 행사',
  category: '전시', place: '어딘가', startDate: '2026-01-01', endDate: '2026-01-31',
}

/** 2026-W33에는 걸치지만 목요일(08-13) 시점에는 이미 끝난 행사 */
const endedEarlyThisWeek: Item = {
  id: 'sc-ended', source: 'seoul-culture', kind: 'event', title: '월요일에 끝난 행사',
  category: '전시', place: '어딘가', startDate: '2026-08-10', endDate: '2026-08-11',
}

describe('runPipeline', () => {
  const opts = {
    sources: [
      fakeSource('seoul-culture', [scEvent, outOfWeek, endedEarlyThisWeek]),
      fakeSource('visit-seoul', [vsPlace]),
    ],
    provider: new RuleOnlyProvider(),
    weekKey: '2026-W33',
    today: '2026-08-13',
    cache: {},
    curatedCount: 12,
    placeCount: 6,
  }

  it('이번 주 이벤트만 events에 담는다', async () => {
    const out = await runPipeline(opts)
    expect(out.events.map((e) => e.id)).toEqual(['sc-a'])
  })

  it('이번 주라도 오늘 이전에 끝난 행사는 뺀다', async () => {
    const out = await runPipeline(opts)
    expect(out.events.map((e) => e.id)).not.toContain('sc-ended')
  })

  it('today가 주 시작일보다 이르면 주 전체를 담는다', async () => {
    const out = await runPipeline({ ...opts, today: '2026-08-01' })
    expect(out.events.map((e) => e.id).sort()).toEqual(['sc-a', 'sc-ended'])
  })

  it('place를 events에서 분리한다', async () => {
    const out = await runPipeline(opts)
    expect(out.places.map((p) => p.id)).toEqual(['vs-b'])
  })

  it('큐레이션 id가 events 안에 있다', async () => {
    const out = await runPipeline(opts)
    const eventIds = new Set(out.events.map((e) => e.id))
    for (const pick of out.curated) expect(eventIds.has(pick.id)).toBe(true)
  })

  it('선정된 장소 id가 places 안에 있다', async () => {
    const out = await runPipeline(opts)
    const placeIds = new Set(out.places.map((p) => p.id))
    for (const id of out.curatedPlaces) expect(placeIds.has(id)).toBe(true)
  })

  it('소스별 건수를 센다', async () => {
    const out = await runPipeline(opts)
    expect(out.sourceCounts).toMatchObject({ 'seoul-culture': 3, 'visit-seoul': 1 })
  })

  it('provider 이름을 담는다', async () => {
    expect((await runPipeline(opts)).providerName).toBe('rule')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/pipeline/run.test.ts`
Expected: FAIL — `Failed to resolve import "~/pipeline/run"`

- [ ] **Step 3: 구현**

`src/pipeline/run.ts`:

```ts
import type { LlmProvider } from '~/llm/types'
import { curate } from '~/pipeline/curate'
import type { EmitPayload } from '~/pipeline/emit'
import { mergeItems } from '~/pipeline/merge'
import { pickPlaces } from '~/pipeline/pick-places'
import { selectCandidates } from '~/pipeline/score'
import { weekLabel, weekRange } from '~/lib/week'
import type { DetailCache, EventSource } from '~/sources/types'
import type { EventItem, Item, PlaceItem } from '~/types/item'

export interface RunOptions {
  sources: EventSource<any, any>[]
  provider: LlmProvider
  weekKey: string
  /** KST 기준 오늘(YYYY-MM-DD). 이미 끝난 행사를 잘라내는 기준. CLI가 넘긴다. */
  today: string
  cache: DetailCache
  curatedCount?: number
  placeCount?: number
  candidateCount?: number
}

/**
 * fetch → hydrate → normalize → merge → score → curate → (payload)
 * 파일 쓰기는 하지 않는다. emit()이 검증과 함께 담당한다.
 */
export async function runPipeline(opts: RunOptions): Promise<EmitPayload> {
  const {
    sources, provider, weekKey, today, cache,
    curatedCount = 12, placeCount = 6, candidateCount = 40,
  } = opts

  const groups: Item[][] = []
  const sourceCounts: Record<string, number> = {}

  for (const source of sources) {
    console.log(`[${source.name}] 수집 중...`)
    const list = await source.fetchList()
    const hydrated = await source.hydrate(list, cache)
    const items = source.normalize(hydrated)
    sourceCounts[source.name] = items.length
    groups.push(items)
    console.log(`[${source.name}] ${list.length}건 → 정규화 ${items.length}건`)
  }

  const merged = mergeItems(groups)
  console.log(`병합 후 ${merged.length}건 (중복 ${groups.flat().length - merged.length}건 제거)`)

  // 과거 컷오프: 유효 시작일은 max(주 시작일, 오늘).
  // 주 시작일만 쓰면 월요일에 끝난 행사가 목요일 화면에 남는다.
  const { start, end } = weekRange(weekKey)
  const from = today > start ? today : start
  const events = merged.filter(
    (i): i is EventItem => i.kind === 'event' && i.startDate <= end && i.endDate >= from,
  )
  const places = merged.filter((i): i is PlaceItem => i.kind === 'place')
  console.log(`이번 주 이벤트 ${events.length}건 (${from}~${end}) / 장소 ${places.length}건`)

  const candidates = selectCandidates(events, weekKey, today, candidateCount)
  console.log(`후보 ${candidates.length}건 → 선별 ${curatedCount}건 요청`)

  const { entries, providerName } = await curate(candidates, {
    provider,
    count: curatedCount,
    weekLabel: weekLabel(weekKey),
  })

  return {
    weekKey,
    events,
    places,
    curated: entries,
    curatedPlaces: pickPlaces(places, weekKey, placeCount),
    providerName,
    cache,
    sourceCounts,
  }
}
```

`scripts/run-batch.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { isoWeekKey, kstToday } from '~/lib/week'
import { createProvider } from '~/llm/index'
import { emit } from '~/pipeline/emit'
import { runPipeline } from '~/pipeline/run'
import { SeoulCultureSource } from '~/sources/seoul-culture'
import type { DetailCache } from '~/sources/types'
import { VisitSeoulSource } from '~/sources/visit-seoul'

/** docs/api-findings.md에서 확정한 수집 대상 카테고리로 교체할 것 */
const VISIT_SEOUL_CATEGORIES = process.env.VISITSEOUL_CATEGORIES?.split(',').filter(Boolean) ?? []

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`환경변수 ${name}이 필요합니다`)
  return value
}

async function loadCache(path: string): Promise<DetailCache> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as DetailCache
  } catch {
    console.log('캐시 없음 — 처음부터 수집합니다')
    return {}
  }
}

const now = new Date()
const today = kstToday(now)
const weekKey = process.argv[2] ?? isoWeekKey(now)

// 과거 데이터는 쌓지 않기로 했다. 지난 주차 요청은 조용히 빈 파일을 내는 대신 거절한다.
if (weekKey < isoWeekKey(now)) {
  throw new Error(
    `지난 주차(${weekKey})는 지원하지 않습니다. 과거 데이터를 쌓지 않는 것이 이 배치의 전제입니다.\n` +
      `정말 필요하면 계획의 "과거 컷오프" 제약을 먼저 되돌리세요.`,
  )
}

console.log(`대상 주차: ${weekKey} (오늘 ${today} 이후만 수집)\n`)

const cache = await loadCache('data/cache/visitseoul.json')
const provider = createProvider()
console.log(`LLM provider: ${provider.name}\n`)

const payload = await runPipeline({
  sources: [
    new SeoulCultureSource(requireEnv('SEOUL_API_KEY')),
    new VisitSeoulSource(requireEnv('VISITSEOUL_API_KEY'), VISIT_SEOUL_CATEGORIES),
  ],
  provider,
  weekKey,
  today,
  cache,
})

await emit(payload)

console.log(`
완료. ${payload.providerName}로 선별.
  이벤트 ${payload.events.length}건 → 선별 ${payload.curated.length}건
  장소 ${payload.places.length}건 → 노출 ${payload.curatedPlaces.length}건`)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/run.test.ts`
Expected: PASS (8개 통과)

- [ ] **Step 5: 전체 테스트 실행**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 6: 실제 배치 실행**

`.env.local`에 Task 0에서 확정한 카테고리가 들어 있는지 확인한다(`docs/api-findings.md` 참조):

```
VISITSEOUL_CATEGORIES=Cv7s8m5,Ca0o2d4,Cc9i5o2,Ca1z6p7,Co6c2n2
LLM_PROVIDER=ollama
```

```bash
npm run batch
```

확인할 것:
- `data/events/YYYY-Www.json`의 **파일 크기** — 스펙 14장 미해결 #7의 답. 500KB를 넘으면 필드 축소를 검토한다
- `data/curated/YYYY-Www.json`의 `reason`이 한국어로 그럴듯한가
- `data/cache/visitseoul.json`이 생겼는가 (두 번째 실행 시 상세 호출이 0에 가까워야 한다)

- [ ] **Step 7: 두 번째 실행으로 캐시 동작 확인**

```bash
npm run batch
```

로그에 `[visit-seoul] 상세 호출 0건 / 전체 N건`이 찍혀야 한다.

- [ ] **Step 8: 실측 결과를 `docs/api-findings.md`에 추가**

```markdown
## 배치 실측 (YYYY-MM-DD)
- events/YYYY-Www.json 크기: N KB (gzip 시 M KB)
- places.json 크기: N KB
- 이벤트 건수 / 장소 건수:
- 초회 상세 호출 수 / 2회차 상세 호출 수:
- 큐레이션 소요 시간:
```

- [ ] **Step 9: 커밋**

```bash
git add src/pipeline/run.ts scripts/run-batch.ts tests/pipeline/run.test.ts docs/api-findings.md
git commit -m "feat: 배치 파이프라인 조립 CLI 추가

runPipeline은 파일을 쓰지 않는 순수 조립 함수이고,
쓰기와 검증은 emit이 담당한다.
실측 결과를 docs/api-findings.md에 기록."
```

- [ ] **Step 10: 생성된 데이터 커밋**

```bash
git add data/
git commit -m "chore: 첫 배치 데이터 커밋"
```

---

## Task 15: GitHub Actions 이관

**전제:** Ollama로 프롬프트 품질이 만족스러워진 뒤에 착수한다. Actions 러너에서는 Ollama가 돌지 않으므로 `LLM_PROVIDER`를 `rule`로 시작하고, 이후 `AnthropicProvider`를 추가한다(스펙 9-2).

**Files:**
- Create: `.github/workflows/batch.yml`
- Modify: `README.md` (없으면 생성)

**Interfaces:**
- Consumes: `scripts/run-batch.ts` (Task 14)
- Produces: 매일 도는 cron 워크플로

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/batch.yml`:

```yaml
name: 배치

on:
  schedule:
    # 매일 KST 06:00 (UTC 21:00 전날)
    - cron: '0 21 * * *'
  workflow_dispatch:
    inputs:
      weekKey:
        description: '대상 주차 (예: 2026-W33). 비우면 오늘 기준'
        required: false

permissions:
  contents: write

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm test

      - name: 배치 실행
        env:
          SEOUL_API_KEY: ${{ secrets.SEOUL_API_KEY }}
          VISITSEOUL_API_KEY: ${{ secrets.VISITSEOUL_API_KEY }}
          VISITSEOUL_CATEGORIES: ${{ vars.VISITSEOUL_CATEGORIES }}
          LLM_PROVIDER: rule
        run: npm run batch -- ${{ inputs.weekKey }}

      - name: 변경분 커밋
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add data/
          if git diff --staged --quiet; then
            echo "변경 없음"
          else
            git commit -m "chore: 배치 데이터 갱신 ($(date -u +%Y-%m-%d))"
            git push
          fi
```

- [ ] **Step 2: 시크릿 등록**

GitHub 레포 → Settings → Secrets and variables → Actions:
- Secrets: `SEOUL_API_KEY`, `VISITSEOUL_API_KEY`
- Variables: `VISITSEOUL_CATEGORIES` (쉼표 구분)

- [ ] **Step 3: 수동 실행으로 확인**

Actions 탭 → 배치 → Run workflow. 성공하면 `data/` 갱신 커밋이 자동으로 올라온다.

- [ ] **Step 4: README 작성**

`README.md`:

```markdown
# seoulchi

서울에서 이번 주 / 지금 무슨 행사가 있는지 알려주는 웹앱.

- 설계: [`docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md`](docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md)
- API 실측: [`docs/api-findings.md`](docs/api-findings.md)

## 로컬 실행

```bash
npm ci
cp .env.example .env   # API 키 채우기
npm test
npm run batch          # data/*.json 생성
```

## 환경변수

| 이름 | 설명 |
|---|---|
| `SEOUL_API_KEY` | 서울열린데이터광장 인증키 |
| `VISITSEOUL_API_KEY` | 비짓서울 API 키 |
| `VISITSEOUL_CATEGORIES` | 수집 대상 카테고리 (쉼표 구분) |
| `LLM_PROVIDER` | `ollama` (로컬) \| `rule` (Actions) |
| `OLLAMA_HOST` | 기본 `http://localhost:11434` |
| `OLLAMA_MODEL` | 기본 `qwen3:8b` |

## 배치

매일 KST 06:00에 GitHub Actions가 돌며 `data/`를 갱신 커밋한다.
Actions 러너에서는 Ollama가 돌지 않으므로 `LLM_PROVIDER=rule`로 동작한다 —
LLM 코멘트가 필요해지면 `AnthropicProvider`를 추가한다.
```

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/batch.yml README.md
git commit -m "chore: GitHub Actions 배치 워크플로 추가

Actions 러너에서는 Ollama가 돌지 않으므로 LLM_PROVIDER=rule로 시작한다.
스펙 9-2의 '이관 시점 = provider 전환 시점' 결정에 따른다."
```

---

## 완료 조건

- [ ] `npm test` 전체 통과
- [ ] `npm run batch`가 `data/` 아래 5개 파일을 생성
- [ ] 두 번째 실행에서 비짓서울 상세 호출이 0에 수렴
- [ ] `docs/api-findings.md`에 스펙 14장의 미해결 항목 7개가 모두 해소되어 기록됨
- [ ] GitHub Actions 수동 실행 성공

## 다음 계획

`docs/superpowers/plans/` 아래에 **Plan 2: 웹앱(TanStack Start)** 을 작성한다.
Plan 1의 Task 14 Step 8에서 측정한 **파일 크기**가 Plan 2의 데이터 로딩 설계를
결정하므로, 반드시 Plan 1 완료 후에 작성한다.
