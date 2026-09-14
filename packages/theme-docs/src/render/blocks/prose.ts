import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { type HeadingAnchors, headingAnchors, renderDocsRichText } from '../rich-text.js'

/**
 * Running text. `prose` declares `headingLevel: 'none'`: its headings come
 * from the rich text document, whose vocabulary starts at `h2`.
 *
 * The body is set on the reading measure from the first column; code blocks,
 * notes and reference tables are read out of the document by
 * `renderDocsRichText` (see its own comment for the four shapes).
 *
 * `anchors` is the page's own set of heading ids, so the table of contents
 * and the headings agree; a prose block rendered on its own computes its own.
 */
export function renderProse(
  block: ProseBlock,
  ctx: RenderContext,
  anchors: HeadingAnchors = headingAnchors([block]),
): HtmlElement {
  return h(
    'div',
    { class: 'cd-section cd-prose', 'data-block': 'prose' },
    h(
      'div',
      { class: 'cd-container cd-prose__inner' },
      h(
        'div',
        { class: 'cd-prose__body cd-rich' },
        renderDocsRichText(ctx, block.body, { anchors: { blockKey: block._key, map: anchors } }),
      ),
    ),
  )
}
