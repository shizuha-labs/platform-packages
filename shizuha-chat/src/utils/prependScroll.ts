/**
 * CON-293 / CON-244: keep the same messages in view after older history is
 * prepended. Pure helper so CI can lock the delta math without a browser.
 */
export function computePrependScrollTop(
  prevScrollTop: number,
  prevScrollHeight: number,
  nextScrollHeight: number,
): number {
  const delta = nextScrollHeight - prevScrollHeight
  if (!Number.isFinite(delta) || delta <= 0) return prevScrollTop
  return prevScrollTop + delta
}
