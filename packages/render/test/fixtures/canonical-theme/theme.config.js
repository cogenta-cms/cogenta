// A well-formed theme. Plain JavaScript so that the default manifest loader can
// import it without a bundler, which is exactly how an installed theme ships.
export const theme = {
  name: 'canonical',
  version: '1.0.0',
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
    // `blocks@2.0` (ADR-0030, RFC 0001) widened the vocabulary to seventeen;
    // a well-formed theme must implement every one of them.
    'testimonial',
    'pricingTable',
    'accordion',
    'statCounter',
    'logoStrip',
  ],
  collections: '*',
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
}
