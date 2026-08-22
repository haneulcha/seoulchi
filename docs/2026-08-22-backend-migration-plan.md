# 백엔드 이관 로드맵 (2026-08-22)

정적 JSON 캐시로 돌아가는 현재 앱에 **서버와 DB를 붙이는** 계획입니다.

이 문서의 목적은 두 가지입니다.

1. **목표 도메인 모델**을 정해둔다 — 어디로 가는지
2. **단계를 나눈다** — 어떤 순서로, 왜 그 순서인지

> **전제: 이 이관의 1차 목적은 백엔드 학습입니다.**
> 그래서 "가장 빠른 길"이 아니라 **"각 개념이 왜 필요한지 겪게 되는 순서"** 로 단계를 짰습니다.
> 이 전제가 바뀌면(예: 실사용자가 생겨서 속도가 우선이 되면) 단계를 건너뛰어도 됩니다.

관련 문서: [spec](superpowers/specs/2026-08-13-seoul-events-webapp-design.md) ·
[배치 파이프라인 계획](superpowers/plans/2026-08-13-batch-pipeline.md) · [api-findings](api-findings.md)

---

## 1. 원칙: 스키마를 미리 다 만들지 않는다

아래 4장의 목표 스키마를 1단계에 전부 구현하면, 배우는 건 SQL 문법뿐입니다.
**각 조각이 필요해지는 불편을 직접 겪은 뒤에 도입합니다.**

로드맵(6장)의 각 단계는 "이 단계 끝에 어떤 불편을 느끼는가"로 다음 단계와 이어져 있습니다.
그 불편이 안 느껴지면 다음 단계는 아직 필요 없는 겁니다.

---

## 2. 현재 상태 (2026-08-22 실측)

### 데이터

```
data/
  events/2026-W33.json, 2026-W34.json    주차별 이벤트 목록
  curated/2026-W33.json, 2026-W34.json   LLM 선별 결과 (picks + places)
  places.json                            장소 728건
  cache/visitseoul.json                  비짓서울 상세 응답 캐시 (스냅샷 아님)
  meta.json                              updatedAt, weekKey, counts
```

### 타입 (`src/types/item.ts`)

```
Item = EventItem | PlaceItem              kind로 갈리는 discriminated union

BaseItem   id(/^(sc|vs)-.../) · source · title · summary · category · district
           place(문자열) · address · lat · lng · imageUrl · linkUrl
           isFree · fee · subwayInfo · tags · mergedFrom[]

EventItem  kind:'event'  + startDate · endDate
PlaceItem  kind:'place'  + useTime · closedDays · hours(ParsedHours | null)
```

### 파이프라인 (`src/pipeline/`)

```
fetch → hydrate → normalize → merge → score → curate → emit
```

- `merge.ts` — `dedupeKey = kind|정규화(title)|정규화(place)`.
  `enrich()`는 **빈 값만** 채우고, **인자 순서가 우선순위**(서울시가 기준선)
- `score.ts` — `WEIGHTS` 8개 + `MAJOR_ORGS` 화이트리스트.
  `selectCandidates()`가 점수를 계산한 뒤 **버리고** `EventItem[]`만 반환

### 현재 모델의 긴장 4가지

| 지점 | 무엇이 문제인가 |
|---|---|
| `id: /^(sc\|vs)-.../` | **소스가 도메인에 새어 들어온 유일한 지점.** 새 소스 추가 = 정규식 수정. 또 merge에서 서울시 id가 생존하므로, 서울시가 행사를 내리면 id가 `vs-`로 바뀌며 `/e/$id` URL이 깨진다 |
| `place: string` | Venue가 없다. dedupeKey가 문자열이라 "서울숲" vs "서울숲 가족마당"이면 갈라진다. `curated.places`(소개용 장소)와 `event.place`(행사 장소)가 서로 남남이다 |
| score를 버림 | 왜 이게 1위였는지의 근거가 **매주 소멸**한다. "화이트리스트 25점이 과한가"를 데이터로 답할 수 없다 |
| `PlaceItem`이 union 안에 | 서울식물원은 Event가 아니라 Venue다. 서로 다른 두 애그리게이트가 한 타입에 들어 있다 |
| 원본 미보존 | `data/cache/`는 재조회를 아끼는 캐시지 스냅샷이 아니다. 서울시 원본은 아예 안 남는다. → **영업시간 파싱률(517/728)을 올리려면 지금은 전체 재수집이 필요** |

