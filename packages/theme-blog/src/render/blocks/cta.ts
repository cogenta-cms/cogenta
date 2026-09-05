import type { CtaBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/** "Get the weekly letter" — a warm, letter-paper panel rather than a garish sales strip, centred like a real newsletter sign-up card. */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-letter', 'data-block': 'cta' },
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'cg-letter__title', 'data-field': 'title' },
      block.title,
    ),
    block.text === undefined
      ? null
      : h('p', { class: 'cg-letter__text', 'data-field': 'text' }, block.text),
    h('div', { class: 'cg-letter__actions' }, actionList(ctx, block.actions, block.title)),
  )
}
