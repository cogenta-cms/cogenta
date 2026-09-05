import { defineTheme } from '@cogenta/render'

/**
 * Contract D — Thème, `theme@1.4`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them — see
 * `@cogenta/theme-canonical/theme.config.ts` for why that order matters
 * (installation refuses an incomplete theme).
 */
export default defineTheme({
  name: 'blog',
  version: '1.0.0',
  description:
    'A reading-first personal/professional blog: an editorial cover hero, serif reading typography, a genuine dark mode.',
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
  collections: ['post', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
