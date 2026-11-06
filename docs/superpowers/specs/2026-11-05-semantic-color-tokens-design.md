# 시맨틱 색 토큰 — 설계

2026-11-05. 사용자와의 대화에서 합의한 결과다. 조사 근거는 열 개 디자인 시스템의 1차 출처
(Primer, Atlassian, Carbon, Spectrum 2, Polaris, Material 3, Fluent 2, Radix, SEED v3, Toss TDS)이고,
그중 Spectrum 2를 기준으로 삼았다.

## 1. 왜

색 토큰 이름이 두 축으로 섞여 있다.

- `surface`·`ink`는 쓰임새로 지은 이름이고, 속성(바탕인지 글자인지)이 이름에 없다.
- `{scale}-subtle-bg`·`{scale}-text`는 색 스케일 이름에 자리를 붙인 이름이다.
- 그 결과 같은 개념에 단어가 둘이다. 글자는 `ink`와 `text`, 바탕은 `surface`와 `bg`로 갈린다.
- neutral에서는 두 축이 겹친다. `ink`(900)와 `neutral-text`(800)가 따로 있고, 무엇을 쓸지 이름으로 알 수 없다.
- 클래스에서 말이 반복된다. `text-warning-text`, `bg-error-subtle-bg`, `border-neutral-border`처럼.
- 원시 스케일 이름(`neutral`, `accent`, `error`)이 역할 단어다. 원시 색인지 역할인지 이름만으로는 구별되지 않는다.

## 2. 결정 (사용자)

- 1층(원시 색)은 색 이름으로 부른다.
- 2층(시맨틱)은 Spectrum 2처럼 역할이 앞에 온다. 다만 Spectrum의 `{역할}-{속성}-color-{상태}`를 그대로 쓰지 않고,
  속성은 Tailwind 유틸리티 접두사(`bg-`, `text-`, `border-`)에 맡긴다.
- 기본 회색 UI의 역할 이름은 `neutral`이다.
- 강도 단어는 `subtle`, `muted`, `solid`다.
- 의도 이름은 `danger`, `success`다(`warning`, `info`는 그대로).
- neutral 글자는 세 단계(기본, `muted`, `subtle`)를 유지한다.
- 바탕 층 토큰(raised, overlay 등)은 보류한다.

## 3. 1층: 원시 색

| 지금 | 바꾼 이름 | 근거 |
| --- | --- | --- |
| `accent-*` | `orange-*` | 500 `#fa9216`, 600 `#d27800` |
| `neutral-*` | `gray-*` | |
| `error-*` | `red-*` | 600 `#dd0016` |
| `warning-*` | `yellow-*` | 500 `#ccb500` |
| `success-*` | `green-*` | |
| `info-*` | `blue-*` | |

값과 stop(50~950)은 바꾸지 않는다.

## 4. 2층: 시맨틱 토큰

문법은 `{역할}[-{강도}][-{상태}]`다. 역할은 `accent`, `neutral`, `danger`, `warning`, `success`, `info` 여섯 개다.
`{r}`은 역할 자리다. 괄호 안은 원시 stop이고, 앞이 라이트, 뒤가 다크다.

### 바탕 (`bg-*`)

| 클래스 | accent·danger·warning·success·info | neutral | 지금 이름 |
| --- | --- | --- | --- |
| `bg-base` | | `#ffffff` / 950 | `surface` |
| `bg-{r}-subtle` | 50 / 950 | 50 / 950 | `{r}-subtle-bg` |
| `bg-{r}-subtle-hover` | 100 / 900 | 100 / 900 | `{r}-hover-bg` |
| `bg-{r}-solid` | 600 / 600 | **900 / 100** | `{r}-solid` |

### 글자 (`text-*`)

| 클래스 | accent·danger·warning·success·info | neutral | 지금 이름 |
| --- | --- | --- | --- |
| `text-neutral` | | 900 / 100 | `ink` |
| `text-neutral-muted` | | 600 / 300 | `ink-muted` |
| `text-neutral-subtle` | | 500 / 400 | `ink-subtle` |
| `text-{r}` | 800 / 300 | | `{r}-text` |
| `text-{r}-strong` | 900 / 200 | | `{r}-text-strong` |
| `text-on-{r}` | 지금 `on-solid` 값 그대로 | `bg-base`와 같은 값 | `{r}-on-solid` |

### 선 (`border-*`)

| 클래스 | 모든 역할 | 지금 이름 |
| --- | --- | --- |
| `border-{r}` | 200 / 800 | `{r}-border` |
| `border-{r}-solid` | `bg-{r}-solid`와 같은 값 | 없음 (지금은 `border-ink`) |

### 모양이 다른 곳

모양이 역할마다 다른 곳은 두 군데다. 둘 다 의도한 것이다.

1. **neutral만 글자가 세 단계다.** 다른 역할은 `text-{r}`, `text-{r}-strong` 두 단계다.
   `neutral-text`(800)와 `neutral-text-strong`(900)은 없앤다. 화면에서 쓰는 곳이 0건이다(2026-11-05 grep).
2. **neutral의 solid는 회색이 아니라 잉크색이다.**
   - 지금 화면의 진한 채움은 `bg-ink text-surface border-ink` 조합이다. 쓰는 곳은 solid 버튼, 켜진 칩, 탭 밑줄이다.
   - 지금 `neutral-solid`(600)는 쓰는 곳이 0건이다.
   - 그래서 `neutral-solid`가 그 자리를 맡고, 다크에서는 100으로 뒤집힌다.
   - 다른 역할의 solid는 테마와 무관하게 고정이다(지금과 같다).

### `strong`에 대해

