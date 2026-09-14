import { defineTheme } from '@cogenta/render'

/**
 * Contract D — Thème, `theme@1.5`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them: installation refuses an
 * incomplete theme.
 *
 * `runtime: 'static'` describes what this theme package itself needs; the
 * one block in the vocabulary that reads at request time (`collectionList`)
 * declares `runtime: 'server'` on its own, in the vocabulary.
 */
export default defineTheme({
  name: 'saas',
  version: '2.0.0',
  description:
    'A B2B software theme: white and a structured grey scale, near-black ink and one signal blue, Geist and Geist Mono, framed product screenshots, a ruled plan comparison and a designed dark mode.',
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
  collections: ['article', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
