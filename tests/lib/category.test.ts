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
  '전시/미술': '보러 가기', '전시시설': '보러 가기', '박물관': '보러 가기', '미술관/화랑': '보러 가기',
  '기타전시시설': '보러 가기', '전시회': '보러 가기',
  // 체험·배움
  '교육/체험': '체험하기', '기타체험': '체험하기', '전통체험': '체험하기',
  '공예체험': '체험하기', '산업관광': '체험하기', '교육시설': '체험하기',
  '체험관광': '체험하기', '산사체험': '체험하기',
  // 공원·자연 (100% 장소)
  '도시공원': '걸으러 가기', '자연경관(산)': '걸으러 가기', '자연공원': '걸으러 가기',
  '웰니스관광': '걸으러 가기', '자연경관(하천)': '걸으러 가기', '자연관광': '걸으러 가기',
  '테마공원': '놀러 가기', '레저스포츠시설': '놀러 가기',
  // 역사·명소 (100% 장소)
  '랜드마크관광': '걸으러 가기', '기타문화관광지': '걸으러 가기', '문화관광': '걸으러 가기',
  '종교성지': '걸으러 가기', '사적지': '걸으러 가기', '성/문': '걸으러 가기', '고궁': '걸으러 가기',
  '근대건축물': '걸으러 가기', '고분/능': '걸으러 가기', '역사유적지': '걸으러 가기',
  '기타역사유적지': '걸으러 가기', '역사관광': '걸으러 가기',
  // 축제
  '축제': '놀러 가기', '축제/공연/행사': '놀러 가기', '축제-문화/예술': '놀러 가기', '축제-기타': '놀러 가기',
  '축제-전통/역사': '놀러 가기', '축제-관광/체육': '놀러 가기', '축제-자연/경관': '놀러 가기',
  '축제-시민화합': '놀러 가기',
  // 공연
  '콘서트': '보러 가기', '뮤지컬/오페라': '보러 가기', '연극': '보러 가기', '클래식': '보러 가기',
  '국악': '보러 가기', '무용': '보러 가기', '영화': '보러 가기', '공연시설': '보러 가기', '공연': '보러 가기',
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

  it('그룹은 5개 고정이고 픽스처가 5그룹을 전부 쓴다', () => {
    expect(CATEGORY_GROUPS).toHaveLength(5)
    const used = new Set(Object.values(FIXTURE))
    for (const g of CATEGORY_GROUPS) expect(used.has(g), g).toBe(true)
  })

  it('테마공원·레저스포츠시설은 걸으러가 아니라 놀러 가기다', () => {
    expect(categoryGroup('테마공원')).toBe('놀러 가기')
    expect(categoryGroup('레저스포츠시설')).toBe('놀러 가기')
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