`strong`은 정한 강도 단어(`subtle`/`muted`/`solid`) 밖에 있다. 그래도 남긴다. 옅은 바탕 위의 더 진한 글자
(콜아웃 제목)를 맡을 단어가 세트 안에 없다.

## 5. Tailwind에서

- **시맨틱 토큰은 유틸리티별 이름공간에 둔다.** 바탕은 `--background-color-*`, 글자는 `--text-color-*`, 선은 `--border-color-*`다.
  - 그래서 `--background-color-base`는 `bg-base`만 만들고 `text-base`는 만들지 않는다.
  - 근거는 tailwindcss 4.3.3 `dist/lib.mjs`다. 거기서 `bg`는 `["--background-color","--color"]`, `text`는 `["--text-color","--color"]`, `border`·`divide`는 `--border-color`를 읽는다. 공식 문서의 이름공간 표에는 나오지 않는다.
- **원시 색은 `@theme` 밖의 `:root`에 둔다.** 그러면 `bg-orange-500` 같은 클래스가 아예 생기지 않는다.
  - 지금은 "프리미티브를 화면에서 직접 쓰지 마세요"(DESIGN.md)가 말로만 있다. 이 변경 뒤에는 빌드가 막는다.
- `--color-*: initial`과 `white`·`black`·`transparent`·`current`는 그대로 둔다.
- 시맨틱 값은 hex를 직접 쓰지 않고 원시 색을 `var()`로 가리킨다. 지금 `ink`·`surface`·`on-solid`에 남아 있는 hex 리터럴이 대상이다.
- 다크는 지금처럼 `.dark`에서 시맨틱 변수만 다시 선언한다.

## 6. 범위

함께 바뀌는 곳은 다음과 같다.

- `src/styles/theme.css`
- 화면 클래스. 2026-11-05 기준 시맨틱 클래스 약 80건이다(플레이그라운드 포함). 많은 순서로 `text-ink-subtle` 23, `text-ink-muted` 11, `border-neutral-border` 10이다.
- `src/components/ui.tsx`의 `BUTTON_TONE`, `chip()`, `CALLOUT_TONE`과 `src/routes/__root.tsx`의 탭 밑줄
- 플레이그라운드
  - `src/lib/design-tokens.ts`의 파서가 읽는 블록과 이름 규칙이 바뀐다. 원시 색은 `:root`에서, 시맨틱은 세 이름공간에서 읽는다.
  - `contrastPairs`, `lightVars`
  - `src/routes/playground.tsx`
  - 테스트: `tests/lib/design-tokens.test.ts`, `tests/styles/foundation.test.ts`
- 사본: `docs/design/palette.css`, `docs/design/palette.figma.json`
- `DESIGN.md` "색" 장. 표, "표면과 잉크" 절, "쓰는 법", "고칠 때"를 새 이름으로 바꾼다.

## 7. 비목표

- 값 변경. 바뀌는 값은 `neutral-solid` 하나뿐이고, 지금 쓰는 곳이 없다.
- 바탕 층 토큰(raised, sunken, overlay)
- `disabled`·`placeholder` 같은 용도 이름 글자색. 화면에 그런 자리가 생기면 단계가 아니라 용도 이름으로 더한다.
- 쓰는 곳이 없는 토큰 정리. 0건인 토큰은 다음과 같다.
  - `*-subtle-hover` 전부
  - `info` 역할 전체
  - `accent`의 글자·선
  - 이번에는 모양을 맞추는 것만 하고 지우지 않는다.
- 카테고리 폴백 8색(`src/lib/colors.ts`)
- 아래 8장의 다크 문제

## 8. 이 조사에서 알게 된 것 (이번 범위 밖)

**다크에서 `neutral-subtle-bg`와 `surface`가 같은 색이다.** 둘 다 950(`#09080b`)이다.
그래서 다크에서는 `bg-neutral-subtle`를 깔아도 페이지 바탕과 구별되지 않는다. 쓰는 곳은 4건이다.
값 결정이라 이번 이름 변경과 섞지 않는다.

## 9. 검증

- 옛 이름이 `src/`와 `tests/`에 남지 않는다.
  - 옛 이름: `surface`, `ink*`, `*-subtle-bg`, `*-hover-bg`, `*-text`, `*-on-solid`, `*-border`
  - 스케일 이름: `accent-`, `neutral-`, `error-`, `warning-`, `success-`, `info-` 뒤에 숫자가 붙은 것
- 빌드한 CSS에 `bg-base`, `text-neutral-muted`, `border-neutral`이 있고, `bg-orange-500` 같은 원시 색 클래스는 없다.
- `.dark` 아래에서 `bg-base`가 950으로 바뀐다. 빌드 결과물이나 플레이그라운드 화면으로 확인한다.
- 대비 검사가 라이트·다크 모두 4.5 이상이다. 쌍은 33에서 29로 줄어든다 — `neutral-text`·`neutral-text-strong` 쌍이 토큰과 함께 없어진다(계획 Task 1).
- 홈, 상세, 플레이그라운드 화면이 바꾸기 전과 픽셀상 같다. 예외는 `neutral-solid`를 새로 쓰기 시작한 곳뿐이고, 그곳도 지금의 `ink`와 같은 값이라 화면은 같아야 한다.

## 10. 빌더에게 남긴 것

- 파서가 이름공간 세 개를 읽는 방식과 `ColorToken` 모양의 변경
- 클래스 일괄 치환 방법(스크립트 또는 sed)
- 플레이그라운드에서 원시 색과 시맨틱을 보여 주는 표 배치
- `palette.figma.json`의 변수 이름 형식
