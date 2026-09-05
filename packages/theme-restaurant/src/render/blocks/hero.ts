import type { HeroBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  image,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * The full-bleed dining-room hero: the media (when present) fills the whole
 * band, a gradient scrim sits between it and the copy so the centred text
 * stays legible over a photo of any tone, and the eyebrow/title/subtitle are
 * centred — the "elegant restaurant homepage" convention (Divi/Astra
 * "Restaurant") rather than the left-aligned marketing hero the other
 * built-in themes use.
 *
 * The scrim is a CSS gradient composed from `--cg-scrim` (itself derived
 * from the skin's own ink, see `tokens.css`), never a literal colour: a
 * skin with a lighter ink still gets a scrim tuned to it.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    {
      class: 'cg-hero',
      'data-block': 'hero',
      'data-has-media': block.media === undefined ? 'false' : 'true',
    },
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__media' },
          image(ctx, block.media, {
            className: 'cg-hero__image',
            loading: 'eager',
            sizes: '100vw',
          }),
          h('div', { class: 'cg-hero__scrim', 'aria-hidden': 'true' }),
        ),
    h(
      'div',
      { class: 'cg-hero__body' },
      block.eyebrow === undefined
        ? null
        : h('p', { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(tag, { class: 'cg-hero__title', 'data-field': 'title' }, block.title),
      block.subtitle === undefined
        ? null
        : h('p', { class: 'cg-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
      actionList(ctx, block.actions, ctx.t('hero.actions')),
    ),
  )
}