---

## 3. 층을 셋으로 나눈다

계층을 나누는 기준은 기능이 아니라 **변하는 이유**입니다.

```
┌───────────────────────────────────────────────────────────────┐
│ 3층  노출 (Read Model)   weekly_edition / weekly_edition_item │
│      ▸ 변하는 이유: 화면이 바뀔 때, 랭킹 정책이 바뀔 때        │
└───────────────────────────────────────────────────────────────┘
             ▲  build (주 1회 배치가 만들어 굳힘)
┌───────────────────────────────────────────────────────────────┐
│ 2층  정규화 (Domain)     event · occurrence · venue           │
│      ▸ 변하는 이유: 우리 서비스가 답해야 할 질문이 늘 때       │
└───────────────────────────────────────────────────────────────┘
             ▲  map (소스별 Adapter = Anti-Corruption Layer)
┌───────────────────────────────────────────────────────────────┐
│ 1층  수집 (Raw)          source_snapshot                      │
│      ▸ 변하는 이유: 소스가 응답 형식을 바꿀 때                 │
└───────────────────────────────────────────────────────────────┘
             ▲  fetch
     서울시 API      비짓서울 API      (새 소스…)
```

화살표는 한 방향입니다. **아래 층은 위 층을 모릅니다.**
소스가 필드명을 바꿔도 2층 코드는 컴파일 에러조차 나지 않아야 합니다.

각 층이 없을 때 실제로 겪는 고통:

| 층 | 없으면 |
|---|---|
| 1층 | 파서를 고칠 때마다 API 전체 재수집. 소스가 과거 데이터를 안 주기 시작하면 영영 복구 불가. **남의 API는 우리 DB의 백업이 아니다** |
| 2층 | 화면 코드가 소스별 분기 범벅. 소스 추가 = 화면 수정 |
| 3층 | 요청마다 스코어링 재계산. 지난주 1위가 뭐였는지 재현 불가 |

---

## 4. 목표 스키마

```
   ┌──────────────────┐        ┌─────────────────────┐
   │ source_snapshot  │        │ event_source_link   │
   │ source           │◀───────│ source, external_id │
   │ external_id      │        │ event_id ───────┐   │
   │ payload jsonb    │        │ match_score     │   │
   │ fetched_at       │        └─────────────────┼───┘
   └──────────────────┘                          │ N:1
                                                 ▼
   ┌──────────────────┐  1:N   ┌───────────────────────┐
   │   occurrence     │◀───────│        event          │
   │ range daterange  │        │ id(uuid) · slug       │
   │ kind             │        │ title · title_norm    │
   └──────────────────┘        │ venue_id ────┐        │
                               │ venue_raw    │        │
                               │ provenance   │        │
                               └──────────────┼────────┘
                                              │ N:1
                                              ▼
                          ┌─────────────────────────────┐
                          │           venue             │
                          │ name · name_norm · geog     │
                          │ hours_raw / hours_parsed    │
                          └─────────────────────────────┘
                                              ▲
   ┌────────────────────┐  1:N  ┌─────────────┴───────────┐
   │  weekly_edition    │◀──────│  weekly_edition_item    │
   │ week_key · built_at│       │ rank · score            │
   │ algo_version       │       │ target: event | venue   │
   └────────────────────┘       │ score_breakdown · reason│
                                └─────────────────────────┘
```

### 1층 — source_snapshot

```sql
create table source_snapshot (
  source       text        not null,   -- 'seoul-culture' | 'visit-seoul' | ...
  external_id  text        not null,   -- 소스의 원래 id (svcid, cid)
  fetched_at   timestamptz not null,
  payload      jsonb       not null,   -- 손대지 않은 원본
  payload_hash text        not null,   -- 변경분만 하위 층에 전파
  primary key (source, external_id, fetched_at)
);
```

**이걸 빨리 시작할수록 좋습니다.** 오늘부터 쌓아야 3개월 뒤에 3개월치가 있습니다.
파서를 고쳤을 때 재수집 없이 backfill하는 유일한 방법입니다.

### 2층 — venue

