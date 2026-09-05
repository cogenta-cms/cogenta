import { defineTheme } from '@cogenta/render'

/**
 * Contract D — Thème, `theme@1.4`.
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
    'A warm, human theme for a nonprofit or community group: dated event cards, an impact band, and a genuine dark mode.',
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
  collections: ['event', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
