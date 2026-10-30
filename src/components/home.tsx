import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { chip, Chip } from '~/components/ui'
import { HOME_GROUPS, pageNumbers, type HomeSearch } from '~/lib/home-search'
import type { DayTab } from '~/lib/today'

export const DAY_LABELS: Record<DayTab, string> = { today: '오늘', tomorrow: '내일', weekend: '이번 주말' }

/** 날짜 탭 · 목적 칩 · 내 주변 · 자치구. 모든 변경이 navigate(push)라 뒤로가기가 되돌린다 */
export function HomeControls({
  search, districts, nearDisabledReason,
}: { search: HomeSearch; districts: string[]; nearDisabledReason?: string }) {
  const navigate = useNavigate()
  // 조건이 바뀌면 다른 목록이다 — 1페이지로 돌아간다
  const patch = (p: Partial<HomeSearch>) => void navigate({ to: '/', search: { ...search, page: undefined, ...p } })

  // BrowseControls와 같은 이유: 프리렌더는 쿼리를 모른 채 굳으므로 첫 렌더는 필터 없음으로 그린다
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const shown: HomeSearch = hydrated ? search : {}

  return (
    <div id="filters" className="mt-section scroll-mt-200 space-y-100">
      <div className="flex gap-100" role="group" aria-label="날짜">
        {(['today', 'tomorrow', 'weekend'] as const).map((d) => (
          <Chip key={d} active={(shown.day ?? 'today') === d}
            onClick={() => patch({ day: d === 'today' ? undefined : d })}>
            {DAY_LABELS[d]}
          </Chip>
        ))}
      </div>
      <div className="flex gap-100 overflow-x-auto pb-050" role="group" aria-label="목적">
        <Chip active={shown.group === undefined} onClick={() => patch({ group: undefined })}>전체</Chip>
        {HOME_GROUPS.map((g) => (
          <Chip key={g} active={shown.group === g}
            onClick={() => patch({ group: search.group === g ? undefined : g })}>
            {g}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-100" role="group" aria-label="지역">
        {/* 권한 거부면 꺼진 모양 — 목록이 실제로 거리순이 아니다(BrowseControls와 같다) */}
        <Chip active={shown.near !== false && nearDisabledReason === undefined}
          onClick={() => patch({ near: search.near === false ? undefined : false })}>
          ⊙ 내 주변
        </Chip>
        <select
          value={shown.district ?? ''}
          onChange={(e) => patch({ district: e.target.value === '' ? undefined : e.target.value })}
          aria-label="자치구"
          className={chip()}
        >
          <option value="">자치구 전체</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      {nearDisabledReason !== undefined && (
        <p className="text-body text-warning-text">{nearDisabledReason}</p>
      )}
    </div>
  )
}

/** 0건의 응답: 켜진 필터마다 그것을 푼 링크. 날짜가 오늘이 아니면 오늘로 돌아가는 링크 */
export function HomeEmpty({ search }: { search: HomeSearch }) {
  const links: Array<{ key: string; label: string; to: HomeSearch }> = []
  if (search.group) links.push({ key: 'group', label: `'${search.group}' 풀기`, to: { ...search, group: undefined } })
  if (search.district) links.push({ key: 'district', label: `'${search.district}' 풀기`, to: { ...search, district: undefined } })
  if (search.day) links.push({ key: 'day', label: '오늘 보기', to: { ...search, day: undefined } })

  return (
    <div className="mt-600 py-400 text-center">
      <p className="text-title-card">조건에 맞는 행사가 없습니다</p>
      {links.length > 0 && (
        <ul className="mt-200 space-y-100 text-body">
          {links.map((l) => (
            <li key={l.key}>
              <Link to="/" search={l.to} className="text-ink-muted underline">{l.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 번호 페이지. 링크라 새로고침·뒤로가기가 되고, 넘기면 목록 머리(#list)로 간다 */
export function HomePager({ search, page, pages }: { search: HomeSearch; page: number; pages: number }) {
  const to = (n: number) => ({ ...search, page: n === 1 ? undefined : n })
  return (
    <nav aria-label="페이지" className="mt-200 flex flex-wrap items-center justify-center gap-100">
      {page > 1 && (
        <Link to="/" search={to(page - 1)} hash="list" aria-label="이전 페이지" className={chip()}>‹</Link>
      )}
      {pageNumbers(page, pages).map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className="text-body text-ink-subtle">…</span>
        ) : (
          <Link key={n} to="/" search={to(n)} hash="list" aria-current={n === page ? 'page' : undefined}
            className={chip(n === page)}>
            {n}
          </Link>
        ),
      )}
      {page < pages && (
        <Link to="/" search={to(page + 1)} hash="list" aria-label="다음 페이지" className={chip()}>›</Link>
      )}
    </nav>
  )
}