```sql
create table venue (
  id          uuid primary key,          -- UUIDv7
  slug        text unique not null,      -- URL용. 소스 접두사 없음
  name        text not null,
  name_norm   text not null,             -- merge.ts의 normalizeForCompare
  address     text,
  district    text,
  geog        geography(point, 4326),
  subway_info text,

  -- PlaceItem에서 이동
  hours_raw       text,                  -- useTime 원문
  closed_days_raw text,                  -- closedDays
  hours_parsed    jsonb,                 -- {open, close, closedWeekdays}
  hours_status    text not null
    check (hours_status in ('parsed','failed','absent')),

  -- 장소 자체를 소개할 때만 채워짐
  summary   text,
  image_url text,
  category  text,

  provenance jsonb not null default '{}'
);
create index on venue using gist (geog);
```

**결정: `PlaceItem`과 "행사가 열리는 장소"를 하나의 Venue로 합친다.**

지금은 `curated.places`(소개용 6곳)와 `event.place`(문자열)가 서로 남남입니다.
합치면 "서울식물원 상세에서 지금 거기 열리는 행사 보기"가 생깁니다 —
**조회가 아니라 외출을 만드는** 종류의 연결입니다.

구분이 필요하면 플래그를 새로 두지 말고 링크 존재로 판별합니다.

```
venue_source_link 있음  →  소스가 콘텐츠로 준 장소 (소개 가능)
venue_source_link 없음  →  행사 문자열에서 파생된 이름뿐인 장소
```

### 2층 — event / occurrence

```sql
create table event (
  id         uuid primary key,
  slug       text unique not null,       -- /e/{slug}. 소스와 무관, 영구 불변
  title      text not null,
  title_norm text not null,
  summary    text,
  category   text not null,
  image_url  text,
  link_url   text,
  is_free    boolean,
  fee        text,
  tags       text[],

  venue_id   uuid references venue(id),  -- nullable
  venue_raw  text not null,              -- 원문 장소 문자열은 항상 보존

  provenance jsonb not null default '{}', -- {"image_url":"visit-seoul", ...}

  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,    -- 소스에서 계속 보이는가
  withdrawn_at  timestamptz              -- 소스에서 사라짐(취소) ≠ 기간 종료
);

create table occurrence (
  id         uuid primary key,
  event_id   uuid not null references event(id) on delete cascade,
  kind       text not null check (kind in ('continuous','discrete')),
  range      daterange not null,         -- [startDate, endDate]
  time_range text                        -- 회차형일 때 '19:30'. 지금은 항상 null
);
create index on occurrence using gist (range);
```

**`status` 컬럼이 없는 것이 의도입니다.** 종료 행사가 97.8%인 소스에서
"종료됨"을 저장하면 배치가 하루 안 돌 때 데이터가 썩습니다.
`range` vs `now()`로 계산합니다 — 지금 `run.ts`의 `today > start ? today : start`와 같은 논리입니다.

**Occurrence는 1단계에 나눌 필요가 없습니다.** 현재 소스가 회차를 안 주므로
event당 정확히 1행이 됩니다. `event.range` 컬럼으로 시작해도 됩니다.

> **분리 신호(실측할 것):** `startDate ~ endDate`가 3주인데 실제로는
> 매주 토요일만 열리는 행사가 데이터에 있는가.
> 지금 모델은 이걸 "3주 내내 열림"으로 뭉갠다.

### 2층 — 링크와 우선순위

```sql
create table event_source_link (
  source       text not null,
  external_id  text not null,
  event_id     uuid not null references event(id),
  match_score  numeric,                  -- 0.93
  match_method text not null,            -- 'auto' | 'manual' | 'exact'
  linked_at    timestamptz not null,
  primary key (source, external_id)      -- 한 소스 레코드는 한 Event에만
);

create table field_priority (
  field    text not null,
  source   text not null,
  priority int  not null,
  primary key (field, source)
);
-- ('lat','visit-seoul',1) ('lat','seoul-culture',2) ('summary','seoul-culture',1) ...
```

이 둘이 `mergedFrom` 배열과 `enrich()`를 대체합니다.
차이는 **명시적**이라는 것 — 지금 우선순위는 `run.ts`의 `groups.push()` 호출 순서에
암묵적으로 들어 있어서, 새 소스를 어디에 끼워 넣느냐가 조용히 결과를 바꿉니다.

### 3층 — weekly_edition

