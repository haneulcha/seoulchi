import { useEffect, useState } from 'react'
import indexUrl from '../../data/index.json?url'
import type { LatLng } from '~/lib/geo'
import { kstToday } from '~/lib/week'
import { catalogIndexSchema, type CatalogIndexFile } from '~/types/files'

/**
 * 껍데기는 SSG, 목록만 클라이언트 fetch(스펙 8장). 홈과 달리 서버 함수를 쓰지 않는
 * 이유: 서버 함수 loader면 인덱스 240KB가 프리렌더 HTML에 통째로 박힌다.
 * ?url 임포트라 에셋 URL에 base가 자동으로 붙는다 — static-fn-base가 손으로 풀던
 * 문제(스펙 10장)를 vite가 대신 푼다. (확인 결과 #3, 계획 문서 참고)
 */
export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: CatalogIndexFile; today: string; now: Date }

export type GeoState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'ok'; origin: LatLng }
  | { status: 'denied' }

export function useCatalog(): { state: CatalogState; retry: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetch(indexUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`인덱스를 받지 못했습니다 (HTTP ${res.status})`)
        const parsed = catalogIndexSchema.safeParse(await res.json())
        if (!parsed.success) {
          throw new Error('인덱스가 스키마와 다릅니다 — 배치와 앱 버전이 어긋났을 수 있습니다')
        }
        if (cancelled) return
        const now = new Date() // 브라우저 경계 — 여기서 한 번만. 이후 계산은 전부 이 값을 받는다
        setState({ status: 'ready', index: parsed.data, today: kstToday(now), now })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // 빈 목록으로 위장하지 않는다 — 명시적 에러 + 재시도(스펙 8장)
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return { state, retry: () => setAttempt((n) => n + 1) }
}

export function useGeo(near: boolean): GeoState {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })

  /**
   * 위치는 near가 켜졌을 때만 묻는다 — 안 쓰는 권한을 미리 조르지 않는다.
   * cancelled 가드는 위 카탈로그 fetch effect와 같은 패턴: near를 켰다가 응답 전에
   * 끄면 effect가 재실행되고 geo가 idle로 리셋되는데, 그 뒤에 도착하는 늦은 콜백이
   * (거부하지 않았는데도) geo를 denied/ok로 덮어써서는 안 된다 — 화면이 사실이 아닌
   * 걸 말하게 된다(PRODUCT.md).
   */
  useEffect(() => {
    if (!near) {
      setGeo({ status: 'idle' })
      return
    }
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'denied' })
      return
    }
    let cancelled = false
    setGeo({ status: 'waiting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) {
          setGeo({ status: 'ok', origin: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
        }
      },
      () => {
        if (!cancelled) setGeo({ status: 'denied' })
      },
      // 기본 timeout은 무한대다 — OS 위치 서비스가 꺼져 있으면 권한을 허용해도 응답이 오지 않아 '확인 중'에 멈춘다
      { timeout: 10_000, maximumAge: 600_000 },
    )
    return () => {
      cancelled = true
    }
  }, [near])

  return geo
}
