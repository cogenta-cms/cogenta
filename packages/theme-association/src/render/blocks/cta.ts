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
 * The "Every gift counts" donate band — a full-width, tinted panel (the
 * skin's own accent, softened) rather than a plain section, so the one block
 * whose entire job is a call to act reads as the loudest thing on the page.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-cta', 'data-block': 'cta' },
    h(
      'div',
      { class: 'cg-cta__inner' },
      heading(
        blockHeadingTag('cta') ?? 'h2',
        { class: 'cg-cta__title', 'data-field': 'title' },
        block.title,
      ),
      block.text === undefined
        ? null
        : h('p', { class: 'cg-cta__text', 'data-field': 'text' }, block.text),
      // `actions` is required and non-empty for a `cta`, so the list is
      // always rendered; the null branch stays reachable only through
      // invalid data.
      actionList(ctx, block.actions, block.title),
    ),
  )
}