```sql
create table weekly_edition (
  id           uuid primary key,
  week_key     text not null,            -- '2026-W34'
  built_at     timestamptz not null,
  algo_version text not null,            -- WEIGHTS가 바뀌면 올린다
  llm_provider text,
  unique (week_key, built_at)            -- 같은 주를 여러 번 빌드할 수 있다
);

create table weekly_edition_item (
  edition_id      uuid not null references weekly_edition(id) on delete cascade,
  rank            int  not null,
  target          text not null check (target in ('event','venue')),
  event_id        uuid references event(id),
  venue_id        uuid references venue(id),
  score           int,
  score_breakdown jsonb,   -- {"startsThisWeek":30,"weekend":15,"majorOrg":25,...}
  reason          text,    -- LLM이 쓴 한 줄
  primary key (edition_id, target, rank),
  check (num_nonnulls(event_id, venue_id) = 1)
);
```

**edition은 불변 스냅샷입니다.** score를 event 컬럼에 넣지 않는 이유:
score는 도메인 사실이 아니라 **정책**이고 알고리즘 버전마다 값이 달라집니다.
edition으로 빼면 과거 재현, 알고리즘 A/B, "왜 이게 1위였나" 설명이 전부 따라옵니다.

`score_breakdown`이 지금 매주 사라지는 정보입니다.

`target`으로 event와 venue를 한 테이블에 담은 건 `curated`가 이미
`picks`와 `places`를 함께 내보내고 있어서입니다.

### 측정 (3층과 별개의 쓰기 모델)

```sql
create table interaction (
  id          uuid primary key,
  user_id     uuid,
  event_id    uuid references event(id),
  venue_id    uuid references venue(id),
  edition_id  uuid references weekly_edition(id),   -- ← 이게 핵심
  kind        text not null,   -- viewed | saved | map_opened | route_opened | shared
  occurred_at timestamptz not null
);
```

append-only 로그이며 애그리게이트가 아닙니다.
`edition_id`를 함께 남겨야 **"어떤 랭킹이 실제 외출을 만들었나"** 를 되짚어
스코어링을 데이터로 고칠 수 있습니다. 이게 없으면 알고리즘 개선이 영원히 감(感)입니다.

---

## 5. 현재 → 목표 매핑

| 현재 | 목표 | 비고 |
|---|---|---|
| `BaseItem.id` (`sc-`/`vs-`) | `event.slug` + `event_source_link` | **접두사 제거가 핵심.** 소스가 URL에서 사라진다 |
| `source` | `event_source_link.source` | 1:N이 된다 |
| `title` `summary` `category` `imageUrl` `linkUrl` `isFree` `fee` `tags` | `event.*` | 그대로 |
| `place` (문자열) | `event.venue_id` + `event.venue_raw` | 매칭에 실패해도 원문은 남는다 |
| `district` `address` `lat` `lng` `subwayInfo` | `venue.*` | 장소의 속성이므로 이동 |
| `startDate` `endDate` | `occurrence.range` (또는 `event.range`) | daterange + GiST |
| `mergedFrom: string[]` | `event_source_link` 행들 | 방향이 뒤집힌다 |
| `enrich()` 인자 순서 | `field_priority` + `provenance` | 암묵 → 명시 |
| `PlaceItem.useTime` `closedDays` `hours` | `venue.hours_raw` `closed_days_raw` `hours_parsed` `hours_status` | `hours: null` → `hours_status='failed'` |
| `scoreEvent()` 반환값 (버려짐) | `weekly_edition_item.score` `score_breakdown` | 보존 |
| `curated.picks[].reason` | `weekly_edition_item.reason` | 그대로 |
| `data/events/2026-W34.json` | `weekly_edition` 1행 + item N행 | |
| — | `source_snapshot` | 새로 생김 |
| — | `interaction` | 새로 생김 |

---

## 6. 동일성 판정 (merge.ts가 가야 할 곳)

새 소스를 붙일 때 **매칭 규칙이 소스 개수에 끌려가지 않게** 하는 설계입니다.

### 하지 말 것: 소스쌍(pairwise) 비교

```
        seoul ─────[규칙 A]───── visit
            ╲                    ╱
        [규칙 C]            [규칙 B]
                ╲            ╱
                 interpark

소스 4개 → 규칙 6개, 5개 → 10개
```

