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
  renderIcon,
} from '@cogenta/theme-kit'

/**
 * This theme's "our services" section — a card grid, each card led by a
 * real inline glyph (`renderIcon`) inside a flat, accent-tinted square, the
 * B2B "capability card" register a consultancy or software vendor's
 * services page uses, replacing the numbered ledger rows this block used to
 * render (a plain list read as a table of contents, not as a services
 * pitch a visitor scans in one pass).
 *
 * Capped at three columns on a wide screen — a six-item grid staying 3×2
 * rather than drifting to four columns plus two orphans, the same
 * discipline `theme-saas`'s own `featureGrid` holds.
 *
 * As in every other theme, the item's title carries the link so the link's
 * accessible name is the feature's own name (WCAG 2.4.4) — the block has no
 * separate label field to write a "learn more" with anyway.
 */
function renderItem(item: FeatureItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const title =
    item.link === undefined
      ? heading(tag, { class: 'cg-service__title' }, item.title)
      : heading(
          tag,
          { class: 'cg-service__title' },
          h('a', { class: 'cg-service__link', href: href(ctx, item.link) }, item.title),
        )
  return h(
    'li',
    { class: 'cg-service' },
    item.icon === undefined
      ? null
      : h(
          'span',
          { class: 'cg-service__icon', 'data-icon': item.icon, 'aria-hidden': 'true' },
          renderIcon(item.icon),
        ),
    title,
    item.text === undefined ? null : h('p', { class: 'cg-service__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return h(
    'section',
    { class: 'cg-services', 'data-block': 'featureGrid' },
    hasTitle
      ? heading(
          blockHeadingTag('featureGrid') ?? 'h2',
          { class: 'cg-services__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-services__items' },
      block.items.map((item) => renderItem(item, ctx, itemTag)),
    ),
  )
}
