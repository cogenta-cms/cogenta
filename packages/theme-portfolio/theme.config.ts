import { defineTheme } from '@cogenta/theme-kit'

/**
 * Contract D — Thème, `theme@1.4`.
 *
 * `implements` lists the seventeen blocks of contract B (`blocks@2.0`, RFC
 * 0001) in the order the contract lists them. A theme that omits one fails
 * installation, which is what guarantees that switching theme never erases
 * content.
 *
 * `runtime: 'static'` describes what *this theme* needs, not what every block
 * on a page needs: `collectionList` is `runtime: 'server'` in the vocabulary
 * and it is the block, not the theme, that makes a static build refuse.
 *
 * `a11y.verified` is a claim this package has to keep true: the tests assert
 * the heading outline, the mandatory `alt`, and zero client JavaScript.
 *
 * L25 pro pass: `renderChrome` now uses every `theme@1.4` field (a real
 * `headerAction` button, a CSS-only mobile menu, `tagline`/`social`/
 * `footerNote` in the footer); `renderPage` draws `renderEntryHeader` for a
 * project's own page; `collectionList`'s `grid`/`carousel` layouts show a
 * full-bleed cover card instead of the plain numbered row; dark-mode
 * elevation was rebuilt from an accent-tinted glow into a flat, zero-blur
 * offset shadow (D5, binding).
 */
export default defineTheme({
  name: 'portfolio',
  version: '1.2.0',
  description:
    'An ultra-modern creative-portfolio theme: brutalist-meets-editorial display type, an electric accent, zero client JavaScript.',
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
  collections: ['project', 'page'],
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
