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
 * This theme's showcase block — "our services" / "why us". The aesthetic
 * direction asks for numbered, breathing-room rows rather than a cramped
 * three-column grid, so each item is a full-width ledger row: a large index
 * numeral, an optional icon chip, and the copy — never an overlay card.
 *
 * The index numeral is server-computed text (`01`, `02`, …), not a CSS
 * counter: a counter is generated content that some assistive technology
 * exposes and others do not, which makes the number's presence in the
 * accessible name unpredictable. Writing it as real, `aria-hidden` text
 * keeps the behaviour identical everywhere — the item's title, not its
 * position, is what a screen reader announces.
 *
 * As in the canonical theme, the item's title carries the link so the link's
 * accessible name is the feature's own name (WCAG 2.4.4) — the block has no
 * separate label field to write a "learn more" with anyway.
 */
function renderItem(
  item: FeatureItem,
  ctx: RenderContext,
  index: number,
  tag: HeadingTag,
): HtmlElement {
  const number = String(index + 1).padStart(2, '0')
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
    h('span', { class: 'cg-service__index', 'aria-hidden': 'true' }, number),
    h(
      'div',
      { class: 'cg-service__body' },
      item.icon === undefined
        ? null
        : h('span', {
            class: 'cg-service__icon',
            'data-icon': item.icon,
            'aria-hidden': 'true',
          }),
      title,
      item.text === undefined ? null : h('p', { class: 'cg-service__text' }, item.text),
    ),
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
      'ol',
      { class: 'cg-services__items' },
      block.items.map((item, index) => renderItem(item, ctx, index, itemTag)),
    ),
  )
}
