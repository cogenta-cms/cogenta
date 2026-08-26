import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). A reference dossier, not the reader mailbag:
 * shares `faq`'s `<details>`/`<summary>` mechanics — expanding, keyboard
 * operation and the announced expanded state all come from the browser, at
 * zero bytes of JavaScript — but its own markup and class names (`cg-dossier`
 * rather than `cg-mailbag`), a tab-style entry marker in the margin instead
 * of a numeral, so the two blocks can diverge visually later without one
 * depending on the other. "Accordion" and "frequently asked question" are
 * different editorial intents even where the question/answer shape coincides.
 */
function renderItem(item: AccordionItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-dossier__entry' },
    h(
      'details',
      { class: 'cg-dossier__details' },
      h('summary', { class: 'cg-dossier__term' }, item.question),
      h('div', { class: 'cg-dossier__definition' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-dossier', 'data-block': 'accordion' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('accordion') ?? 'h2',
          { class: 'cg-dossier__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-dossier__entries' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
