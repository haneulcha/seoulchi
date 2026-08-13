# API 실측 결과 (2026-08-13)

Task 0 스파이크(`npm run probe`)와 추가 측정으로 확인한 사실입니다.
추측은 넣지 않았습니다. 확인 못 한 것은 "확인 실패"라고 적었습니다.

---

## 서울시 문화행사 (culturalEventInfo)

- **총 건수: 19,486** — 페이지 1000으로 **20 요청**에 전량 수집 (약 10초)
- 필드 목록 (실제 응답 그대로):

  ```
  CODENAME, GUNAME, TITLE, DATE, PLACE, ORG_NAME, USE_TRGT, USE_FEE,
  INQUIRY, PLAYER, PROGRAM, ETC_DESC, ORG_LINK, MAIN_IMG, RGSTDATE,
  TICKET, STRTDATE, END_DATE, THEMECODE, LOT, LAT, IS_FREE, HMPG_ADDR, PRO_TIME
  ```

  계획이 몰랐던 필드: `INQUIRY`(문의처), `RGSTDATE`(등록일), `TICKET`, `THEMECODE`, `PRO_TIME`, `DATE`(`STRTDATE~END_DATE`의 문자열 사본).

- **이미지 필드: `MAIN_IMG` 존재. 19,486건 전부 채워져 있음(100%).**
  샘플: `https://culture.seoul.go.kr/cmmn/file/getImage.do?atchFileId=401a984b98ff4af8a57122219ee0d591&thumb=Y`

- **위도 필드: `LAT`가 위도, `LOT`가 경도 — 확정.**
  전량 기준 실측 범위:

  | 필드 | 최소 | 최대 | 판정 |
  |---|---|---|---|
  | `LAT` | 36.484 | 37.691 | 서울 위도대(37.4~37.7) → **위도** |
  | `LOT` | 126.774 | 127.335 | 서울 경도대(126.8~127.2) → **경도** |

  샘플 대조: 강동아트센터 `LAT=37.5512, LOT=127.1573` — 실제 강동구 상일동 좌표와 일치.
  (`LAT` 최소 36.484는 서울 밖 이상치가 섞인 것. 위/경도 구분에는 영향 없음.)

- 좌표 보유율: **18,957 / 19,486 (97.3%)**
- 날짜 형식: `STRTDATE` = `"2026-12-24 00:00:00.0"`, `END_DATE` 동일 형식.
  앞 10자만 잘라 쓰면 되고, **19,486건 전부 파싱 성공(100%)**
- `IS_FREE`는 `"무료"` / `"유료"` 문자열

### `DATE` 요청 인자: 진행 중 필터로 쓸 수 없음

`culturalEventInfo`는 선택 요청 인자 `CODENAME` / `TITLE` / `DATE`를 받습니다.
`DATE`는 동작하지만 **`STRTDATE` 또는 `END_DATE`와 문자열 앞부분이 일치하는 행만** 거릅니다.

| 요청 | 결과 |
|---|---|
| 없음 | 19,486 |
| `DATE=2026-08-13` | **12** — 시작일이 08-13이거나 종료일이 08-13인 행만 |
| `DATE=2026-08` | 353 — 8월에 시작하거나 8월에 끝나는 행만 |
| `CODENAME=전시/미술` | 326 |

**"그날 진행 중"이 아닙니다.** 2026-W33에 실제로 겹치는 행사는 295건인데
`DATE=2026-08-13`은 12건만 줍니다. `07-01~09-30` 같은 장기 행사는
`DATE=2026-08`에도 잡히지 않습니다.

→ **조회 단계 날짜 필터는 포기하고 전량(20요청·약 10초) 수집 후 코드에서 거릅니다.**
전량 수집이 충분히 싸므로 손해가 없습니다.

### 주의: 대부분이 과거 데이터

**19,065건(97.8%)이 이미 종료된 행사입니다.** 이 API는 아카이브를 포함합니다.
2026-W33(08-10~08-16)에 겹치는 것은 **295건**뿐입니다.

2026-W33 카테고리 분포:

```
교육/체험(120) 전시/미술(97) 콘서트(14) 클래식(12) 기타(10) 연극(9)
뮤지컬/오페라(9) 축제-문화/예술(7) 축제-기타(4) 축제-전통/역사(3)
무용(2) 영화(2) 국악(2) 축제-관광/체육(2) 독주/독창회(1) 축제-자연/경관(1)
```

