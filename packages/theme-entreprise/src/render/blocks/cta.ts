import type { CtaBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * The ink band: the one dark plane on a light page, edge to edge.
 *
 * The ask is set in the display serif across the left eight columns, the
 * supporting line beneath it, and the actions sit in the right-hand columns
 * on the band's baseline. In dark mode the band becomes the raised ink
 * surface between two hairlines, so it keeps its role without inverting.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'cg-cta',
    {},
    'div',
    h(
      'div',
      { class: 'cg-cta__copy' },
      heading(
        blockHeadingTag('cta') ?? 'h2',
        { class: 'cg-cta__title', 'data-field': 'title' },
        block.title,
      ),
      block.text === undefined
        ? null
        : h('p', { class: 'cg-cta__text', 'data-field': 'text' }, block.text),
    ),
    h(
      'div',
      { class: 'cg-cta__actions' },
      // `actions` is required and non-empty for a `cta`; the null branch is
      // reachable only through invalid data.
      actionList(ctx, block.actions, block.title),
    ),
  )
}
