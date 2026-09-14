import type { CtaBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'
import { giftsOf } from '../figures.js'
import { optionalText, section } from '../layout.js'

/**
 * The ask. On a charity's site the band that asks is the donation ask, so
 * this theme gives it the signal yellow, across the whole width of the
 * window: the title large on the first six columns, and on the other six the
 * sentence and the actions, the first one a filled ink button.
 *
 * When the text says what a gift pays for, sentence by sentence, each
 * sentence starting with an amount, the amounts are set large beside what
 * they buy (`giftsOf`); any other text stays one paragraph.
 *
 * An invitation that is not a donation ask (a volunteer evening, a
 * newsletter) asks for the quieter band with the `background` variant, which
 * lays the same layout on the paper's darker stock.
 */
function body(block: CtaBlock): HtmlElement | null {
  const gifts = giftsOf(block.text)
  if (gifts === undefined) {
    return optionalText('p', 'ca-cta__text', block.text, { 'data-field': 'text' })
  }
  return h(
    'div',
    { class: 'ca-cta__gifts' },
    gifts.lead === undefined ? null : h('p', { class: 'ca-cta__text' }, gifts.lead),
    h(
      'dl',
      { class: 'ca-cta__ladder' },
      gifts.gifts.map((gift) =>
        h(
          'div',
          { class: 'ca-cta__gift' },
          h('dt', { class: 'ca-cta__amount' }, gift.amount),
          h('dd', { class: 'ca-cta__buys' }, gift.text),
        ),
      ),
    ),
    gifts.tail === undefined ? null : h('p', { class: 'ca-cta__text' }, gifts.tail),
  )
}

export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'ca-cta',
    { 'data-band': 'signal' },
    'div',
    heading(
      blockHeadingTag('cta') ?? 'h2',
      { class: 'ca-cta__title', 'data-field': 'title' },
      block.title,
    ),
    h('div', { class: 'ca-cta__body' }, body(block), actionList(ctx, block.actions, block.title)),
  )
}
