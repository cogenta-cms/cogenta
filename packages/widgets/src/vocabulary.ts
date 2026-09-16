import { richTextDocumentSchema } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import { z } from 'zod'

/**
 * The widget vocabulary (L30 D3): every kind of widget a site can place in a
 * widget area, and the settings each one takes.
 *
 * Closed on purpose, like contract B's block vocabulary, but distinct from it:
 * a widget is not a block of a page. It is placed once, in an area the theme
 * owns, and repeated on every page its visibility rules allow. Several widgets
 * are also impossible as blocks, because they read the page being shown (the
 * entries related to it, its table of contents).
 *
 * Every setting is data (R3). WordPress's "Custom HTML" widget is the one
 * deliberately absent: a widget never stores markup.
 */

const url = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => /^(https?:\/\/|\/|#|mailto:|tel:)/u.test(value), {
    message:
      'must be an absolute http(s) URL, a site path starting with "/", "#…", mailto: or tel:',
  })
const shortText = z.string().trim().max(200)
const longText = z.string().trim().max(2000)
const identifierLike = z.string().trim().min(1).max(128)
const count = (max: number) => z.number().int().min(1).max(max)

const link = z.strictObject({
  label: shortText.min(1),
  href: url,
  newTab: z.boolean().default(false),
})

export const WIDGET_SETTINGS = {
  // --- Content -------------------------------------------------------------
  text: z.strictObject({ body: richTextDocumentSchema }),
  image: z.strictObject({
    media: identifierLike,
    alt: shortText.default(''),
    caption: shortText.default(''),
    href: url.optional(),
  }),
  gallery: z.strictObject({
    media: z.array(identifierLike).min(1).max(24),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  embed: z.strictObject({ url, caption: shortText.default('') }),
  quote: z.strictObject({
    text: longText.min(1),
    attribution: shortText.default(''),
    role: shortText.default(''),
  }),
  cta: z.strictObject({
    heading: shortText.min(1),
    body: longText.default(''),
    label: shortText.min(1),
    href: url,
  }),
  links: z.strictObject({ items: z.array(link).min(1).max(30) }),
  contact: z.strictObject({
    address: longText.default(''),
    phone: shortText.default(''),
    email: shortText.default(''),
    hours: z
      .array(z.strictObject({ label: shortText.min(1), value: shortText.min(1) }))
      .max(14)
      .default([]),
  }),
  about: z.strictObject({
    media: identifierLike.optional(),
    heading: shortText.default(''),
    body: longText.min(1),
    link: link.optional(),
  }),

  // --- Dynamic: read the site at render time -------------------------------
  recentEntries: z.strictObject({
    collection: identifierLike,
    count: count(20).default(5),
    showDate: z.boolean().default(true),
    showExcerpt: z.boolean().default(false),
    showImage: z.boolean().default(false),
    /** Only entries classified under this term. */
    taxonomy: identifierLike.optional(),
    termId: identifierLike.optional(),
  }),
  relatedEntries: z.strictObject({
    count: count(12).default(4),
    showDate: z.boolean().default(false),
    showImage: z.boolean().default(true),
  }),
  popularEntries: z.strictObject({
    collection: identifierLike.optional(),
    count: count(20).default(5),
    days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).default(30),
    showImage: z.boolean().default(false),
  }),
  terms: z.strictObject({
    taxonomy: identifierLike,
    showCounts: z.boolean().default(true),
    hierarchical: z.boolean().default(true),
    hideEmpty: z.boolean().default(true),
    display: z.enum(['list', 'dropdown']).default('list'),
  }),
  tagCloud: z.strictObject({
    taxonomy: identifierLike,
    maxTerms: count(100).default(30),
    showCounts: z.boolean().default(false),
  }),
  archives: z.strictObject({
    collection: identifierLike,
    granularity: z.enum(['month', 'year']).default('month'),
    showCounts: z.boolean().default(true),
    display: z.enum(['list', 'dropdown']).default('list'),
    limit: count(120).default(24),
  }),
  recentComments: z.strictObject({ count: count(20).default(5) }),
  search: z.strictObject({ placeholder: shortText.default('') }),
  menu: z.strictObject({ menuId: identifierLike }),
  social: z.strictObject({
    /** Absent: the site's own `general.socialLinks`. */
    items: z.array(link).max(12).optional(),
  }),
  form: z.strictObject({ form: identifierLike }),
  toc: z.strictObject({ maxDepth: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3) }),
  calendar: z.strictObject({ collection: identifierLike }),
} as const

