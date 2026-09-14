import { defineTheme } from '@cogenta/theme-kit'

/**
 * Contract D — Thème, `theme@1.4`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them. A theme that omits one fails
 * installation, which is what guarantees that switching theme never erases
 * content.
 *
 * `runtime: 'static'` describes what *this theme* needs, not what every block
 * on a page needs: `collectionList` is `runtime: 'server'` in the vocabulary
 * and it is the block, not the theme, that makes a static build refuse.
 *
 * `a11y.verified` is a claim this package has to keep true: the tests assert
 * the heading outline, the mandatory `alt`, and zero client JavaScript.
 *
 * L27 studio redesign: Archivo on its width axis, black and white with one
 * signal colour, an asymmetric work grid of 3:2 covers, a project page with
 * its lead visual and fact sheet, every block redrawn with hairlines and
 * space rather than boxes.
 */
export default defineTheme({
  name: 'portfolio',
  version: '1.3.0',
  description:
    'A theme for an independent design studio: work shown large on an asymmetric grid, Archivo set wide for display, black and white with one signal colour, zero client JavaScript.',
  author: 'Cogenta',
  engine: '^1.0.0',
  blocks: '^2.0.0',
  implements: [
    'hero',
    'prose',
    'mediaFigure',
    'featureGrid',
    'cta',
    'gallery',
    'quote',
    'faq',
    'stats',
    'logos',
    'collectionList',
    'embed',
    'testimonial',
    'pricingTable',
    'accordion',
    'statCounter',
    'logoStrip',
  ],
  collections: ['project', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
