import { describe, expect, it } from 'vitest'
import * as cards from '~/components/cards'
import * as itemImage from '~/components/ItemImage'
import * as openNowBadge from '~/components/OpenNowBadge'
import { SAMPLES } from '~/components/playground-samples'
import * as themeToggle from '~/components/ThemeToggle'
import * as ui from '~/components/ui'

const MODULES = {
  'src/components/ui.tsx': ui,
  'src/components/cards.tsx': cards,
  'src/components/ItemImage.tsx': itemImage,
  'src/components/OpenNowBadge.tsx': openNowBadge,
  'src/components/ThemeToggle.tsx': themeToggle,
}

describe('SAMPLES', () => {
  it('다섯 파일의 export마다 견본이 하나씩 있다(새 export에 견본이 없으면 실패)', () => {
    const exported = Object.entries(MODULES).flatMap(([source, m]) => Object.keys(m).map((name) => `${source}#${name}`))
    expect(SAMPLES.map((s) => `${s.source}#${s.name}`).sort()).toEqual(exported.sort())
  })
})
