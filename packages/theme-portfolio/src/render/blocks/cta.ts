import type { CtaBlock } from '@cogenta/blocks'
import {
  actionLink,
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * The invitation to get in touch, set the way a studio sets its contact
 * line: a short title and a sentence, then the first action as a very large
 * link in the display width, underlined in the one signal colour. Any further
 * action follows as ordinary underlined words. No box, no band, no button.
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  const [first, ...rest] = block.actions
  const lead =
    first === undefined
      ? null
      : (() => {
          const link = actionLink(ctx, first)
          return { ...link, attrs: { ...link.attrs, class: 'cg-action cg-contact__link' } }
        })()
  return section(
    'section',
    'cta',
    'cg-contact',
    {},
    'div',
    h(
      'div',
      { class: 'cg-contact__copy' },
      heading(
        blockHeadingTag('cta') ?? 'h2',
        { class: 'cg-contact__title', 'data-field': 'title' },
        block.title,
      ),
      block.text === undefined
        ? null
        : h('p', { class: 'cg-contact__text', 'data-field': 'text' }, block.text),
    ),
    lead === null ? null : h('p', { class: 'cg-contact__lead' }, lead),
    actionList(ctx, rest, block.title),
  )
}
