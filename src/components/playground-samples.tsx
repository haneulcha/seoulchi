import type { ReactNode } from 'react'
import { EventPosterCard, ListRow } from '~/components/cards'
import { ItemImage } from '~/components/ItemImage'
import { OpenNowBadge } from '~/components/OpenNowBadge'
import { ThemeToggle } from '~/components/ThemeToggle'
import { button, Callout, chip, Chip, ChipSelect } from '~/components/ui'
import { cardFacts } from '~/lib/card-facts'
import { CATEGORY_GROUPS } from '~/lib/category'
import { formatUpdatedAt } from '~/lib/dates'
import type { CatalogEventIndexItem } from '~/types/files'

/**
 * /playground의 컴포넌트 견본. 다섯 컴포넌트 파일의 export마다 하나씩이고,
 * 하나라도 빠지면 tests/components/playground-samples.test.ts가 실패한다.
 * 데이터는 고정 예시다 — data/를 읽으면 배치마다 화면이 바뀐다.
 */
export type Sample = { name: string; source: string; code: string; render: () => ReactNode }

/** 카드의 '남은 기간'이 언제 열어도 같게 나오도록 고정한다 */
const TODAY = '2026-11-04'
/** OpenNowBadge는 브라우저 시각으로 판정한다. 하루 종일 열려 있어야 언제 열어도 보인다 */
const ALWAYS_OPEN = { open: '00:00', close: '24:00', closedWeekdays: [] }

const EVENTS: CatalogEventIndexItem[] = [
  {
    id: 'sc-playground-1', kind: 'event', title: '[서울시립미술관] 서울 사진 축제 2026',
    group: '보러 가기', genre: '전시', district: '중구', place: '서울시립미술관 서소문본관',
    isFree: true, startDate: '2026-10-20', endDate: '2026-11-08', time: '10:00~20:00',
  },
  {
    id: 'kp-playground-2', kind: 'event', title: '뮤지컬 〈지킬 앤 하이드〉',
    group: '보러 가기', genre: '뮤지컬', district: '송파구', place: '샤롯데씨어터',
    fee: 'VIP석 170,000원', startDate: '2026-11-12', endDate: '2027-02-28',
  },
  {
    id: 'sc-playground-3', kind: 'event', title: '한강 야간 걷기 체험',
    group: '체험하기', genre: '체험', district: '영등포구', place: '여의도한강공원',
    isFree: true, startDate: '2026-11-07', endDate: '2026-11-07', time: '19:00~21:00',
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
    name: 'EventPosterCard', source: SRC.cards,
    code: `<EventPosterCard item={event} today={today} />`,
    render: () => (
      <div className="flex gap-150 overflow-x-auto">
        {EVENTS.map((e) => <EventPosterCard key={e.id} item={e} today={TODAY} />)}
      </div>
    ),
  },
  {
    name: 'ListRow', source: SRC.cards,
    code: `<ListRow id={item.id} image={{ src: item.imageUrl, category: item.group, shape: 'poster' }} title={item.title} facts={cardFacts(item, { today })} badge={<OpenNowBadge hours={item.hours} />} />`,
    render: () => (
      <div>
        {EVENTS.slice(0, 2).map((e) => (
          <ListRow
            key={e.id} id={e.id} title={e.title}
            image={{ category: e.group, shape: 'poster' }}
            facts={cardFacts(e, { today: TODAY })}
          />
        ))}
        <ListRow
          id="vs-playground-4" title="경복궁"
          image={{ category: '걸으러 가기', shape: 'photo' }}
          facts={cardFacts({ kind: 'place', district: '종로구', hours: ALWAYS_OPEN }, { km: 1.2 })}
          badge={<OpenNowBadge hours={ALWAYS_OPEN} />}
        />
      </div>
    ),
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
