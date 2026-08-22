import { defineTheme } from '@cogenta/render'

/**
 * Contract D — Thème, `theme@1.0`/`1.1`.
 *
 * `implements` lists the twelve blocks of contract B in the order the
 * contract lists them — see `@cogenta/theme-canonical/theme.config.ts` for
 * why that order matters (installation refuses an incomplete theme).
 *
 * `runtime: 'static'` describes what this theme package itself needs; the
 * one block in the vocabulary that reads at request time (`collectionList`)
 * still declares `runtime: 'server'` on its own, in the vocabulary — that is
 * a property of the block, not of the theme rendering it.
 */
export default defineTheme({
  name: 'entreprise',
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
