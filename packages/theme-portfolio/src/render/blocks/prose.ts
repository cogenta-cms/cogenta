import type { ProseBlock, RichTextDocument } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Running text on the studio grid. When the text opens with a subhead, the
 * subhead moves into the first three columns as the section's label and the
 * text starts at the fourth, level with it: the asymmetric page of a case
 * study. Without a subhead the text simply takes the reading column.
 *
 * On a project page a long text sets in two columns on a wide screen
 * (`work.css`). A short one stays in one: two columns of four lines each
 * read as a mistake, not as a page. Everywhere else the text keeps one
 * column at the reading measure.
 */

/** Below this many words, a text is kept in one column. */
export const TWO_COLUMN_MIN_WORDS = 110

function wordCount(document: RichTextDocument): number {
  let words = 0
  for (const node of document) {
    if (node._type !== 'block') continue
    for (const span of node.children) {
      words += span.text.split(/\s+/u).filter((word) => word !== '').length
    }
  }
  return words
}

export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  const [first, ...rest] = block.body
  const opensOnSubhead = first !== undefined && first._type === 'block' && first.style === 'h2'
  const body = opensOnSubhead ? rest : block.body
  return section(
    'div',
    'prose',
    'cg-prose',
    {
      'data-label': opensOnSubhead ? 'true' : 'false',
      'data-length': wordCount(body) >= TWO_COLUMN_MIN_WORDS ? 'long' : 'short',
    },
    'div',
    opensOnSubhead ? h('div', { class: 'cg-prose__label' }, renderRichText(ctx, [first])) : null,
    h('div', { class: 'cg-prose__body' }, renderRichText(ctx, body)),
  )
}
