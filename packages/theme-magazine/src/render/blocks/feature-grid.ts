import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  href,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * A contents index, not a card grid: a bordered panel, a real newspaper
 * `column-rule` between the columns it falls into at width, and each entry
 * numbered by a CSS counter rather than an icon chip — this vocabulary's
 * `icon` names a symbol no icon set this theme ships can resolve into
 * markup, so a numeral the browser generates for free reads as considered
 * rather than as a placeholder.
 *
 * The item's own title carries the link, exactly as in the reference theme:
 * a bare "read more" repeated across a grid fails WCAG 2.4.4, and the block
 * has no separate label field to fix that with.
 */
function renderItem(item: FeatureItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const title =
    item.link === undefined
      ? heading(tag, { class: 'cg-index__title' }, item.title)
      : heading(
          tag,
          { class: 'cg-index__title' },
          h('a', { class: 'cg-index__link', href: href(ctx, item.link) }, item.title),
        )
  return h(
    'li',
    { class: 'cg-index__item', 'data-icon': item.icon },
    title,
    item.text === undefined ? null : h('p', { class: 'cg-index__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return h(
    'section',
    { class: 'cg-block cg-index', 'data-block': 'featureGrid' },
    hasTitle
      ? heading(
          blockHeadingTag('featureGrid') ?? 'h2',
          { class: 'cg-index__heading', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ol',
      { class: 'cg-index__items' },
      block.items.map((item) => renderItem(item, ctx, itemTag)),
    ),
  )
}
