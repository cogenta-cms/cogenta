import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  href,
  nestedHeadingTag,
  type RenderContext,
  renderIcon,
} from '@cogenta/theme-kit'
import { optionalText, section, sectionHead } from '../layout.js'

/**
 * Two readings of the same block, chosen from its data, never from a class
 * an editor would have to know about.
 *
 * - **Features** (at least one item names an icon): a
 *   grid of three columns without tiles or cards. A small stroke icon sits
 *   inline before the title, the text is two lines under it, and a linked
 *   item links its title. No box, no background, no hover lift.
 * - **Steps** (no item names an icon): a numbered sequence in up to four
 *   columns. Each step hangs from a hairline, its number printed in Geist
 *   Mono, then its title and text. This is how "how it works" reads.
 *
 * An icon name this theme does not know draws nothing: the title keeps its
 * place, and the item still counts as a feature.
 */
function titleOf(item: FeatureItem, ctx: RenderContext, tag: string): HtmlElement {
  return h(
    tag,
    { class: 'cs-features__title' },
    item.link === undefined
      ? item.title
      : h('a', { class: 'cs-features__link', href: href(ctx, item.link) }, item.title),
  )
}

function featureItem(item: FeatureItem, ctx: RenderContext, tag: string): HtmlElement {
  const icon =
    item.icon === undefined ? null : renderIcon(item.icon, { className: 'cs-features__icon' })
  return h(
    'li',
    { class: 'cs-features__item', 'data-icon': icon === null ? 'false' : 'true' },
    h('div', { class: 'cs-features__heading' }, icon, titleOf(item, ctx, tag)),
    optionalText('p', 'cs-features__text', item.text),
  )
}

function stepItem(item: FeatureItem, ctx: RenderContext, tag: string, index: number): HtmlElement {
  return h(
    'li',
    { class: 'cs-steps__item' },
    h(
      'span',
      { class: 'cs-steps__number', 'aria-hidden': 'true' },
      String(index + 1).padStart(2, '0'),
    ),
    h(
      tag,
      { class: 'cs-steps__title' },
      item.link === undefined
        ? item.title
        : h('a', { class: 'cs-features__link', href: href(ctx, item.link) }, item.title),
    ),
    optionalText('p', 'cs-steps__text', item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  const tag = nestedHeadingTag('featureGrid', titled)
  const hasKnownIcon = block.items.some(
    (item) => item.icon !== undefined && item.icon.trim() !== '',
  )

  return section(
    'section',
    'featureGrid',
    hasKnownIcon ? 'cs-features' : 'cs-steps',
    {
      'data-shape': hasKnownIcon ? 'features' : 'steps',
      'data-count': String(Math.min(block.items.length, 4)),
    },
    'div',
    sectionHead('featureGrid', block.title),
    hasKnownIcon
      ? h(
          'ul',
          { class: 'cs-features__items' },
          block.items.map((item) => featureItem(item, ctx, tag)),
        )
      : h(
          'ol',
          { class: 'cs-steps__items' },
          block.items.map((item, index) => stepItem(item, ctx, tag, index)),
        ),
  )
}
