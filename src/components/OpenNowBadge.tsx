import { useEffect, useState } from 'react'
import { isOpenNow } from '~/lib/open-now'
import type { ParsedHours } from '~/types/item'

/**
 * "지금 열림" 배지. 이 값만 브라우저에서 계산한다(스펙 10-4) —
 * SSG라 빌드 시각으로 계산하면 거짓말이 된다. 서버 렌더와 첫 클라이언트 렌더는
 * 아무것도 내보내지 않고(hydration 불일치 방지), effect에서 판정한 뒤에 나타난다.
 * hours가 null이면(파싱 실패) 영원히 아무것도 렌더하지 않는다 — 원문(useTime)이 옆에 있다.
 */
export function OpenNowBadge({ hours }: { hours: ParsedHours | null }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(isOpenNow(hours, new Date())) // new Date()는 여기 브라우저 경계에서만
  }, [hours])

  if (!open) return null
  return (
    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      지금 열림
    </span>
  )
}
