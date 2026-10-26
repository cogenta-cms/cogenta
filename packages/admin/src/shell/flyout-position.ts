/**
 * Where a sidebar flyout goes, in viewport coordinates (it is `position:
 * fixed`, so the rail's own scroll box can never clip it).
 *
 * The flyout opens level with its trigger row. When it would run past the
 * bottom of the window it slides up instead, as far as the top bar allows;
 * when it is taller than the space between the top bar and the window's
 * bottom edge it is capped there and scrolls on its own. Either way every
 * entry stays reachable with the wheel and the keyboard.
 */
export interface FlyoutPlacementInput {
  /** The trigger row's top edge, in viewport coordinates. */
  readonly triggerTop: number
  /** The flyout's natural (uncapped) height. */
  readonly flyoutHeight: number
  readonly viewportHeight: number
  /** Bottom edge of the sticky top bar. */
  readonly topInset: number
  /** Breathing room kept to the top bar and to the window's bottom edge. */
  readonly margin: number
}

export interface FlyoutPlacement {
  readonly top: number
  readonly maxHeight: number
}

export function placeFlyout(input: FlyoutPlacementInput): FlyoutPlacement {
  const { triggerTop, flyoutHeight, viewportHeight, topInset, margin } = input
  const floor = topInset + margin
  const ceiling = viewportHeight - margin
  const maxHeight = Math.max(0, ceiling - floor)
  const height = Math.min(flyoutHeight, maxHeight)
  const top = Math.max(floor, Math.min(triggerTop, ceiling - height))
  return { top, maxHeight }
}
