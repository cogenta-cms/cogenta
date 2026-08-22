import { defineTheme } from '@cogenta/theme-kit'

/**
 * Contract D — Thème, `theme@1.0`/`1.1`.
 *
 * `implements` lists the twelve blocks of contract B in the order the
 * contract lists them. `runtime: 'static'` describes what this theme itself
 * needs to render a page — `collectionList` stays `runtime: 'server'` in the
 * vocabulary regardless, and it is that block, not this manifest, that forces
 * a server for the pages that use it.
 */
export default defineTheme({
  name: 'magazine',
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