---

## 비짓서울

### 인증·호출 규약 (계획과 다름)

| 엔드포인트 | 메서드 | 결과 |
|---|---|---|
| `GET /category/list` | GET | 200 |
| `POST /contents/list` | POST + body | 200 |
| `POST /contents/info` | **POST + body `{cid, lang_code_id}`** | 200 |
| ~~`GET /contents/info?cid=`~~ | GET | **405 Method Not Allowed** |
| ~~`POST /contents/info?cid=`~~ | POST + 쿼리스트링 | **400 Bad Request** |
| ~~`POST /contents/standard/list`~~ | POST | **404 Not Found** |

**계획의 상세 호출(GET + 쿼리스트링)은 틀렸습니다.** `cid`를 body에 실은 POST만 통합니다.

### `/contents/standard/list`: 사용 불가

**404입니다. 존재하지 않는 엔드포인트입니다.**
→ Task 6의 게이트 해소: **`cid` + `updt_dt_text` 캐시 기반 상세 hydrate를 그대로 구현합니다.** 벌크 조회 우회로는 없습니다.

### 카테고리 트리

`GET /category/list`는 **61개**를 반환하며 `ctgry_path`가 **영문**입니다
(`"Culture > Cultural Facilities"`). 반면 `/contents/list`의 `cate_depth`는 `lang_code_id: 'ko'`로 요청하면 **한글**입니다(`" 축제/공연/행사 > 축제"`).

⚠️ **`ctgry_path`와 `cate_depth` 모두 선행 공백이 있습니다.** `trim()` 필수.

레벨1 카테고리와 건수(실측):

| `com_ctgry_sn` | 경로 | 건수 |
|---|---|---|
| `Cv7s8m5` | Festivals/Events/Performances (축제/공연/행사) | **1,188** |
| `Ca0o2d4` | Culture (문화관광) | **733** |
| `Cl9s3y9` | Cuisine (음식) | 1,267 |
| `Cu8e6t5` | Shopping (쇼핑) | 298 |
| `Cc9i5o2` | Experience Programs (체험 프로그램) | 122 |
| `Ca1z6p7` | History (역사) | **88** |
| `Co6c2n2` | Nature (자연) | **68** |
| `Ch4v8z7` | Accommodations (숙박) | 17 |

주요 하위 카테고리:

```
Cd4y5u1  Festivals/Events/Performances > Festivals        754
Cf9q1q4  Festivals/Events/Performances > Events           119
Cb2b0t2  Festivals/Events/Performances > Performances      28
Cu9u5z7    └ Events > Exhibitions                          96
Cg1x6l1  Culture > Cultural Facilities                    480
Cr0q2v2    └ Cultural Facilities > Museums                 54
Ct9t6m8    └ Cultural Facilities > Art Museums/Galleries   53
Ce9z7g9  Culture > Parks                                   73
Cl5y4k0  Culture > Landmarks                               43
```

(상위 건수가 하위 합과 일치하지 않습니다. 상위 카테고리에 직접 달린 항목이 있습니다.)

- 전체 콘텐츠 건수(필터 없음): **3,781**
- `page_size`는 기본 50, **200까지 지정 가능** (요청 시 실제 200건 반환)

### **수집 대상 카테고리 (확정)**

```
VISITSEOUL_CATEGORIES=Cv7s8m5,Ca0o2d4,Cc9i5o2,Ca1z6p7,Co6c2n2
```

= 축제/공연/행사(1,188) + 문화관광(733) + 체험 프로그램(122) + 역사(88) + 자연(68)
= **2,199건** = hydrate 초회 호출 수

음식(1,267)·쇼핑(298)·숙박(17)은 제외했습니다. "이번 주 무슨 행사가 있나"와
"언제 가도 좋은 곳"에 식당·백화점·호텔은 맞지 않습니다.

### `/contents/info` 응답 구조

`{ data: {...}, result_code, result_message }` — **`data`로 한 겹 래핑됩니다.**

상세 최상위 필드 (행사 항목 기준):

```
cid, lang_code_id, com_ctgry_sn, cate_depth, multi_lang_list, main_img,
relate_img, post_sj, sumry, schdul_info_bgnde, schdul_info_endde,
creat_dt_text, updt_dt_text, tag, extra, traffic, festival, post_desc
```

