import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { shareOf } from '../figures.js'
import { associationString } from '../strings.js'

/**
 * Where the money goes, as shares of one total: one row per share, the
 * percentage in tabular figures, what it pays for, and a bar under it as long
 * as the share. The bar is a presentational `<span>` whose length is the
 * number beside it, so nothing is said twice to a screen reader; the figure
 * itself is a `<data>` element carrying the exact value.
 */
export function renderBreakdown(
  items: readonly {
    readonly value: string
    readonly unit?: string | undefined
    readonly label: string
  }[],
  ctx: RenderContext,
): HtmlElement {
  return h(
    'dl',
    { class: 'ca-shares', 'aria-label': associationString(ctx.locale, 'share') },
    items.map((item) => {
      const share = shareOf(item.value, item.unit) ?? 0
      return h(
        'div',
        { class: 'ca-shares__item' },
        h('dt', { class: 'ca-shares__label' }, item.label),
        h(
          'dd',
          { class: 'ca-shares__value' },
          h('data', { value: String(share) }, `${item.value}${item.unit ?? ''}`),
        ),
        h(
          'dd',
          { class: 'ca-shares__track', 'aria-hidden': 'true' },
          h('span', { class: 'ca-shares__bar', style: `inline-size:${share}%` }),
        ),
      )
    }),
  )
}
