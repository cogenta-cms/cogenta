import type { LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Stockists, makers, publications: their marks along one ruled row, as
 * many as there are, each set small and in its own colours. A mark drawn for paper sits on a pale plate
 * in the dark scheme so it never disappears.
 *
 * The organisation's name is the mark's accessible name when the media
 * library has no alt text for it, and the link's own name when it links out.
 */
export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'ce-marks',
    {},
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'ce-marks__items' },
      block.items.map((item) => {
        const mark = image(ctx, item.media, {
          className: 'ce-marks__image',
          altFrom: item.name,
          sizes: '10rem',
        })
        return h(
          'li',
          { class: 'ce-marks__item' },
          item.url === undefined
            ? h('span', { class: 'ce-marks__plate' }, mark)
            : h(
                'a',
                {
                  class: 'ce-marks__plate',
                  href: item.url,
                  'aria-label': item.name,
                  rel: 'noopener noreferrer',
                },
                mark,
              ),
        )
      }),
    ),
  )
}
