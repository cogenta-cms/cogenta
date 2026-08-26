import type { FieldAdminMeta, FieldKind, SchemaField } from '../schema/types.js'

/**
 * The admin's own copy of contract B's twelve-block vocabulary
 * (`packages/blocks/src/vocabulary.ts`), for the same reason
 * `schema/types.ts` copies `/api/schema`'s shape: the admin is a browser
 * bundle and never imports `@cogenta/blocks`. Keep the two in sync by hand —
 * `packages/admin/test/blocks/vocabulary-sync.test.ts` compares the two at
 * test time (Node, never the shipped bundle) so a divergence fails loudly
 * instead of silently drifting (fiche 03, "Décisions à prendre").
 *
 * There is no served JSON manifest of block schemas (only collection schemas
 * reach `/api/schema`), so this table is hand-baked rather than fetched —
 * unlike `schema/types.ts`, which mirrors a shape a route actually returns.
 *
 * A block field whose contract-B kind is `f.list(...)` still compiles to an
 * admin `json` field — contract A has no `array` kind, and the value written
 * back is exactly the same JSON array the server has always accepted — but
 * `options.list`/`options.items` now describe the shape of one element, so
 * `FieldInput` can hand it to `RepeaterField` instead of a raw textarea
 * (fiche 03 task 2). This is a change of editor, never of format.
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

/**
 * The kind of one field inside a repeated item.
 *
 * A strict superset of contract A's `FieldKind`, by exactly one member:
 * `'link'`, which names contract B's `LinkTarget` union (`{ href }` or
 * `{ collection, id }`) — a shape no single contract-A field kind
 * represents, and one this admin alone needs an editor for. It is scoped to
 * this file's `ItemFieldDefinition` and to `RepeaterField`/`LinkTargetField`,
 * which read it; it is never assignable to a real `SchemaField`, and no
 * contract gains a sixteenth kind because of it.
 */
export type ItemFieldKind = FieldKind | 'link'

/** One field inside a repeated item's shape (an `f.list(...)`'s element). */
export interface ItemFieldDefinition {
  readonly name: string
  readonly kind: ItemFieldKind
  readonly required: boolean
  readonly localized: boolean
  readonly admin?: FieldAdminMeta
  readonly options: Readonly<Record<string, unknown>>
}

function itemField(
  name: string,
  kind: ItemFieldKind,
  opts: { required?: boolean; localized?: boolean; options?: Record<string, unknown> } = {},
): ItemFieldDefinition {
  return {
    name,
    kind,
    required: opts.required ?? false,
    localized: opts.localized ?? false,
    options: opts.options ?? {},
  }
}

/**
 * A repeated, structured field — the admin-side mirror of contract B's
 * `f.list(...)`. Still an admin `json` field (`options.list: true` is the
 * marker `FieldInput` looks for), carrying the shape of one element in
 * `options.items` so `RepeaterField` knows what to render instead of a
 * textarea.
 *
 * `keyed` says whether each item carries a `_key` (contract B's stable
 * identity for a reordered element). Most item schemas do
 * (`z.strictObject({ _key: itemKey, … })`); `actionSchema`
 * (`packages/blocks/src/action.ts`) does not, and its `z.strictObject`
 * *rejects* an unrecognised key outright — so `RepeaterField` must never
 * invent one there. Defaults to `true` because that is the common case.
 */
function listField(
  name: string,
  items: readonly ItemFieldDefinition[],
  opts: {
    required?: boolean
    localized?: boolean
    min?: number
    max?: number
    keyed?: boolean
  } = {},
): SchemaField {
  return field(name, 'json', {
    ...(opts.required === undefined ? {} : { required: opts.required }),
    ...(opts.localized === undefined ? {} : { localized: opts.localized }),
    options: { list: true, items, min: opts.min, max: opts.max, keyed: opts.keyed ?? true },
  })
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

/** `packages/blocks/src/action.ts`'s `actionSchema` — `hero.actions` and `cta.actions` share this exact shape. */
const ACTION_ITEM_FIELDS: readonly ItemFieldDefinition[] = [
  itemField('label', 'text', { required: true }),
  itemField('target', 'link', { required: true }),
  itemField('emphasis', 'select', { options: selectOptions(['primary', 'secondary']) }),
]

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
      listField('actions', ACTION_ITEM_FIELDS, { localized: true, max: 3, keyed: false }),
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
      listField(
        'items',
        [
          itemField('icon', 'text'),
          itemField('title', 'text', { required: true }),
          itemField('text', 'text'),
          itemField('link', 'link'),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'cta',
    label: 'Appel à action',
    fields: [
      field('title', 'text', { required: true, localized: true }),
      field('text', 'text', { localized: true }),
      listField('actions', ACTION_ITEM_FIELDS, {
        required: true,
        localized: true,
        min: 1,
        max: 3,
        keyed: false,
      }),
    ],
  },
  {
    name: 'gallery',
    label: 'Galerie',
    fields: [
      listField('items', [itemField('media', 'media', { required: true })], {
        required: true,
        min: 1,
      }),
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
      listField(
        'items',
        [
          itemField('question', 'text', { required: true }),
          itemField('answer', 'richText', { required: true }),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'stats',
    label: 'Statistiques',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'items',
        [
          itemField('value', 'text', { required: true }),
          itemField('unit', 'text'),
          itemField('label', 'text', { required: true }),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'logos',
    label: 'Logos',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'items',
        [
          itemField('media', 'media', { required: true }),
          itemField('name', 'text', { required: true }),
          itemField('url', 'text'),
        ],
        { required: true, min: 1 },
      ),
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
  // ---- blocks@2.0 (RFC 0001), fiche 43 sous-chantier C-i ---------------------
  {
    name: 'testimonial',
    label: 'Témoignage',
    fields: [
      field('quote', 'richText', { required: true, localized: true }),
      // Mirrors `testimonialAttributionSchema` ({name, role?, avatar?}) opaquely,
      // same choice as `collectionList`'s `filter`/`sort` — a single nested
      // object has no admin editor of its own yet.
      field('attribution', 'json', { required: true }),
    ],
  },
  {
    name: 'pricingTable',
    label: 'Tableau de tarifs',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'tiers',
        [
          itemField('name', 'text', { required: true }),
          itemField('price', 'text', { required: true }),
          itemField('interval', 'text'),
          // Array of strings — opaque JSON, same reasoning as
          // `testimonial.attribution` above. `sample: []` is valid on the
          // real side too: `features` has no `.min()`, only `.max(20)`.
          itemField('features', 'json', { required: true, options: { sample: [] } }),
          // A nested Action object, `.optional()` on the real side — never
          // included in a generated sample (see the test's own skip-if-not-
          // required rule), so it needs no sample value here.
          itemField('action', 'json'),
          itemField('highlighted', 'boolean'),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'accordion',
    label: 'Accordéon',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'items',
        [
          itemField('question', 'text', { required: true }),
          itemField('answer', 'richText', { required: true }),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'statCounter',
    label: 'Chiffres clés',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'stats',
        [
          itemField('value', 'text', { required: true }),
          itemField('label', 'text', { required: true }),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'logoStrip',
    label: 'Bandeau de logos',
    fields: [
      listField('logos', [itemField('media', 'media', { required: true })], {
        required: true,
        min: 1,
      }),
      field('caption', 'text', { localized: true }),
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