export type WidgetType = keyof typeof WIDGET_SETTINGS
export const WIDGET_TYPES = Object.keys(WIDGET_SETTINGS) as readonly WidgetType[]

export type WidgetSettings<T extends WidgetType> = z.infer<(typeof WIDGET_SETTINGS)[T]>

/** Widgets whose content comes from the site at render time rather than from their settings. */
export const DYNAMIC_WIDGET_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  'recentEntries',
  'relatedEntries',
  'popularEntries',
  'terms',
  'tagCloud',
  'archives',
  'recentComments',
  'menu',
  'social',
  'toc',
  'calendar',
])

/** Widgets that only mean something beside one entry (they read the page being shown). */
export const ENTRY_WIDGET_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  'relatedEntries',
  'toc',
])

export function isWidgetType(value: unknown): value is WidgetType {
  return typeof value === 'string' && Object.hasOwn(WIDGET_SETTINGS, value)
}

/**
 * Widget types a site's plugins add to the closed vocabulary above (L32 step
 * 4), as `type` → the schema its settings must satisfy.
 *
 * Passed in rather than registered globally: this package validates, it does
 * not discover. The host loads the plugins, builds the schemas, and hands the
 * map to the store — the same direction the block registry already runs in.
 */
export type ExtraWidgetTypes = ReadonlyMap<string, z.ZodType<Record<string, unknown>>>

function invalid(message: string, details: Record<string, unknown>): CogentaError {
  return new CogentaError({
    code: 'WIDGET_INVALID',
    message,
    hint: 'Check the widget type and its settings against the widget vocabulary of @cogenta/widgets.',
    details,
  })
}

/**
 * Validates and normalises a widget's settings: defaults filled in, unknown
 * keys refused. The one gate every write goes through, so a stored widget
 * always renders.
 */
export function validateWidgetSettings(
  type: unknown,
  settings: unknown,
  extra?: ExtraWidgetTypes,
): Record<string, unknown> {
  if (!isWidgetType(type)) {
    // A type one of this site's plugins provides: validated against the
    // schema that plugin declared, and refused the same way as anything else
    // when the plugin is not installed — a widget nothing can render must not
    // be storable.
    const provided = typeof type === 'string' ? extra?.get(type) : undefined
    if (provided !== undefined) {
      const result = provided.safeParse(settings ?? {})
      if (result.success) return result.data
      const problem = result.error.issues[0]
      throw invalid(
        `The ${type} widget's settings are not valid${
          problem?.path.length ? ` at "${problem.path.join('.')}"` : ''
        }: ${problem?.message ?? 'unknown problem'}.`,
        { type, issues: result.error.issues.map((item) => item.message) },
      )
    }
    throw invalid(`"${String(type)}" is not a widget type.`, {
      type,
      known: [...WIDGET_TYPES, ...(extra === undefined ? [] : [...extra.keys()])],
    })
  }
  const parsed = WIDGET_SETTINGS[type].safeParse(settings ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.join('.') ?? ''
    throw invalid(
      `The ${type} widget's settings are not valid${path === '' ? '' : ` at "${path}"`}: ${issue?.message ?? 'unknown problem'}.`,
      { type, path, issues: parsed.error.issues.map((item) => item.message) },
    )
  }
  if (type === 'recentEntries') {
    const value = parsed.data as WidgetSettings<'recentEntries'>
    if ((value.taxonomy === undefined) !== (value.termId === undefined)) {
      throw invalid('A term filter needs both a taxonomy and a term.', { type })
    }
  }
  return parsed.data as Record<string, unknown>
}
