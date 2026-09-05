import { defineTheme } from './src/theme-contract.js'

/**
 * Contract D — Thème, `theme@1.1`.
 *
 * `implements` must list all seventeen blocks of contract B (`blocks@2.0`), in any order —
 * this starter lists them in the contract's own order for readability. A
 * theme missing one fails installation: that's what guarantees a theme
 * switch never silently drops content a site already has.
 *
 * No `a11y` claim here on purpose: `theme-canonical`'s `WCAG-2.2-AA` claim is
 * backed by a real accessibility test suite (`packages/theme-canonical/test/
 * accessibility.test.ts`). This starter has none yet — claiming a standard
 * you have not actually verified is worse than naming the gap. Add the field
 * back once you've written that test against your own markup.
 */
export default defineTheme({
  name: 'theme-starter',
  version: '0.1.0',
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
  collections: '*',
  runtime: 'static',
  tokens: './tokens.json',
})
