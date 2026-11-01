/** fee 원문에서 최저 금액(원)을 뽑는다. 금액이 있으면 금액이 이기고, 없고 '무료'만 있으면 0. 못 읽으면 undefined(중립) */
export function parseMinPrice(fee: string | undefined): number | undefined {
  if (!fee) return undefined
  const amounts = [...fee.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/g)].map((m) => Number(m[1]!.replaceAll(',', '')))
  if (amounts.length > 0) return Math.min(...amounts)
  return fee.includes('무료') ? 0 : undefined
}
