// A well-formed theme. Plain JavaScript so that the default manifest loader can
// import it without a bundler, which is exactly how an installed theme ships.
export const theme = {
  name: 'canonical',
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
  collections: '*',
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
}
