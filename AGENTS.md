# AGENTS.md

서울에서 이번 주 / 지금 무슨 행사가 있는지 알려주는 웹앱.

## 현재 상태

**Plan 1(배치), Plan 2(웹앱 1차: 홈+상세), 탐색 모드(`docs/superpowers/plans/2026-08-31-browse-mode.md`)가 모두 완료됐습니다.**

- 배치는 구현·테스트 완료입니다(`src/`, `scripts/`, `tests/` 존재, `npm test` 초록).
  Plan 1 시절 산출 데이터(`data/events/2026-W33.json`(314건) 등)는 이후 일일 배치가 계속
  덮어썼습니다 — 아래 "산출 데이터"가 현재 값이고, 이 문단의 최초 수치는 낡았습니다.
- **배치는 매일 돕니다 — "한 번도 실행된 적이 없다"는 서술은 낡았습니다.**
  `.github/workflows/batch.yml`이 매일 KST 06:00 cron으로 배치를 돌리고,
  `github-actions[bot]`이 `data/`를 커밋한 이력이 **8건**입니다(가장 최근 2026-08-29,
  `git log --author=github-actions -- data/`로 2026-09-01 재확인 가능). Actions Secrets는
  이미 등록돼 정상 작동 중입니다.
- **커밋된 `data/`는 이제 규칙 기반(`rule`)입니다 — "로컬 Ollama로 만들었다"는 서술은 낡았습니다.**
  `data/meta.json`의 `llmProvider`가 **`"rule"`**입니다(2026-09-01 실측). 이 문서가 예고했던
  "Actions 이관 = provider 전환"이 이미 일어났다는 뜻입니다. `curated`의 `reason`은 빈
  문자열이고, "코멘트는 한국어로 달려 있다"고 가정하면 안 됩니다.
- **산출 데이터(2026-09-01 실측)**: `data/meta.json` — `weekKey` **`2026-W35`**,
  행사 **272**건 · 장소 **733**건, `anomalies` 3건, `unmappedCategories` 0건.
  탐색용 슬림 인덱스 `data/index.json` **975항목**(행사 242 + 장소 733,
  455KB raw / 60.7KB gzip)과 상세 SSG 전용 전체 필드 `data/catalog.json`
  **242항목**(184KB raw / 34.0KB gzip)이 새로 커밋돼 있습니다. 로컬에 API 키가 없어
  8주 전체가 아니라 커밋된 주간 파일 + `places.json`만으로 만든 축소판이라 미래 시작
  행사가 0건입니다 — 진짜 8주 데이터는 일일 Actions 배치가 채웁니다.
- **웹앱은 세 화면이 동작합니다: 홈(`/`)·탐색(`/browse`)·상세(`/e/$id`).** TanStack Start + SSG로
  `npm run build` 시 **977페이지**(상세 975 + `/browse` 1 + 홈 1, `find dist/client -name
  index.html | wc -l`로 셀 것 — 프리렌더 로그 줄 수는 ANSI 색상 코드 때문에 부풀어 보인다)가
  프리렌더됩니다. **"상세는 홈이 링크하는 것만 크롤되고 링크 안 된 id는 404"였던 Plan 2
  시절 서술은 낡았습니다** — 이제 카탈로그 전량이 프리렌더되므로 카탈로그에 있는 id는
  홈이 링크하든 안 하든 전부 정적 페이지가 있습니다. 카탈로그에도 없는 진짜 존재하지
  않는 id(예: `/e/sc-nope`)는 여전히 404이지만, 정적 호스팅이라 앱의 `NotFoundComponent`가
  아니라 정적 서버/호스트 쪽의 기본 404가 뜹니다(커스텀 404.html이 없음, 2026-09-01
  `python3 -m http.server`로 재확인). 빌드 시간은 **3회 평균 약 10.72초**(2026-09-01 실측:
  10.78s/10.62s/10.76s)이고, Plan 2의 19페이지 1.3초 대비 **페이지당 증분은 약 0.010초**로
  Plan 2가 추정한 0.017초보다 낮습니다. 페이지 수는 여전히 빌드 시간의 지배 항이 아닙니다.