- `schdul_info_bgnde` / `schdul_info_endde`: **점 구분 형식** `"2023.05.26"` ~ `"2023.05.27"`.
  **행사성 항목에만 존재합니다.** 식당·시설 항목에는 아예 키가 없습니다
  → 계획대로 이 필드의 유무로 `kind: event | place`를 가릅니다.
- `traffic`: `{ adres, new_zip_code, new_adres, map_position_x, map_position_y, subway_info }`.
  **`map_position_y`가 위도(37.605), `map_position_x`가 경도(127.031)** — 계획과 일치.
- `tag`: 문자열 배열
- `extra`: **항목 종류마다 키 구성이 다릅니다.**
  - 행사(축제): `cmmn_telno, cmmn_hmpg_url, cmmn_hmpg_lang, cmmn_use_time, trrsrt_use_chrge, disabled_facility`
  - 식당: `cmmn_use_time, closed_days` 등 (`closed_days`가 여기 있음)
  - ⚠️ **`closed_days`는 행사 항목에 없습니다.** 옵셔널로 다뤄야 합니다.
- `trrsrt_use_chrge`: `"F"` = 무료 (계획과 일치)
- 목록 응답에는 좌표·행사기간이 **없습니다** (AGENTS.md 서술과 일치)

### ⚠️ 카테고리 필터 호출이 간헐적으로 500

`POST /contents/list`에 `com_ctgry_sn`을 넣으면 **약 30% 확률로 500 Internal Server Error**가
납니다. 같은 요청을 재시도하면 성공합니다. 서버 측 불안정입니다.

→ **Task 6의 `fetchList`에 재시도(백오프)가 필요합니다.** 재시도 없이는 배치가 임의로 깨집니다.
측정 시에는 250ms×시도횟수 백오프로 4회까지 재시도해 전부 성공했습니다.

### 데이터 신선도 문제

축제 카테고리 표본에서 **2023년 종료 행사**가 그대로 조회됩니다
(예: "2023 서울드럼페스티벌", `2023.05.26~2023.05.27`).
서울시 소스와 마찬가지로 **아카이브가 섞여 있으므로 종료일 필터가 필수**입니다.

---

## 결론

| 항목 | 실측값 |
|---|---|
| `data/events/2026-W33.json` 예상 크기 | **약 171 KB** (서울시 295건, minified). 비짓서울 합산 시 **250~300 KB** 예상 |
| hydrate 초회 호출 수 | **약 2,199회** (확정 카테고리 기준). 120ms 간격이면 **약 4.5분** |
| hydrate 정상 상태 호출 수 | `updt_dt_text` 변경분만 → 하루 수십 건 이하 예상 |
| 서울시 fetch 요청 수 | **20회** (페이지 1000) |

주간 파일이 300KB 이하이므로 **앱이 주간 파일 하나를 통째로 로드해도 무방합니다.**
Plan 2(웹앱)의 데이터 로딩 설계에 이 수치를 씁니다.

## 스펙 14장 미해결 항목 처리

| # | 항목 | 상태 |
|---|---|---|
| 1 | API 키 발급 | ✅ 완료. `.env.local`에 보관(gitignore됨) |
| 2 | 이미지 필드 존재 여부 | ✅ `MAIN_IMG` 100% 존재 |
| 3 | `/contents/standard/list` 벌크 조회 | ✅ **404 — 불가.** 캐시 hydrate 유지 |
| 4 | 카테고리 수집 범위 | ✅ **확정**: `Cv7s8m5,Ca0o2d4,Cc9i5o2,Ca1z6p7,Co6c2n2` (2,199건) |
| 5 | 데이터 크기 | ✅ 주간 171KB(서울시), 합산 250~300KB 예상 |
| 7 | LAT/LOT 중 위도 | ✅ **`LAT`=위도 확정** |

## 계획을 고쳐야 하는 지점

1. **Task 6**: `/contents/info`는 `POST` + body. 계획의 GET 코드는 405로 실패합니다.
2. **Task 6**: `fetchList`에 500 재시도 필요.
3. **Task 6**: `cate_depth` `trim()` 필요 (선행 공백).
4. **Task 6**: `extra.closed_days`는 행사 항목에 없음 — 옵셔널.
5. **Task 8 (score)**: 두 소스 모두 종료된 행사가 대량으로 섞여 있음. 종료일 필터가 필수.
