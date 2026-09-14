import type { LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * The organisations that work alongside this one: the title on the first
 * four columns, and their marks on the last eight in a grid of cells divided
 * by hairlines, each mark set small and in one ink so no partner shouts
 * louder than another. A mark drawn in ink is inverted in the dark scheme.
 *
 * The organisation's name is the mark's accessible name when the media
 * library has no alt text for it, and the link's own name when it links out.
 */
export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'ca-partners',
    { 'data-titled': String(block.title !== undefined) },
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'ca-partners__items' },
      block.items.map((item) => {
        const mark = image(ctx, item.media, {
          className: 'ca-mark',
          altFrom: item.name,
          sizes: '12rem',
        })
        return h(
          'li',
          { class: 'ca-partners__item' },
          item.url === undefined
            ? h('span', { class: 'ca-partners__cell' }, mark)
            : h(
                'a',
                { class: 'ca-partners__cell', href: item.url, rel: 'noopener noreferrer' },
                mark,
              ),
        )
      }),
    ),
  )
}