- **빌드 산출은 `dist/`가 아니라 `dist/client/`입니다.** 정적 배포 대상이 그쪽이고,
  프리렌더 HTML·에셋·정적 서버 함수 캐시(`__tsr/staticServerFnCache/`)가 전부 그 아래 있습니다.
  `dist/server/`는 빌드 중간 산출이라 배포하지 않습니다.
  프리렌더 HTML에는 개행이 없어 BSD `grep`이 바이너리로 판단하고 조용히 건너뜁니다 —
  **한글 검색에는 `grep -a`를 쓰세요.**
- **정적 서버 함수는 입력값별로 캐시됩니다**(Task 11·Task 13에서 실측 확인).
  `npx serve dist/client`로 정적 파일만 서빙해도 상세 975개가 각각 자기 데이터를 받습니다.
  서버 런타임 없이 동작한다는 뜻이고, 홈의 카드는 `<Link>`(클라이언트 네비게이션) 그대로입니다.
  근거는 Plan 2와 탐색 모드 계획의 "확인 결과" 절에 있습니다.
- **API 키는 로컬 파일이 아니라 GitHub Actions Secrets에 있습니다 — "실제 키는
  `.env.local`에 있다"는 서술은 낡았고 세션을 오도합니다.** 이 레포를 체크아웃한
  환경에는 `.env.local`이 **없습니다**(2026-09-01 `find . -maxdepth 1 -name ".env*"`
  확인 — `.env.example`만 있음). 실제 `SEOUL_API_KEY`·`VISITSEOUL_API_KEY`는 GitHub
  저장소의 **Actions Secrets**에만 등록돼 있고, `.github/workflows/batch.yml`이
  `secrets.SEOUL_API_KEY` / `secrets.VISITSEOUL_API_KEY`로 주입합니다(`LLM_PROVIDER=rule`도
  같은 워크플로에 하드코딩). 로컬에서 배치를 돌리려면 `.env.local`을 **직접 만들어
  채워야** 하고, 이미 채워진 로컬 키가 있다고 가정하고 계획을 세우면 안 됩니다.

문서는 넷입니다:

- 설계 스펙: `docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md`
- Plan 1 — 배치: `docs/superpowers/plans/2026-08-13-batch-pipeline.md` (16 태스크, **완료된 이력 문서**)
- Plan 2 — 웹앱 홈+상세: `docs/superpowers/plans/2026-08-18-webapp-home-detail.md` (Task 0~11 총 12개, **완료된 이력 문서**).
  이 계획의 **"확인 결과" 절**에 TanStack Start 설치 버전(1.167.29)의 실제 API 표면이 적혀 있습니다 —
  서버 함수 검증 메서드는 `.inputValidator`가 아니라 **`.validator`**입니다(`inputValidator`는 `@deprecated`).
- **API 실측 결과: `docs/api-findings.md`** — 필드명·호출 규약·건수의 유일한 근거.
  API 응답에 대한 가정을 코드에 넣기 전에 반드시 여기를 봅니다.

**계획 문서가 진실의 원천입니다.** 코드를 쓰기 전에 해당 태스크를 읽으세요.
태스크에는 테스트 코드와 구현 코드가 전부 들어 있고, 결정의 근거도 함께 적혀 있습니다.

Plan 1이 먼저였던 이유: Task 14에서 측정한 데이터 파일 크기가
앱의 데이터 로딩 설계를 결정하기 때문입니다. 데이터 모델은 **2층**입니다.

- **홈 = 주간 파일 통째 로드 + 전부 SSG.** 빌드 타임에만 읽으므로 클라이언트
  번들에 데이터가 한 건도 들어가지 않습니다(Task 11에서 `dist/client/assets/*.js`에
  place id 패턴이 없음을 확인).
- **탐색 = 8주 인덱스(`data/index.json`) + 클라이언트 필터.** 주 단위 슬라이스는
  탐색과 맞지 않기 때문입니다 — 주간 파일은 주마다 약 80%가 같은 행사이고
  (W35의 272건 중 217건이 2주 전 W33에도 있던 행사, 3주 합집합은 384건, 2026-08-31 실측),
  미래 시작 행사는 0건입니다(`score`가 주 단위로 자르므로). 인덱스는 목록·필터용
  슬림 투영이고, 전체 필드는 `data/catalog.json`(빌드 타임 전용, 상세 SSG의 원천)이 갖습니다.
