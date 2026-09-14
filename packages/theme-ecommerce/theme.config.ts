import { defineTheme } from '@cogenta/render'

/**
 * Contract D, `theme@1.5`: the product page reads `PageEntryMeta.fields`
 * (price, stock, category, details) and renders the plain page header of
 * `1.4` when a host does not send them.
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
  version: '1.3.0',
  description:
    'A shop for a brand of durable everyday goods: sand and ink, Albert Sans, product photographs at 4:5, a product page with price, stock and details, zero client JavaScript.',
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
  collections: ['product', 'category', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
