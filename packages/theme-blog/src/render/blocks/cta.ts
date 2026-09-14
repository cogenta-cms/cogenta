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
 * An invitation set inline, between two rules: the title in the margin
 * columns, the supporting line and the actions on the text line beside it.
 * No tinted panel and no band: the rules and the space around them are the
 * whole frame, so a newsletter sign-up reads as part of the publication
 * rather than as an advertisement placed in it.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'cg-cta',
    {},
    'div',
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
  )
}
