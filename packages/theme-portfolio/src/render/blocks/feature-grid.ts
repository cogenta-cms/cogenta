import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  href,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Services, disciplines, principles or clients, set as a typographic list
 * rather than as cards with icons. Two forms, chosen from the data itself:
 *
 * - **rows**, when any item carries a sentence: each item a ruled row, its
 *   name in the display width on the left and the sentence beside it. A
 *   linked item links its name, drawn as an arrow link.
 * - **names**, when no item does: a list of names in columns, the way a
 *   studio lists its clients.
 *
 * An item's `icon` is not drawn: a studio's list of services is words, and a
 * pictogram beside each would be decoration. The value stays in the content
 * for a theme that wants it.
 */
function renderItem(
  item: FeatureItem,
  ctx: RenderContext,
  tag: HeadingTag,
  form: 'rows' | 'names',
): HtmlElement {
  const name =
    item.link === undefined
      ? item.title
      : h('a', { class: 'cg-arrow-link cg-list__link', href: href(ctx, item.link) }, item.title)
  // A name in a list of names is an item, not a section of the page: only a
  // row with its own sentence earns a heading in the outline.
  if (form === 'names') return h('li', { class: 'cg-list__item cg-list__name' }, name)
  return h(
    'li',
    { class: 'cg-list__item' },
    heading(tag, { class: 'cg-list__name' }, name),
    item.text === undefined ? null : h('p', { class: 'cg-list__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  const tag = nestedHeadingTag('featureGrid', titled)
  const form = block.items.some((item) => item.text !== undefined) ? 'rows' : 'names'
  return section(
    'section',
    'featureGrid',
    'cg-list cg-split',
    { 'data-form': form, 'data-titled': titled ? 'true' : 'false' },
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'cg-list__items', 'data-count': String(block.items.length) },
      block.items.map((item) => renderItem(item, ctx, tag, form)),
    ),
  )
}
