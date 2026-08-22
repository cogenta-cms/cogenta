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
 * The one panel on the page that inverts the palette — ink background, paper
 * text — so it reads as a full stop rather than another section. The title
 * is set at the same display scale as the hero: a call to action on a
 * portfolio site is a second headline, not a footnote.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-cta', 'data-block': 'cta' },
    h(
      'div',
      { class: 'cg-cta__frame' },
      heading(
        blockHeadingTag('cta') ?? 'h2',
        { class: 'cg-cta__title', 'data-field': 'title' },
        block.title,
      ),
      block.text === undefined
        ? null
        : h('p', { class: 'cg-cta__text', 'data-field': 'text' }, block.text),
      // `actions` is required and non-empty for a `cta`, so the list is always
      // rendered; the null branch stays reachable only through invalid data.
      actionList(ctx, block.actions, block.title),
    ),
  )
}
