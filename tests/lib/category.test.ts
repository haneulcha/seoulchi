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
