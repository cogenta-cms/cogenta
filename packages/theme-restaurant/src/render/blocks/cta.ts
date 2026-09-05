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
 * "Book now / Call us" — a centred, dark, full-bleed close, mirroring the
 * hero's own centred treatment so the page opens and closes on the same
 * note. `--cg-scrim` gives the panel its depth; nothing here is a literal
 * colour (R3/isolation test).
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-close', 'data-block': 'cta' },
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'cg-close__title', 'data-field': 'title' },
      block.title,
    ),
    block.text === undefined
      ? null
      : h('p', { class: 'cg-close__text', 'data-field': 'text' }, block.text),
    actionList(ctx, block.actions, block.title),
  )
}
