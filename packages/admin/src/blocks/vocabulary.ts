import type { FieldKind, SchemaField } from '../schema/types.js'

/**
 * The admin's own copy of contract B's twelve-block vocabulary
 * (`packages/blocks/src/vocabulary.ts`), for the same reason
 * `schema/types.ts` copies `/api/schema`'s shape: the admin is a browser
 * bundle and never imports `@cogenta/blocks`. Keep the two in sync by hand.
 *
 * There is no served JSON manifest of block schemas (only collection schemas
 * reach `/api/schema`), so this table is hand-baked rather than fetched —
 * unlike `schema/types.ts`, which mirrors a shape a route actually returns.
 *
 * A block field whose contract-B kind is `f.list(...)` compiles to an
 * admin `json` field, exactly as it compiles to a `json` `BlockField` on the
 * server: contract A has no `array` kind, so a repeated, structured value
 * (`items`, `actions`, `filter`, `sort`) is edited as JSON here rather than
 * inventing a repeater UI in this pass — the same honest fallback already
 * used for the top-level `json` field kind.
 */

function field(
  name: string,
  kind: FieldKind,
  opts: { required?: boolean; localized?: boolean; options?: Record<string, unknown> } = {},
): SchemaField {
  return {
    name,
    kind,
    required: opts.required ?? false,
    localized: opts.localized ?? false,
    unique: false,
    hasCustomValidation: false,
    options: opts.options ?? {},
  }
}

function selectOptions(values: readonly string[]): { options: { value: string }[] } {
  return { options: values.map((value) => ({ value })) }
}

const RATIOS = ['original', '1:1', '4:3', '3:2', '16:9', '21:9'] as const
const EMBED_PROVIDERS = [
  'youtube',
  'vimeo',
  'dailymotion',
  'spotify',
  'soundcloud',
  'bluesky',
  'mastodon',
  'other',
] as const

export interface BlockDefinition {
  readonly name: string
  readonly label: string
  readonly fields: readonly SchemaField[]
}

export const BLOCK_VOCABULARY: readonly BlockDefinition[] = [
  {
    name: 'hero',
    label: 'Héros',
    fields: [
      field('eyebrow', 'text', { localized: true }),
      field('title', 'text', { required: true, localized: true }),
      field('subtitle', 'text', { localized: true }),
      field('media', 'media'),
      field('actions', 'json', { localized: true }),
    ],
  },
  {
    name: 'prose',
    label: 'Texte',
    fields: [field('body', 'richText', { required: true, localized: true })],
  },
  {
    name: 'mediaFigure',
    label: 'Média et légende',
    fields: [
      field('media', 'media', { required: true }),
      field('caption', 'text', { localized: true }),
      field('credit', 'text'),
      field('ratio', 'select', { options: selectOptions(RATIOS) }),
      field('align', 'select', {
        options: selectOptions(['start', 'center', 'end', 'wide', 'full']),
      }),
    ],
  },
  {
    name: 'featureGrid',
    label: 'Grille de fonctionnalités',
    fields: [
      field('title', 'text', { localized: true }),
      field('items', 'json', { required: true, localized: true }),
    ],
  },
  {
    name: 'cta',
    label: 'Appel à action',
    fields: [
      field('title', 'text', { required: true, localized: true }),
      field('text', 'text', { localized: true }),
      field('actions', 'json', { required: true, localized: true }),
    ],
  },
  {
    name: 'gallery',
    label: 'Galerie',
    fields: [
      field('items', 'json', { required: true }),
      field('layout', 'select', {
        required: true,
        options: selectOptions(['grid', 'carousel', 'masonry']),
      }),
    ],
  },
  {
    name: 'quote',
    label: 'Citation',
    fields: [
      field('text', 'text', { required: true, localized: true }),
      field('author', 'text'),
      field('role', 'text', { localized: true }),
      field('avatar', 'media'),
    ],
  },
  {
    name: 'faq',
    label: 'FAQ',
    fields: [
      field('title', 'text', { localized: true }),
      field('items', 'json', { required: true, localized: true }),
    ],
  },
  {
    name: 'stats',
    label: 'Statistiques',
    fields: [
      field('title', 'text', { localized: true }),
      field('items', 'json', { required: true, localized: true }),
    ],
  },
  {
    name: 'logos',
    label: 'Logos',
    fields: [
      field('title', 'text', { localized: true }),
      field('items', 'json', { required: true }),
    ],
  },
  {
    name: 'collectionList',
    label: 'Liste de contenus',
    fields: [
      field('title', 'text', { localized: true }),
      field('collection', 'text', { required: true }),
      field('filter', 'json'),
      field('sort', 'json'),
      field('limit', 'number'),
      field('layout', 'select', {
        required: true,
        options: selectOptions(['list', 'grid', 'carousel']),
      }),
    ],
  },
  {
    name: 'embed',
    label: 'Contenu externe',
    fields: [
      field('provider', 'select', { required: true, options: selectOptions(EMBED_PROVIDERS) }),
      field('url', 'text', { required: true }),
      field('ratio', 'select', { options: selectOptions(RATIOS) }),
      field('consentRequired', 'boolean', { required: true }),
    ],
  },
]

export function blockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_VOCABULARY.find((block) => block.name === type)
}

let counter = 0
/** A block's `key` must survive reorder, translation and version restore (contract B) — minted once, never recomputed from position. */
export function freshBlockKey(): string {
  counter += 1
  return `b${Date.now().toString(36)}${counter.toString(36)}`
}
