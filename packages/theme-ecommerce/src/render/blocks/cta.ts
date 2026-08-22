import type { CtaBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * The promotional banner — the loudest panel in the theme on purpose, styled
 * as a full-bleed block in the accent colour rather than a tinted card, the
 * way a storefront's "shop the sale" strip commits to its colour instead of
 * hinting at it.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'ce-block ce-cta', 'data-block': 'cta' },
    h(
      'div',
      { class: 'ce-cta__panel' },
      heading(
        blockHeadingTag('cta') ?? 'h2',
        { class: 'ce-cta__title', 'data-field': 'title' },
        block.title,
      ),
      block.text === undefined
        ? null
        : h('p', { class: 'ce-cta__text', 'data-field': 'text' }, block.text),
      // `actions` is required and non-empty for a `cta`, so the list always
      // renders; the null branch stays reachable only through invalid data.
      actionList(ctx, block.actions, block.title),
    ),
  )
}
