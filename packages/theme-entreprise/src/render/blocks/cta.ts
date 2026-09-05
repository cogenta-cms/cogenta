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
 * A full-width flat band, not a garish sales strip: the ask on the left and
 * the action on the right, separated by a vertical rule on wide screens —
 * the layout a serious B2B site uses for "talk to us", never centred copy
 * stacked above a button. `.cg-banner__inner` re-centres the ask/action
 * pair to the page's own measure while the flat tinted fill itself goes
 * edge to edge (`blocks.css`).
 */
export function renderCta(block: CtaBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-banner', 'data-block': 'cta' },
    h(
      'div',
      { class: 'cg-banner__inner' },
      h(
        'div',
        { class: 'cg-banner__content' },
        heading(
          blockHeadingTag('cta') ?? 'h2',
          { class: 'cg-banner__title', 'data-field': 'title' },
          block.title,
        ),
        block.text === undefined
          ? null
          : h('p', { class: 'cg-banner__text', 'data-field': 'text' }, block.text),
      ),
      h(
        'div',
        { class: 'cg-banner__actions' },
        // `actions` is required and non-empty for a `cta`, so the list is
        // always rendered; the null branch stays reachable only through
        // invalid data.
        actionList(ctx, block.actions, block.title),
      ),
    ),
  )
}
