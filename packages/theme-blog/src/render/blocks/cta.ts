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
 * The newsletter band: a solid panel across the container, the title set
 * large in the display face on the left and the supporting line and the
 * actions on the right. The first action is the one filled button of the
 * panel; the rest are links. No box shadow, no illustration, no gradient:
 * the panel is the whole frame.
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
      { class: 'cg-cta__inner' },
      heading(
        blockHeadingTag('cta') ?? 'h2',
        { class: 'cg-cta__title', 'data-field': 'title' },
        block.title,
      ),
      h(
        'div',
        { class: 'cg-cta__body' },
        block.text === undefined
          ? null
          : h('p', { class: 'cg-cta__text', 'data-field': 'text' }, block.text),
        actionList(ctx, block.actions, block.title),
      ),
    ),
  )
}