개수보다 심각한 건 **이행성이 깨진다**는 것입니다.
A가 `seoul == visit`, B가 `visit == interpark`, C가 `seoul != interpark`라고 판정하면
**처리 순서가 결과를 결정**합니다. 재현되지 않는 버그의 발생지입니다.

### 할 것: canonical 대상 비교

```
질문을 바꾼다
  ❌ "이 두 목록을 어떻게 합칠까?"        (집합 연산 · 배치 · 순서 의존)
  ✅ "지금 들어온 이 레코드 1건이 이미 아는 행사인가?"  (upsert · 순서 무관)

  seoul  ─┐
  visit  ─┼─→ [Adapter] ─→ [정규화] ─→ [매칭] ─→ Event 저장소
interpark ─┘                             ▲              │
                                         └──────────────┘
                                  (기존 Event의 현재 상태와 비교)
```

매칭 함수는 항상 하나입니다: `findMatch(candidate) → Event | null`.
소스가 10개가 되어도 시그니처가 안 바뀝니다.

**왜 매칭 함수가 소스를 몰라도 되는가** — 소스별 차이를 매칭 규칙 안에서 처리하지 않고
**매칭에 도달하기 전에 없애기** 때문입니다. 이것이 Adapter의 진짜 역할입니다.

```
서울시    좌표 없음        → Adapter: 장소명 지오코딩으로 채움
비짓서울  제목이 영문      → Adapter: title / title_alt 슬롯 분리
인터파크  제목에 "[1일권]" → normalize: 대괄호 토큰 제거

═══ 이 선을 넘으면 셋 다 같은 모양 ═══
{ title_norm, period, geo }   ← 매칭 함수는 출처를 알 필요가 없다
```

### 판정 절차

```
① Blocking      기간 겹침 && 좌표 500m 이내  → 2만 건 중 0~5건
② 신호별 점수    아래 가중치
③ 3구간 판정
```

```
 신호                     가중치
 ────────────────────────────────
 기간 겹침 비율             0.30
 좌표 거리 (0m=1, 1km=0)    0.30
 제목 정규화 유사도         0.30
 장소명 유사도              0.10
```

점수 계산 전 지름길:

```
✓ 확정 일치   같은 소스 + 같은 external_id        → 무조건 같은 Event (재수집분)
✗ 확정 불일치 같은 소스의 서로 다른 external_id   → 병합 금지
              소스가 이미 "다른 행사"라고 말한 것이므로 존중한다
```

구간:

```
0.85 이상   자동 병합
0.60~0.85   보류 — 별도 Event로 두되 match_candidate 기록 → 사람이 검토
0.60 미만   신규 Event
```

**자동 병합 임계값은 보수적으로.** 잘못 합치는 것이 잘못 나누는 것보다
되돌리기 어렵고 사용자 눈에도 더 나쁩니다(찾던 행사가 다른 이름으로 보임).

boolean으로 짜면 회색 구간이 조용히 한쪽으로 굴러갑니다.
canonical 방식도 이행성 모순을 없애주진 않습니다 — 다만
"후보 2건에 동시 매칭" 분기에 걸려 **감지되고 기록됩니다.** 그게 실제 이득입니다.

### 순서가 정하는 것은 UUID 하나뿐

```
정체성  먼저 들어온 레코드가 Event 행을 생성 → 하지만 결정되는 건 내부 UUID뿐
내용    필드마다 field_priority로 결정 → 나중에 온 비짓서울 좌표가 먼저 온 것을 이긴다
```

비교 대상은 "Event를 처음 만든 레코드"가 아니라 **Event의 현재 병합 상태**입니다.
그래야 Event가 풍부해질수록 다음 매칭이 좋아집니다.

### 한 소스에만 있는 레코드

**아무 특별 취급도 하지 않습니다.** Event 1건 + link 1건입니다.
"단독 소스 레코드"라는 별도 개념이 필요해졌다면 어딘가에서 소스가 도메인에 샌 것입니다.

나중에 다른 소스에서 같은 행사가 들어오면 link만 추가되고 **Event id가 유지**됩니다
→ URL·북마크·interaction 로그의 연속성이 지켜집니다.

정보가 부실한 것(좌표 없음 등)은 **노출/스코어링 문제**지 매칭 문제가 아닙니다.

### 되돌릴 수 있는 구조

