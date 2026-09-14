import type { CtaBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * The closing call to action, drawn soberly: a hairline in ink across the
 * container, the title on the first seven columns with its sentence under it,
 * and the actions on the last columns, sharing the title's first line on a
 * wide screen. No coloured box, no band, no second picture: at the end of a
 * page the words and one blue button are enough.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'cs-cta',
    {},
    'div',
    h(
      'div',
      { class: 'cs-cta__words' },
      h('h2', { class: 'cs-cta__title', 'data-field': 'title' }, block.title),
      optionalText('p', 'cs-cta__text', block.text, { 'data-field': 'text' }),
    ),
    h('div', { class: 'cs-cta__actions' }, actionList(ctx, block.actions, ctx.t('hero.actions'))),
  )
}