- **현재 산출은 8주가 아니라 축소판입니다.** `data/index.json` 975항목(행사 242 + 장소 733,
  455KB raw / 60.7KB gzip), `data/catalog.json` 242항목 전체 필드(184KB raw / 34.0KB gzip).
  로컬에 API 키가 없어 커밋된 주간 파일 + `places.json`만으로 만들었고, 그래서 미래 시작
  행사가 0건입니다. 진짜 8주 데이터는 병합 후 일일 Actions 배치가 채웁니다 — 지금 인덱스를
  보고 "8주인데 왜 이번 주만 있지" 하고 헤매지 마세요.

## 아키텍처의 핵심: 왜 전부 정적인가

두 원본 API가 **하루 1회만 갱신**됩니다. 실시간 서빙의 이득이 없으므로
서버 런타임도 DB도 두지 않습니다.

```
서울시 문화행사 API + 비짓서울 API
        ↓  배치 (하루 1회: 로컬 → GitHub Actions)
   fetch → hydrate → normalize → merge → score → curate(LLM) → emit
        ↓
   data/*.json  (git 커밋 → 자동 재배포)
        ↓
   정적 웹앱 (TanStack Start, SSG)
```

이 결정에서 따라오는 것들:
- 원본 API가 죽어도 앱은 마지막 커밋된 JSON으로 멀쩡히 동작합니다
- 데이터 이력이 git에 남아 "지난주엔 뭐가 있었지"가 공짜입니다
- 나중에 DB가 필요해지면 `emit` 단계의 출력 대상만 바꿉니다 (JSON write → DB upsert)

## 알아둬야 할 도메인 사실

**두 소스는 대칭입니다.** 어느 한쪽이 보조가 아닙니다.
- 서울시 문화행사 — 공공 행사 *전량*. 좌표가 목록에 있어 한 번에 다 받습니다. 품질 편차가 큽니다.
- 비짓서울 — 관광 관점으로 선별됨. **목록에는 좌표·행사기간이 없고 `/contents/info` 상세에만 있습니다.**
  `cid` + `updt_dt_text`를 키로 캐시해 변경분만 상세를 호출합니다(정상 상태에서 호출량 ≈ 0).
  상세는 **`POST` + body `{cid, lang_code_id}`**입니다(GET은 405). 목록의 카테고리 필터는
  간헐적으로 500을 내므로 **재시도가 필수**입니다.

**두 소스 모두 아카이브를 포함합니다.** 서울시 19,486건 중 97.8%가 이미 종료된 행사이고,
비짓서울에도 2023년 축제가 그대로 조회됩니다. **종료일 필터 없이는 화면이 과거로 채워집니다.**
조회 단계에서는 거를 수 없습니다 — 서울시 API의 `DATE` 인자는 "그날 진행 중"이 아니라
시작일·종료일이 일치하는 행만 줍니다. 전량 받아서(20요청·10초) 코드에서 거릅니다.

**`Event`와 `Place`는 시간 의미가 다릅니다.** 행사는 "언제 하는가", 장소는 "언제 열려 있는가".
`place`가 존재하는 이유는 선별형 홈의 막다른 길("이번 주 맘에 드는 행사가 없음")을 메우기 위해서입니다.
`place`는 주에 묶이지 않으므로 주간 파일이 아니라 `data/places.json`에 따로 씁니다.

**LLM은 어댑터 뒤에 있습니다.** Ollama(로컬) ↔ 규칙만 사용을 `LLM_PROVIDER`로 전환합니다.
**Ollama는 GitHub Actions 러너에서 돌지 않으므로, Actions 이관 시점이 곧 provider 전환 시점입니다.**
이건 결함이 아니라 예정된 경로입니다.

## 이 프로젝트의 규칙

지키지 않으면 조용히 깨지는 것들입니다.

