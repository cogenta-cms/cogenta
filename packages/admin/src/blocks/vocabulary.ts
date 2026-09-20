import type { FieldAdminMeta, FieldKind, SchemaField } from '../schema/types.js'
import { FIELD_KINDS } from '../schema/types.js'

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
  /**
   * Admin-editor-only: hide this row's input unless a sibling field in the
   * same item currently holds one of `equals`. Never read by contract B or
   * by `fieldsFromRows`-style save logic — purely how `RepeaterField`
   * decides what to render, so an item with, say, `kind: 'email'` doesn't
   * show `choicesText`/`consentText`/file-only inputs that can never apply
   * to it (found auditing the forms builder screen end to end, 2026-08-26:
   * every property for every field kind was shown at once, unlike any
   * comparable form builder).
   */
  readonly visibleWhen?: { readonly field: string; readonly equals: readonly unknown[] }
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

/**
 * A structured value edited as its own fields rather than as JSON (L36
 * audit): the stored shape is unchanged, only the editor differs.
 */
function objectField(
  name: string,
  items: readonly ItemFieldDefinition[],
  opts: { required?: boolean } = {},
): SchemaField {
  return field(name, 'json', {
    ...(opts.required === undefined ? {} : { required: opts.required }),
    options: { object: true, items },
  })
}

/** The symbol names every theme's icon set resolves (`@cogenta/theme-kit`'s `ICON_NAMES`). */
const ICON_NAMES = [
  'check',
  'star',
  'bolt',
  'shield',
  'chart',
  'users',
  'user',
  'globe',
  'clock',
  'heart',
  'leaf',
  'mail',
  'phone',
  'map-pin',
  'calendar',
  'book',
  'code',
  'cloud',
  'lock',
  'search',
  'settings',
  'sparkles',
  'truck',
  'credit-card',
  'gift',
  'coffee',
  'utensils',
  'wine',
  'camera',
  'pen',
  'layers',
  'rocket',
  'trending-up',
  'award',
  'smile',
  'sun',
  'moon',
  'arrow-right',
  'arrow-up-right',
  'external-link',
  'download',
  'play',
  'quote',
  'tag',
  'briefcase',
  'home',
  'message',
  'bell',
  'refresh',
  'image',
  'zap',
] as const

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
    label: 'Hero',
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
    label: 'Text',
    fields: [field('body', 'richText', { required: true, localized: true })],
  },
  {
    name: 'mediaFigure',
    label: 'Media and caption',
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
    label: 'Feature grid',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'items',
        [
          itemField('icon', 'select', { options: selectOptions(ICON_NAMES) }),
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
    label: 'Call to action',
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
    label: 'Gallery',
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
    label: 'Quote',
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
    label: 'Statistics',
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
    label: 'Content list',
    fields: [
      field('title', 'text', { localized: true }),
      // Filled with the site's own collections when the form renders.
      field('collection', 'select', {
        required: true,
        options: { options: [], collectionPicker: true },
      }),
      objectField('sort', [
        // The three system columns, plus the dates this collection declares
        // itself, filled in when the form renders (L40, ADR-0038).
        itemField('field', 'select', {
          required: true,
          options: { ...selectOptions(['createdAt', 'updatedAt', 'id']), dateSortPicker: true },
        }),
        itemField('direction', 'select', {
          required: true,
          options: selectOptions(['desc', 'asc']),
        }),
      ]),
      field('limit', 'number', { options: { min: 1, max: 100 } }),
      field('filter', 'json'),
      field('layout', 'select', {
        required: true,
        options: selectOptions(['list', 'grid', 'carousel']),
      }),
    ],
  },
  {
    name: 'embed',
    label: 'External content',
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
    label: 'Testimonial',
    fields: [
      field('quote', 'richText', { required: true, localized: true }),
      // Mirrors `testimonialAttributionSchema` ({name, role?, avatar?}), now
      // edited as its own three fields (L36 audit) rather than as JSON.
      objectField(
        'attribution',
        [
          itemField('name', 'text', { required: true }),
          itemField('role', 'text'),
          itemField('avatar', 'media'),
        ],
        { required: true },
      ),
    ],
  },
  {
    name: 'pricingTable',
    label: 'Pricing table',
    fields: [
      field('title', 'text', { localized: true }),
      listField(
        'tiers',
        [
          itemField('name', 'text', { required: true }),
          itemField('price', 'text', { required: true }),
          itemField('interval', 'text'),
          // An array of strings, edited one line per feature (L36 audit).
          // `sample: []` is valid on the real side too: `features` has no
          // `.min()`, only `.max(20)`.
          itemField('features', 'json', {
            required: true,
            options: { stringList: true, sample: [] },
          }),
          // A nested Action object, `.optional()` on the real side, edited as
          // its own fields; never included in a generated sample (see the
          // test's own skip-if-not-required rule).
          itemField('action', 'json', { options: { object: true, items: ACTION_ITEM_FIELDS } }),
          itemField('highlighted', 'boolean'),
        ],
        { required: true, localized: true, min: 1 },
      ),
    ],
  },
  {
    name: 'accordion',
    label: 'Accordion',
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
    label: 'Key figures',
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
    label: 'Logo strip',
    fields: [
      listField('logos', [itemField('media', 'media', { required: true })], {
        required: true,
        min: 1,
      }),
      field('caption', 'text', { localized: true }),
    ],
  },
]

