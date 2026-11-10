import type { ReactNode } from 'react'
import { Badge, PosterCard, Thumbnail, ThumbnailRow } from '~/components/cards'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import { ThemeToggle } from '~/components/ThemeToggle'
import { button, Callout, chip, Chip, ChipSelect } from '~/components/ui'
import { CATEGORY_GROUPS } from '~/lib/category'
import { categoryColor } from '~/lib/colors'
import { formatUpdatedAt } from '~/lib/dates'

/**
 * /playground의 컴포넌트 견본. 다섯 컴포넌트 파일의 export마다 하나씩이고,
 * 하나라도 빠지면 tests/components/playground-samples.test.ts가 실패한다.
 * 데이터는 고정 예시다 — data/를 읽으면 배치마다 화면이 바뀐다.
 */
export type Sample = { name: string; source: string; code: string; render: () => ReactNode }

/** OpenNowBadge는 브라우저 시각으로 판정한다. 하루 종일 열려 있어야 언제 열어도 보인다 */
const ALWAYS_OPEN = { open: '00:00', close: '24:00', closedWeekdays: [] }

/** view 견본의 고정 값. 도메인 컴포넌트가 만들어 넘기는 모양 그대로다 */
const CARDS = [
  {
    image: { fallbackColor: categoryColor('보러 가기') }, eyebrow: '전시', title: '서울 사진 축제 2026', subtitle: '서울시립미술관',
    meta: '중구 · 10:00~20:00', extra: <><span className="text-success">무료</span> · 11/8까지</>,
  },
  {
    image: { fallbackColor: categoryColor('보러 가기') }, eyebrow: '뮤지컬', title: '뮤지컬 〈지킬 앤 하이드〉',
    meta: '송파구', extra: <>VIP석 170,000원 · 11/12부터</>,
  },
  {
    image: { fallbackColor: categoryColor('체험하기') }, eyebrow: '체험', title: '한강 야간 걷기 체험',
    meta: '영등포구 · 19:00~21:00', extra: <><span className="text-success">무료</span> · 11/7</>,
  },
]

const SRC = {
  ui: 'src/components/ui.tsx',
  cards: 'src/components/cards.tsx',
}

export const SAMPLES: Sample[] = [
  {
    name: 'button', source: SRC.ui,
    code: `<a className={button('solid')}>…</a>  <button className={button('outline', 'sm')}>…</button>`,
    render: () => (
      <div className="flex flex-wrap items-center gap-100">
        <button type="button" className={button('solid')}>solid</button>
        <button type="button" className={button('outline')}>outline</button>
        <button type="button" className={button('solid', 'sm')}>solid sm</button>
        <button type="button" className={button('outline', 'sm')}>outline sm</button>
      </div>
    ),
  },
  {
    name: 'chip', source: SRC.ui,
    code: `<a className={chip(active)}>…</a>`,
    render: () => (
      <div className="flex gap-100">
        <span className={chip()}>꺼짐</span>
        <span className={chip(true)}>켜짐</span>
      </div>
    ),
  },
  {
    name: 'Chip', source: SRC.ui,
    code: `<Chip active={on} onClick={toggle}>무료</Chip>`,
    render: () => (
      <div className="flex gap-100">
        <Chip active={false} onClick={() => {}}>전체</Chip>
        <Chip active onClick={() => {}}>무료</Chip>
      </div>
    ),
  },
  {
    name: 'ChipSelect', source: SRC.ui,
    code: `<ChipSelect value={district} onChange={setDistrict} label="자치구"><option value="">모든 자치구</option>…</ChipSelect>`,
    render: () => (
      <ChipSelect value="" onChange={() => {}} label="자치구">
        <option value="">모든 자치구</option>
        <option value="중구">중구</option>
      </ChipSelect>
    ),
  },
  {
    name: 'Callout', source: SRC.ui,
    code: `<Callout tone="error" title="목록을 불러오지 못했습니다"><p>{message}</p></Callout>`,
    render: () => (
      <>
        <Callout tone="error" title="목록을 불러오지 못했습니다">
          <p>인덱스를 받지 못했습니다 (HTTP 404)</p>
          <button type="button" className={`mt-150 ${button('solid', 'sm')}`}>다시 시도</button>
        </Callout>
        <Callout tone="warning" title="목록이 오래됐습니다">
          <p>이 카탈로그는 2026-10-31까지를 담고 있고 오늘은 그 뒤입니다.</p>
          <p className="text-body-s">{formatUpdatedAt('2026-10-30T21:00:00Z')}</p>
        </Callout>
      </>
    ),
  },
  {
    name: 'PosterCard', source: SRC.cards,
    code: `<PosterCard image={{ src, fallbackColor }} eyebrow="전시" title="…" subtitle="기관명" meta="중구 · 10:00~20:00" extra={…} />`,
    render: () => (
      <div className="flex gap-150 overflow-x-auto">
        {CARDS.map((c) => <div key={c.title} className="w-40 shrink-0 md:w-48"><PosterCard {...c} /></div>)}
      </div>
    ),
  },
  {
    name: 'ThumbnailRow', source: SRC.cards,
    code: `<ThumbnailRow image={{ src, fallbackColor }} shape="poster" title="…" meta="…" extra={<Badge tone="success">지금 열림</Badge>} />`,
    render: () => (
      <div>
        {CARDS.slice(0, 2).map((c) => <ThumbnailRow key={c.title} {...c} shape="poster" />)}
        <ThumbnailRow
          image={{ fallbackColor: categoryColor('걸으러 가기') }} shape="photo" title="경복궁" meta="종로구 · 1.2km · 24시간"
          extra={<Badge tone="success">지금 열림</Badge>}
        />
      </div>
    ),
  },
  {
    name: 'Thumbnail', source: SRC.cards,
    code: `<Thumbnail src={src} alt="" fallbackColor={color} className="aspect-[2/3] w-20 rounded-050 object-cover" />`,
    render: () => <Thumbnail alt="" fallbackColor={categoryColor('보러 가기')} className="aspect-[2/3] w-14 rounded-050" />,
  },
  {
    name: 'Badge', source: SRC.cards,
    code: `<Badge tone="success">지금 열림</Badge>`,
    render: () => <Badge tone="success">지금 열림</Badge>,
  },
  {
    name: 'ItemImage', source: 'src/components/ItemImage.tsx',
    code: `<ItemImage src={item.imageUrl} alt="" category={item.group} className="aspect-[2/3] w-20 rounded-050 object-cover" />`,
    render: () => (
      <div className="flex gap-100">
        {CATEGORY_GROUPS.map((g) => (
          <ItemImage key={g} alt="" category={g} className="aspect-[2/3] w-14 rounded-050" />
        ))}
      </div>
    ),
  },
  {
    name: 'OpenNowBadge', source: 'src/components/OpenNowBadge.tsx',
    code: `<OpenNowBadge hours={place.hours} />`,
    render: () => <OpenNowBadge hours={ALWAYS_OPEN} />,
  },
  {
    name: 'ThemeToggle', source: 'src/components/ThemeToggle.tsx',
    code: `<ThemeToggle />`,
    render: () => <ThemeToggle />,
  },
]
