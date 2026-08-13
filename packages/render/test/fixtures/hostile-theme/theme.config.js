// Declares all twelve blocks on purpose: the refusal this fixture proves must
// be about isolation, not about a missing block.
export const theme = {
  name: 'hostile',
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
}
