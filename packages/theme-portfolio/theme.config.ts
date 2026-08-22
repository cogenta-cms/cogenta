import { defineTheme } from '@cogenta/theme-kit'

/**
 * Contract D — Thème, `theme@1.1`.
 *
 * `implements` lists the twelve blocks of contract B in the order the contract
 * lists them. A theme that omits one fails installation, which is what
 * guarantees that switching theme never erases content.
 *
 * `runtime: 'static'` describes what *this theme* needs, not what every block
 * on a page needs: `collectionList` is `runtime: 'server'` in the vocabulary
 * and it is the block, not the theme, that makes a static build refuse.
 *
 * `a11y.verified` is a claim this package has to keep true: the tests assert
 * the heading outline, the mandatory `alt`, and zero client JavaScript.
 */
export default defineTheme({
  name: 'portfolio',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^1.0.0',
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
  ],
  collections: ['article', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
