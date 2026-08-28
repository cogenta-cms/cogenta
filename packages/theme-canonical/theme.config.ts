import { defineTheme } from './src/theme-contract.js'

/**
 * Contract D — Thème, `theme@1.0`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them. A theme that omits one fails
 * installation, which is what guarantees that switching theme never erases
 * content.
 *
 * `runtime: 'static'` describes what *this theme* needs, not what every block
 * on a page needs: `collectionList` is `runtime: 'server'` in the vocabulary
 * and it is the block, not the theme, that makes a static build refuse. Saying
 * `'server'` here would force every site using the canonical theme onto a
 * server even when no page lists anything.
 *
 * `a11y.verified` is a claim this package has to keep true: the tests assert
 * the heading outline, the mandatory `alt`, and the closed token set.
 */
export default defineTheme({
  name: 'canonical',
  // Minor: the theme gained the five new blocks of `blocks@2.0` without any
  // change to how it renders the twelve it already implemented — nothing a
  // site authored before this stops rendering identically.
  version: '1.1.0',
  description:
    'The reference theme: all seventeen blocks, zero client JavaScript, a neutral, accessible default.',
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