/**
 * The blocks this particular site's plugins provide (L32).
 *
 * Unlike the vocabulary above, these cannot be baked into the bundle: they
 * depend on which plugins are installed on the site being administered, so
 * they are fetched once at start-up (`GET /api/blocks`) and registered here.
 * A module-level registry rather than a context because every consumer of
 * `blockDefinition` — the blocks field, the builder's library, the outline —
 * asks for a block by name from deep inside a render, and one admin session
 * administers exactly one site.
 */
let pluginBlocks: readonly BlockDefinition[] = []

/** The wire shape `/api/plugins/blocks` answers: every field's kind is a plain string. */
export interface PluginBlockWireDefinition {
  readonly name: string
  readonly label: string
  readonly fields: readonly {
    readonly name: string
    readonly kind: string
    readonly required: boolean
    readonly localized: boolean
    readonly options: Readonly<Record<string, unknown>>
    readonly admin?: FieldAdminMeta
  }[]
}

/**
 * Contract B declares a select's choices as plain strings — `f.select({
 * options: ['start', 'center'] })` — and `@cogenta/blocks` refuses a plugin
 * manifest that declares them any other way. This admin's own mirror of the
 * vocabulary holds the same choices as `{ value }` objects, which
 * `selectOptions` builds by hand for each of the seventeen.
 *
 * Nothing did that for a plugin's fields. The strings arrived where the form
 * expected objects, `choice.value` was `undefined`, and `localizeBlockField`
 * called `.replaceAll` on it — so inserting a plugin block turned the builder
 * white and took the unsaved page with it. This is that conversion, applied
 * once, at the boundary where an external declaration becomes a field this
 * admin renders.
 */
function normaliseSelectOptions(
  options: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const choices = options['options']
  if (!Array.isArray(choices)) return options
  return {
    ...options,
    options: choices.map((choice) => (typeof choice === 'string' ? { value: choice } : choice)),
  }
}

/**
 * Narrowed rather than cast: this is data from a server that may be newer
 * than this bundle, and a field kind no editor here can render is dropped —
 * the block still places, with the fields this admin understands, instead of
 * the screen breaking on a kind it has never heard of.
 */
export function registerPluginBlocks(blocks: readonly PluginBlockWireDefinition[]): void {
  pluginBlocks = blocks.map((block) => ({
    name: block.name,
    label: block.label,
    fields: block.fields
      .filter((candidate): candidate is typeof candidate & { kind: FieldKind } =>
        (FIELD_KINDS as readonly string[]).includes(candidate.kind),
      )
      .map((candidate) => ({
        name: candidate.name,
        kind: candidate.kind,
        required: candidate.required,
        localized: candidate.localized,
        unique: false,
        hasCustomValidation: false,
        options: normaliseSelectOptions(candidate.options),
        ...(candidate.admin === undefined ? {} : { admin: candidate.admin }),
      })),
  }))
}

/** What a plugin provides, for a screen that needs to say so. */
export function pluginBlockDefinitions(): readonly BlockDefinition[] {
  return pluginBlocks
}

/** Every block this site can place: the frozen vocabulary, then what its plugins add. */
export function allBlockDefinitions(): readonly BlockDefinition[] {
  return pluginBlocks.length === 0 ? BLOCK_VOCABULARY : [...BLOCK_VOCABULARY, ...pluginBlocks]
}

export function blockDefinition(type: string): BlockDefinition | undefined {
  return allBlockDefinitions().find((block) => block.name === type)
}

/**
 * What a block holds the moment it is placed: every required choice set to
 * its first option (L36 audit — a new list asked for a layout, a new embed
 * for a service, before anything could be previewed). Text stays empty: a
 * title is the editor's to write.
 */
export function startingBlockData(type: string): Readonly<Record<string, unknown>> {
  const definition = blockDefinition(type)
  if (definition === undefined) return {}
  const data: Record<string, unknown> = {}
  for (const candidate of definition.fields) {
    const choices = candidate.options['options']
    if (candidate.kind !== 'select' || !candidate.required || !Array.isArray(choices)) continue
    const first = (choices as readonly { value?: unknown }[])[0]
    if (typeof first?.value === 'string') data[candidate.name] = first.value
  }
  return data
}

let counter = 0
/** A block's `key` must survive reorder, translation and version restore (contract B) — minted once, never recomputed from position. */
export function freshBlockKey(): string {
  counter += 1
  return `b${Date.now().toString(36)}${counter.toString(36)}`
}
