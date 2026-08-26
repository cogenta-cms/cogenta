import { defineTheme } from '@cogenta/render'

/**
 * Contract D — Thème, `theme@1.0`/`1.1`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them, unabridged: a theme that omits
 * one fails installation, which is the guarantee that a site can switch to
 * this theme without a single block losing its rendering.
 *
 * `runtime: 'static'` is what *this theme* needs, not what every page needs —
 * `collectionList` alone is `runtime: 'server'` in the vocabulary, and that is
 * the block's own declaration, never restated here.
 */
export default defineTheme({
  name: 'ecommerce',
  version: '1.1.0',
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
  collections: ['article', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
