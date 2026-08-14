# seoulchi

서울에서 이번 주 / 지금 무슨 행사가 있는지 알려주는 웹앱.

두 공공 API가 하루 1회만 갱신되므로 서버 런타임도 DB도 두지 않습니다.
배치가 데이터를 모아 `data/*.json`으로 커밋하고, 정적 웹앱이 그걸 읽습니다.

- 설계: [`docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md`](docs/superpowers/specs/2026-08-13-seoul-events-webapp-design.md)
- 구현 계획: [`docs/superpowers/plans/2026-08-13-batch-pipeline.md`](docs/superpowers/plans/2026-08-13-batch-pipeline.md)
- **API 실측: [`docs/api-findings.md`](docs/api-findings.md)** — 필드명·호출 규약의 유일한 근거

## 로컬 실행

```bash
npm ci
cp .env.example .env.local   # API 키 채우기
npm test
npm run batch                # data/*.json 생성
npm run batch -- 2026-W33    # 특정 주차 (지난 주차는 거절됨)
```

`.env`와 `.env.local`을 둘 다 읽습니다(나중 것이 이김). 실제 키는 `.env.local`에 두세요 —
둘 다 `.gitignore`에 있습니다.

**첫 실행은 40분 넘게 걸립니다.** 비짓서울 상세 2,199건을 받아야 하고, 그쪽이
레이트 리밋을 500으로 위장해 돌려주기 때문에 400ms 간격이 필요합니다.
캐시(`data/cache/visitseoul.json`)가 커밋돼 있으므로 이후 실행은 5분 안에 끝납니다.

## 환경변수

| 이름 | 설명 |
|---|---|
| `SEOUL_API_KEY` | 서울열린데이터광장 인증키 ([발급](https://data.seoul.go.kr)) |
| `VISITSEOUL_API_KEY` | 비짓서울 API 키 ([발급](https://api.visitseoul.net)) |
| `VISITSEOUL_CATEGORIES` | 수집 대상 카테고리 (쉼표 구분). 확정 목록은 `docs/api-findings.md` |
| `LLM_PROVIDER` | `ollama` (로컬) \| `rule` (Actions). 그 외 값은 던집니다 |
| `OLLAMA_HOST` | 기본 `http://localhost:11434` |
| `OLLAMA_MODEL` | 기본 `qwen3:30b` |

## 산출물

| 파일 | 내용 |
|---|---|
| `data/events/YYYY-Www.json` | 그 주에 열리는 행사 |
| `data/places.json` | "언제 가도 좋은 곳" 후보 (주에 묶이지 않음) |
| `data/curated/YYYY-Www.json` | 선별 12건 + 노출 장소 6곳 |
| `data/meta.json` | 갱신 시각, 사용된 provider, 소스별 건수 |
| `data/cache/visitseoul.json` | 상세 응답 캐시. 변경분만 다시 받기 위한 것 |

## 배치

매일 KST 06:00에 GitHub Actions가 돌며 `data/`를 갱신 커밋합니다.

**Actions 러너에서는 Ollama가 돌지 않으므로 `LLM_PROVIDER=rule`로 동작합니다.**
규칙 상위 12건이 그대로 선별되고 **한 줄 코멘트는 빈 문자열이 됩니다.**
코멘트가 필요해지면 `AnthropicProvider`를 추가합니다(스펙 9-2).

레포 Settings → Secrets and variables → Actions에 등록해야 합니다:

- Secrets: `SEOUL_API_KEY`, `VISITSEOUL_API_KEY`
- Variables: `VISITSEOUL_CATEGORIES`

## 개발

TDD로 진행합니다. 계획의 각 태스크에 테스트와 구현이 함께 들어 있습니다.

```bash
npm test                                   # 전체
npx vitest run tests/lib/week.test.ts      # 파일 하나
npx vitest run tests/lib/week.test.ts -t '연말 경계'
npm run probe                              # API 실측 스파이크
```
