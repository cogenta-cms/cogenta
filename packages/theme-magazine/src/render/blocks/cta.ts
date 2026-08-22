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
 * The subscription page a print magazine always carries: a panel framed by
 * a heavy top-and-bottom rule rather than a rounded, shadowed card — the
 * theme's one deliberately "loud" moment, reserved for the block whose whole
 * job is to ask for something.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-subscribe', 'data-block': 'cta' },
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'cg-subscribe__title', 'data-field': 'title' },
      block.title,
    ),
    block.text === undefined
      ? null
      : h('p', { class: 'cg-subscribe__text', 'data-field': 'text' }, block.text),
    // `actions` is required and non-empty for a `cta`, so this always renders;
    // the null branch stays reachable only through invalid stored data.
    actionList(ctx, block.actions, block.title),
  )
}
