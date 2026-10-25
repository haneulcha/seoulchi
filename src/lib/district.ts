/** 서울 25개 자치구. 하드코딩이 안전한 드문 경우 — 행정구역은 데이터보다 느리게 바뀐다 */
const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구',
] as const

const DISTRICT_RE = new RegExp(SEOUL_DISTRICTS.join('|'))

/**
 * 주소에서 자치구를 파생한다. 장소 원본에는 district가 0/733이지만
 * address가 714/733에 있고 705건에서 자치구가 뽑힌다(2026-08-31 실측).
 * places.json은 건드리지 않는다 — 슬림 투영과 카드 표시 시점에만 쓰는 파생값이다.
 * 실패 시 undefined — 좌표 규칙과 같은 태도(없으면 필드 생략).
 */
export function districtFromAddress(address?: string): string | undefined {
  return address ? DISTRICT_RE.exec(address)?.[0] : undefined
}