```
잘못 병합했다면
  1층  raw payload 전부 살아있음                  ← 원본 손실 없음
  2층  link 삭제 → 해당 레코드로 Event 재생성(split)
  3층  다음 edition 빌드에 반영. 과거 edition은 그대로 보존
```

병합을 "덮어쓰기"가 아니라 **"링크 걸기"** 로 표현했기 때문에 되돌릴 수 있습니다.
사람이 내린 판정은 `manual_link_decision`으로 따로 기록해야 합니다 —
안 그러면 다음 배치가 사람의 수정을 자동으로 덮어씁니다.

---

## 7. 단계 로드맵

```
0  파일을 HTTP로 내보내기        DB 없음. 계약만 고정
   └ 배포까지                    "내 컴퓨터 밖에서 돈다"
          ↓ 느끼는 불편: 요청마다 파일 읽기. 배치와 서버가 같은 디스크를 봐야 함
1  edition을 DB로               읽기만. 응답 형태 동일
          ↓ 느끼는 불편: "토요일 오후 성수동"에 답할 수 없음. edition은 통짜 목록
2  event / venue / occurrence   정규화가 필요해진 이유를 몸으로 앎
          ↓ 느끼는 불편: 저장한 게 새로고침하면 사라짐
3  쓰기 · 사용자 · 인증          트랜잭션 · 멱등성 · 동시성
          ↓ 느끼는 불편: 배치 실패를 모름. 뭐가 느린지 모름
4  운영                          스케줄러 · 로그 · 메트릭 · 무중단 마이그레이션
```

### 0단계 — 아무 기능도 안 바뀌는 서버

```
GET /api/health              → {"ok":true}
GET /api/editions/:weekKey   → 현재 data/events/*.json 과 100% 동일한 JSON
GET /api/places              → data/places.json 그대로
```

프론트는 `import` → `fetch` 전환만. DB 없음, 인증 없음, 새 기능 없음.

- [ ] `server/` + Hono, 위 3개 라우트 (fs로 파일 읽어 그대로 반환)
- [ ] 프론트 fetch 전환 + 로딩/에러 상태
- [ ] Fly.io(또는 Railway) 배포, 실제 URL로 화면 확인

**완료 판정: 프론트 diff가 20줄 미만이고, 배포된 URL에서 화면이 똑같이 뜬다.**
화면이 하나도 달라 보이지 않는 것이 성공입니다.

> 배우는 것: HTTP 서버 · 라우팅 · 상태 코드 · CORS · 환경변수 · **배포**
> 핵심 교훈: **API는 데이터 형태가 아니라 계약이다.**
> 뒤에서 파일 → DB → 정규화로 전부 바뀌어도 계약이 유지되면 클라이언트는 모른다.

배포를 0단계에 넣은 것은 의도적입니다. 로컬에서만 도는 서버는 백엔드 공부의 절반입니다.

### 1단계 — Postgres에 edition 넣기

`weekly_edition` / `weekly_edition_item` **두 테이블만** 만듭니다.
event도 venue도 아직 없습니다. edition_item에 제목·이미지·날짜를 통째로 넣어도 됩니다(비정규화). 일부러.

```
배치:  emit()이 파일 대신 INSERT
서버:  GET /api/editions/:weekKey → SELECT
```

응답 JSON은 0단계와 **바이트 단위로 동일**해야 합니다.

> 배우는 것: 스키마 설계 · **마이그레이션 도구** · 커넥션 풀 · 기본 SQL · 트랜잭션
> 여기서 겪을 첫 진짜 문제: 배치 실행 중에 서버가 반쯤 쓰인 edition을 읽으면?
> → 트랜잭션과 "빌드 완료 표시"

### 2단계 — 정규화가 필요해지는 순간

화면에 필터를 붙여봅니다. 순서대로 시도할 것:

1. "이번 주 토요일에 열리는 무료 행사" — edition_item만으로 됨
2. "성수동 2km 이내" — 좌표가 item에 있으면 됨
3. **"이 장소에서 열리는 다른 행사"** — 여기서 반드시 막힘

3번에서 막혔을 때 `venue`를 만듭니다. 그때 4·5장이 설계도가 아니라 해답이 됩니다.
`merge.ts`의 `normalizeForCompare`가 이미 그 일의 절반을 하고 있습니다.

> 배우는 것: 정규화의 실질적 이유 · 조인 · 인덱스(`EXPLAIN`으로 있을 때/없을 때 비교)
> · N+1 문제 · PostGIS

