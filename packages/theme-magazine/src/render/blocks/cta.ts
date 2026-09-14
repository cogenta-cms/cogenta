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
 * An appeal, set like the subscription panel a newspaper runs between two
 * sections: a double rule above, the title large in the display face across
 * the left seven columns, the text and the actions in the right five. No
 * coloured box: the rules and the type carry it.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'cg-appeal',
    {},
    'div',
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'cg-appeal__title', 'data-field': 'title' },
      block.title,
    ),
    h(
      'div',
      { class: 'cg-appeal__body' },
      block.text === undefined
        ? null
        : h('p', { class: 'cg-appeal__text', 'data-field': 'text' }, block.text),
      actionList(ctx, block.actions, block.title),
    ),
  )
}
