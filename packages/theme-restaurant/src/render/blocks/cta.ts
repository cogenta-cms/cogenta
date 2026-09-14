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
 * in ink across the container, the title large and light on the first seven
 * columns, the sentence and the actions on the last four. How to book a
 * table, the private room, a gift for someone else.
 *
 * A site that wants a band asks for one with the `background` variant, which
 * lays the same line on the paper's darker stock.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'cr-cta',
    {},
    'div',
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'cr-cta__title', 'data-field': 'title' },
      block.title,
    ),
    h(
      'div',
      { class: 'cr-cta__body' },
      optionalText('p', 'cr-cta__text', block.text, { 'data-field': 'text' }),
      actionList(ctx, block.actions, block.title),
    ),
  )
}
