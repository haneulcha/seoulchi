import { mkdir, writeFile } from 'node:fs/promises'

const OUT = 'tmp/probe'

async function dump(name: string, data: unknown) {
  await mkdir(OUT, { recursive: true })
  await writeFile(`${OUT}/${name}.json`, JSON.stringify(data, null, 2))
  console.log(`  → tmp/probe/${name}.json`)
}

async function probeSeoulCulture(key: string) {
  console.log('\n[서울시 문화행사]')
  const url = `http://openapi.seoul.go.kr:8088/${key}/json/culturalEventInfo/1/5/`
  const res = await fetch(url)
  const json = (await res.json()) as any
  await dump('seoul-culture-sample', json)

  const body = json.culturalEventInfo
  if (!body) {
    console.log('  ✗ culturalEventInfo 없음. 응답 확인 필요:', Object.keys(json))
    return
  }
  console.log('  총 건수(list_total_count):', body.list_total_count)
  const first = body.row?.[0]
  if (first) {
    console.log('  필드 목록:', Object.keys(first).join(', '))
    console.log('  MAIN_IMG 존재:', 'MAIN_IMG' in first, '→', first.MAIN_IMG)
    console.log('  LAT:', first.LAT, ' LOT:', first.LOT, ' PLACE:', first.PLACE)
    console.log('  ↑ LAT/LOT 중 어느 쪽이 위도인지 반드시 확인할 것')
  }
}

async function probeVisitSeoul(key: string) {
  const headers = {
    'VISITSEOUL-API-KEY': key,
    Accept: 'application/json;charset=UTF-8',
    'Content-Type': 'application/json;charset=UTF-8',
  }
  const base = 'https://api-call.visitseoul.net/api/v1'

  console.log('\n[비짓서울 - 카테고리]')
  const cat = await (await fetch(`${base}/category/list`, { headers })).json()
  await dump('visitseoul-categories', cat)
  const cats = (cat as any).data ?? []
  console.log('  카테고리 수:', cats.length)
  for (const c of cats) {
    console.log(`    ${'  '.repeat((c.ctgry_level ?? 1) - 1)}${c.com_ctgry_sn}  ${c.ctgry_path}`)
  }

  console.log('\n[비짓서울 - 목록]')
  const list = await (
    await fetch(`${base}/contents/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lang_code_id: 'ko', page_no: 1 }),
    })
  ).json()
  await dump('visitseoul-list', list)
  console.log('  total_count:', (list as any).paging?.total_count)

  const cid = (list as any).data?.[0]?.cid
  if (cid) {
    // GET은 405, 쿼리스트링 POST는 400. body에 cid를 실은 POST만 통한다.
    console.log('\n[비짓서울 - 상세]', cid)
    const info = await (
      await fetch(`${base}/contents/info`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cid, lang_code_id: 'ko' }),
      })
    ).json()
    await dump('visitseoul-info', info)
    const d = (info as any).data ?? info
    console.log('  최상위 필드:', Object.keys(d).join(', '))
    console.log('  schdul_info_bgnde:', d.schdul_info_bgnde, '~', d.schdul_info_endde)
    console.log('  traffic:', JSON.stringify(d.traffic))
    console.log('  extra.cmmn_use_time:', d.extra?.cmmn_use_time)
    console.log('  extra.closed_days:', d.extra?.closed_days)
  }

  console.log('\n[비짓서울 - 목록 페이지 크기 / 카테고리 필터]')
  for (const body of [
    { label: 'page_size=200', payload: { lang_code_id: 'ko', page_no: 1, page_size: 200 } },
    { label: '카테고리 필터(축제)', payload: { lang_code_id: 'ko', page_no: 1, com_ctgry_sn: 'Cd4y5u1' } },
  ]) {
    const r = await (
      await fetch(`${base}/contents/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body.payload),
      })
    ).json()
    const p = (r as any).paging
    console.log(`  ${body.label}: total=${p?.total_count} page_size=${p?.page_size} 실제=${(r as any).data?.length}`)
  }

  console.log('\n[비짓서울 - standard/list 존재 여부]')
  const std = await fetch(`${base}/contents/standard/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lang_code_id: 'ko', page_no: 1 }),
  })
  console.log('  status:', std.status)
  const stdJson = await std.json().catch(() => null)
  if (stdJson) {
    await dump('visitseoul-standard-list', stdJson)
    const row = (stdJson as any).data?.[0]
    if (row) console.log('  필드 목록:', Object.keys(row).join(', '))
  }
}

const seoulKey = process.env.SEOUL_API_KEY
const visitKey = process.env.VISITSEOUL_API_KEY

if (seoulKey) await probeSeoulCulture(seoulKey)
else console.log('SEOUL_API_KEY 없음 — 건너뜀')

if (visitKey) await probeVisitSeoul(visitKey)
else console.log('VISITSEOUL_API_KEY 없음 — 건너뜀')
