import type { CtaBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-cta', 'data-block': 'cta' },
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'cg-cta__title', 'data-field': 'title' },
      block.title,
    ),
    block.text === undefined
      ? null
      : h('p', { class: 'cg-cta__text', 'data-field': 'text' }, block.text),
    actionList(ctx, block.actions, block.title),
  )
}
