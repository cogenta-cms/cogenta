import type { CtaBlock } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { actionList } from '../actions.js'
import { blockHeadingTag, heading } from '../heading.js'
import { type HtmlElement, h } from '../html.js'

export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-cta', 'data-block': 'cta' },
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
  )
}