| 규칙 | 이유 |
|---|---|
| `id`는 `sc-{원본id}` / `vs-{cid}`. 콜론 금지 | 상세 라우트 `/e/$id`에 인코딩 없이 들어가야 함 |
| 주차 키는 ISO 8601 · 월요일 시작 · **KST** (`2026-W33`) | 배치가 쓰고 앱이 읽음. 어긋나면 없는 파일을 읽음 |
| 유효 시작일은 **`max(주 시작일, 오늘)`**. 지난 주차 배치는 거절 | 두 소스가 아카이브를 포함함. 주 시작일만 쓰면 월요일에 끝난 행사가 목요일 화면에 남음 |
| `today`는 순수 함수에 **인자로 넘김**. 내부에서 `new Date()` 금지 | 테스트가 실행 날짜에 따라 깨짐 |
| 좌표가 없으면 필드를 **생략**. `0`으로 채우지 않음 | (0,0)은 아프리카 앞바다 |
| `emit`은 **전부 검증한 뒤에** 쓰기 시작 | 조용히 빈 화면이 나가는 것보다 배치가 깨지는 게 나음 |
| LLM이 고른 id 중 후보에 없는 것은 버리고 규칙 상위로 채움 | 환각 방어 2겹. 화면이 절대 비지 않음 |
| 영업시간 파싱 실패 시 `null` + 원문 노출 | 실패를 숨기지 않음. 사용자가 직접 판단할 수 있게 |
| 알 수 없는 `LLM_PROVIDER`는 던짐 | 오타를 폴백으로 삼키면 코멘트가 왜 비었는지 알 수 없음 |
| `src/data/load.ts`·`src/types/files.ts`와 그 전이 의존(`src/types/item.ts`, `src/lib/category.ts`)은 `~` 별칭 대신 **상대 경로 import**를 유지 | `vite.config.ts`가 프리렌더 목록을 만들려고 `loadIndex`를 직접 import하는데, vite는 자기 config를 로드할 때 tsconfig paths를 풀지 않음. 별칭을 넣으면 빌드가 config 로드 시점에 깨짐. 이 네 파일 중 하나라도 별칭을 쓰면 체인 전체가 끊김 |

## 명령어

```bash
npm ci
cp .env.example .env      # API 키 채우기
npm test                  # 전체 테스트
npx vitest run tests/lib/week.test.ts              # 파일 하나
npx vitest run tests/lib/week.test.ts -t '연말 경계' # 테스트 하나
npm run probe             # API 실측 (Task 0)
npm run batch             # 배치 실행 → data/*.json
npm run batch -- 2026-W33 # 특정 주차
npm run dev               # 웹앱 개발 서버 (localhost:3000)
npm run build             # 정적 빌드 → dist/client/ (977페이지 프리렌더 — 카탈로그 전량)
npx serve dist/client     # 빌드 결과를 정적 파일로만 서빙해 확인
```

환경변수는 `.env.example` 참조. 배치 스크립트는 Node 네이티브
`--env-file-if-exists`로 `.env`와 `.env.local`을 순서대로 읽으므로 dotenv 패키지가 필요 없고,
GitHub Actions에서는 둘 다 없어도 주입된 환경변수로 동작합니다.
**로컬에 키를 채우려면 `.env.local`을 직접 만들어야 합니다** — 이 레포를 새로 체크아웃한
환경에는 그 파일이 없습니다. 실제로 항상 채워져 있는 키는 GitHub Actions Secrets뿐입니다
(위 "현재 상태" 참고). 둘 다 `.gitignore`됩니다.

## 작업 방식

- **TDD**: 실패하는 테스트 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋.
  계획의 각 태스크가 이 사이클로 쓰여 있습니다.
- **커밋**: Conventional Commits 접두사 + 한국어 본문. 본문에는 *왜* 그렇게 했는지를 씁니다.
- **게이트**: 계획에 "게이트"라고 적힌 태스크는 선행 확인 없이 시작하지 않습니다.
  (예: Task 4는 `docs/api-findings.md`에서 위도 필드가 `LAT`인지 `LOT`인지 확정된 뒤에 시작)
