import type { CtaBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * A closing line: "Stuck on something", "Upgrading from an older version".
 * Between two hairlines held to the width of the content (never a coloured
 * band, never a rule across the gutters): the title and a sentence on the
 * first seven columns, the actions after them on a wide screen.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'cta',
    'cd-cta',
    {},
    'div',
    h(
      'div',
      { class: 'cd-cta__panel' },
      h(
        'div',
        { class: 'cd-cta__words' },
        h('h2', { class: 'cd-cta__title', 'data-field': 'title' }, block.title),
        optionalText('p', 'cd-cta__text', block.text, { 'data-field': 'text' }),
      ),
      h('div', { class: 'cd-cta__actions' }, actionList(ctx, block.actions, block.title)),
    ),
  )
}