### 3단계 — 쓰기

"이 행사 저장하기" 하나면 충분합니다. 읽기만 하던 서버에 쓰기가 들어오면 새 개념이 한꺼번에 옵니다.

- 사용자 식별 → 인증/인가, 세션 vs 토큰
- 버튼을 두 번 누르면? → **멱등성**
- 저장 수 카운터 → 동시성, 락
- `interaction` 로그 → 외출 측정

### 4단계 — 운영

배치를 서버에서 스케줄(cron), 실패 알림, 구조화 로그, 응답 시간 메트릭, 무중단 마이그레이션.

지루해 보이지만 주니어와 시니어를 가르는 건 대부분 여기입니다.

---

## 8. 스택

**처음에는 TypeScript를 유지합니다.** 도메인은 이미 알고 백엔드 개념이 새로운 상황인데
언어까지 바꾸면 무엇이 어려운 건지 구분이 안 됩니다.

| | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Hono** (또는 Fastify) | 얇아서 HTTP가 그대로 보인다. Next.js API Routes는 프레임워크가 너무 많이 대신해준다 |
| DB | **Postgres** | 이 도메인에 필요한 게 전부 있다 — daterange · PostGIS · jsonb · 전문검색 |
| DB 접근 | **Kysely** 또는 Drizzle | SQL 모양이 그대로 보인다 |
| 로컬 | Docker Postgres 하나 | |
| 배포 | Fly.io 또는 Railway | |

**첫 열 개쯤의 쿼리는 생 SQL로 씁니다.** 쿼리 빌더는 그다음에 도입해도 늦지 않습니다.

Go나 Spring 같은 다른 스택이 목표라면 **0~1단계를 TS로 끝내고 2단계에서 같은 API를
다른 언어로 다시 쓰는 것**을 권합니다. 계약이 고정돼 있으니 순수하게 언어/생태계 차이만 배웁니다.

### 하지 않을 것

- **인증부터 시작하기** — 가장 지루하고 도메인과 무관. 3단계까지 미룬다
- **마이크로서비스 · 메시지 큐 · k8s** — 이 규모에선 배우는 게 아니라 흉내
- **GraphQL** — 화면 하나에 edition 하나면 REST가 정답
- **Prisma (초기)** — 편한 대신 SQL을 안 배우게 된다
- **ORM 자동 마이그레이션에 의존** — 마이그레이션 파일을 직접 읽고 쓴다.
  프로덕션에서 데이터를 날리는 건 대개 여기다
- **4장 스키마를 1단계에 전부 구현** — 1장 원칙

---

## 9. 되돌리기 어려운 결정

| 결정 | 왜 어려운가 | 언제까지 |
|---|---|---|
| `id`에서 소스 접두사 제거 | URL이 이미 `/e/sc-12345`로 나가 있다. `event_source_link`에 옛 id를 남겨 영구 리다이렉트를 서빙할 수 있지만, 늦출수록 비싸다 | 2단계 |
| Venue를 Event에서 분리 | 나머지는 컬럼 추가로 해결되지만 이건 데이터 재구성이 필요. 728개 place와 event의 `place` 문자열을 매칭해야 한다(=6장) | 2단계 |
| score를 edition에 저장 | 안 하면 매주 근거가 소멸한다. 소급이 불가능하다 | 1단계 |
| `source_snapshot` 시작 | 소급이 불가능하다. 오늘부터 쌓아야 3개월 뒤에 3개월치가 있다 | 되도록 0단계 |

나머지(`interaction`, occurrence 분리, `field_priority`)는 급하지 않습니다.

---

## 10. 아직 정하지 않은 것

- **회차형 행사가 실제로 있는가** — `startDate~endDate`가 길지만 특정 요일만 열리는 행사.
  있으면 occurrence 분리가 1단계로 당겨진다. **실측 필요**
- **배치를 어디서 돌릴 것인가** — GitHub Actions 유지 vs 서버 cron.
  0단계에서는 유지, 1단계에서 DB에 쓰기 시작하면 결정해야 한다
- **인증 방식** — 3단계에서 결정. 그 전에 정하지 않는다
- **영업시간 파싱률(517/728)** — 규칙을 더 늘릴지는 `source_snapshot`이 생긴 뒤
  backfill로 싸게 실험할 수 있게 되면 그때 판단한다
