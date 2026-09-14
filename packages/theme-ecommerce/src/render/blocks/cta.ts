import type { CtaBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * A call to action set as a line of the page, not a coloured box: a hairline
 * in ink across the container, the title on the first six columns, the
 * sentence and the actions on the last five. A letter to subscribe to, a
 * page to read before ordering, a visit to the shop.
 *
 * A site that wants a band asks for one with the `background` variant, which
 * lays the same line on the stone ground.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'ce-cta',
    {},
    'div',
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'ce-cta__title', 'data-field': 'title' },
      block.title,
    ),
    h(
      'div',
      { class: 'ce-cta__body' },
      optionalText('p', 'ce-cta__text', block.text, { 'data-field': 'text' }),
      actionList(ctx, block.actions, block.title),
    ),
  )
}
