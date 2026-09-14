import { defineTheme } from '@cogenta/render'

/**
 * Contract D — Thème, `theme@1.5`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them — installation refuses an
 * incomplete theme.
 *
 * `runtime: 'static'` describes what this theme package itself needs; the
 * one block in the vocabulary that reads at request time (`collectionList`)
 * still declares `runtime: 'server'` on its own, in the vocabulary — that is
 * a property of the block, not of the theme rendering it.
 */
export default defineTheme({
  name: 'association',
  version: '1.0.0',
  description:
    'A neighbourhood charity: a photograph of the people it works with, impact figures with their context, programmes, a dated events calendar with event pages, and a donation ask in its own yellow.',
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
  collections: ['event', 'programme', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
