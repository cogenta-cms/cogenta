import { z } from 'zod'
import { actionSchema, linkTargetSchema } from './action.js'
import { defineBlock } from './define-block.js'
import { f } from './field.js'
import { plainTextSchema } from './plain-text.js'
import { richTextDocumentSchema } from './rich-text.js'
import type { BlockValue } from './types.js'

/**
 * Contract B, "Le vocabulaire — v1 douze blocs (`blocks@1.0`), élargi à
 * dix-sept en `blocks@2.0`" (RFC 0001, `docs/rfc/0001-widen-block-vocabulary.md`,
 * reopening ADR-0009 — "the vocabulary must stay small" — with the user's
 * explicit direct request for an "ultra complete" page builder, 2026-08-26).
 *
 * The original twelve still have `fallback: null` — they *are* the fallback;
 * only a block a theme ships of its own, or one of the five added below, must
 * name one. Each of the five names a **standard-vocabulary** fallback rather
 * than `null`: unlike the original twelve, a site that switches to a theme
 * built before `blocks@2.0` still renders these — degraded, never lost,
 * exactly the anti-lock-in guarantee `BlockRegistry.resolveRenderable`
 * already gives a *theme's own* private block, now also given to a block this
 * package itself introduces after a theme was already shipped.
 *
 * Nothing below stores a class, a colour, a size or a piece of markup. Where the
 * contract names a field that reads presentational, the values are recast as
 * intent the theme is free to interpret: `emphasis`, `align`, `layout`.
 */

const VERSION = '1.0.0'

/**
 * A stable key on every repeated item, for the same reason a placed block has
 * one: a reordered list must still diff as a reorder, not as a delete plus an
 * insert, and a comment anchored to the third question must follow it.
 */
const itemKey = z.string().min(1)

/** Framing of a media, not its rendered size. */
const RATIOS = ['original', '1:1', '4:3', '3:2', '16:9', '21:9'] as const

// ---------------------------------------------------------------------------
// hero
// ---------------------------------------------------------------------------

export const heroBlock = defineBlock({
  name: 'hero',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'h1' },
  schema: {
    /** The short line above the title. Semantic, not decorative: it says what kind of page this is. */
    eyebrow: f.text({ max: 80, localized: true }),
    title: f.text({ required: true, max: 200, localized: true }),
    subtitle: f.text({ max: 320, localized: true }),
    media: f.media({ accept: ['image', 'video'] }),
    actions: f.list(actionSchema, { max: 3, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// prose
// ---------------------------------------------------------------------------

export const proseBlock = defineBlock({
  name: 'prose',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  // Prose carries its own headings inside the rich text document, whose
  // vocabulary starts at h2. The block itself contributes none.
  a11y: { headingLevel: 'none' },
  schema: {
    body: f.richText({ required: true, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// mediaFigure
// ---------------------------------------------------------------------------

export const mediaFigureBlock = defineBlock({
  name: 'mediaFigure',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'none' },
  schema: {
    media: f.media({ required: true, accept: ['image', 'video'] }),
    caption: f.text({ max: 320, localized: true }),
    credit: f.text({ max: 160 }),
    ratio: f.select({ options: RATIOS }),
    /**
     * `start` and `end` rather than `left` and `right`: the contract's intent is
     * where the figure sits in the reading flow, which mirrors in right-to-left
     * locales. `left` would be a layout instruction the theme cannot honour.
     */
    align: f.select({ options: ['start', 'center', 'end', 'wide', 'full'] }),
  },
})

// ---------------------------------------------------------------------------
// featureGrid
// ---------------------------------------------------------------------------

/** `icon` names a symbol the theme's icon set resolves. It is never markup. */
const featureItemSchema = z.strictObject({
  _key: itemKey,
  icon: plainTextSchema.max(64).optional(),
  title: plainTextSchema.min(1).max(120),
  text: plainTextSchema.max(400).optional(),
  link: linkTargetSchema.optional(),
})

export type FeatureItem = z.infer<typeof featureItemSchema>

export const featureGridBlock = defineBlock({
  name: 'featureGrid',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    items: f.list(featureItemSchema, { required: true, min: 1, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// cta
// ---------------------------------------------------------------------------

export const ctaBlock = defineBlock({
  name: 'cta',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ required: true, max: 200, localized: true }),
    text: f.text({ max: 400, localized: true }),
    actions: f.list(actionSchema, { required: true, min: 1, max: 3, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// gallery
// ---------------------------------------------------------------------------

const galleryItemSchema = z.strictObject({
  _key: itemKey,
  media: z.string().min(1),
})

export type GalleryItem = z.infer<typeof galleryItemSchema>

export const galleryBlock = defineBlock({
  name: 'gallery',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'none' },
  schema: {
    items: f.list(galleryItemSchema, { required: true, min: 1 }),
    /**
     * Required rather than defaulted: a gallery read as a carousel and a gallery
     * read as a grid are different editorial choices, and leaving it implicit
     * makes the rendering depend on which theme is installed.
     */
    layout: f.select({ options: ['grid', 'carousel', 'masonry'], required: true }),
  },
})

// ---------------------------------------------------------------------------
// quote
// ---------------------------------------------------------------------------

export const quoteBlock = defineBlock({
  name: 'quote',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'none' },
  schema: {
    text: f.text({ required: true, max: 1000, localized: true }),
    author: f.text({ max: 160 }),
    role: f.text({ max: 160, localized: true }),
    avatar: f.media({ accept: ['image'] }),
  },
})

// ---------------------------------------------------------------------------
// faq
// ---------------------------------------------------------------------------

/**
 * `answer` is rich text, not plain text: an answer that cannot carry a link or
 * a list gets written as HTML by the first editor who needs one, which rule R3
 * then has to refuse. Giving it the structured form removes the temptation.
 */
const faqItemSchema = z.strictObject({
  _key: itemKey,
  question: plainTextSchema.min(1).max(320),
  answer: richTextDocumentSchema,
})

export type FaqItem = z.infer<typeof faqItemSchema>

export const faqBlock = defineBlock({
  name: 'faq',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    items: f.list(faqItemSchema, { required: true, min: 1, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

/**
 * `value` is text, not a number, so `10k+`, `~3` and `1,2` survive as written.
 * Storing a number would force this package to decide on locale formatting,
 * abbreviation and precision — decisions that belong to the editor.
 */
const statItemSchema = z.strictObject({
  _key: itemKey,
  value: plainTextSchema.min(1).max(32),
  unit: plainTextSchema.max(32).optional(),
  label: plainTextSchema.min(1).max(160),
})

export type StatItem = z.infer<typeof statItemSchema>

export const statsBlock = defineBlock({
  name: 'stats',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    items: f.list(statItemSchema, { required: true, min: 1, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// logos
// ---------------------------------------------------------------------------

const logoItemSchema = z.strictObject({
  _key: itemKey,
  media: z.string().min(1),
  /** The organisation's name. It is also the accessible name of the link. */
  name: plainTextSchema.min(1).max(160),
  url: z.url().optional(),
})

export type LogoItem = z.infer<typeof logoItemSchema>

export const logosBlock = defineBlock({
  name: 'logos',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    items: f.list(logoItemSchema, { required: true, min: 1 }),
  },
})

// ---------------------------------------------------------------------------
// collectionList
// ---------------------------------------------------------------------------

/** Mirrors contract A's index form: field first, direction second. */
const sortSchema = z.strictObject({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
})

export type CollectionSort = z.infer<typeof sortSchema>

/**
 * A filter is stored as data, never as a query string: no home-grown query
 * language is exposed publicly (spec L1, "API"), and the API layer is the one
 * that turns this into SQL.
 */
const filterSchema = z.record(z.string(), z.unknown())

export const collectionListBlock = defineBlock({
  name: 'collectionList',
  version: VERSION,
  // The only block of the twelve that reads the database at render time, so the
  // only one that cannot be built statically ahead of a request.
  runtime: 'server',
  fallback: null,
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    collection: f.text({ required: true, max: 64 }),
    filter: f.json(filterSchema),
    sort: f.json(sortSchema),
    // Capped: an uncapped list is how a listing page becomes a full table scan.
    limit: f.number({ integer: true, min: 1, max: 100 }),
    layout: f.select({ options: ['list', 'grid', 'carousel'], required: true }),
  },
})

// ---------------------------------------------------------------------------
// embed
// ---------------------------------------------------------------------------

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

export const embedBlock = defineBlock({
  name: 'embed',
  version: VERSION,
  runtime: 'static',
  fallback: null,
  a11y: { headingLevel: 'none' },
  schema: {
    /** Named, not sniffed from the URL: the theme picks a renderer from it. */
    provider: f.select({ options: EMBED_PROVIDERS, required: true }),
    url: f.text({ required: true, max: 2048, format: 'url' }),
    ratio: f.select({ options: RATIOS }),
    /**
     * Required rather than defaulted to `true`. Whether a third party may be
     * contacted before the visitor consents is a legal decision; an implicit
     * default hides it, and the wrong implicit default is a GDPR breach.
     */
    consentRequired: f.boolean({ required: true }),
  },
})

// ---------------------------------------------------------------------------
// testimonial (blocks@2.0, RFC 0001)
// ---------------------------------------------------------------------------

/**
 * A single person's attribution, not a repeated list: unlike `quote`'s own
 * flat `author`/`role`/`avatar` fields, this is the shape a testimonial wall
 * of many themes reaches for (name, role, photo, grouped) — kept as one
 * `json` field rather than three top-level ones so the grouping is explicit
 * data, not an accident of adjacent field names.
 */
const testimonialAttributionSchema = z.strictObject({
  name: plainTextSchema.min(1).max(160),
  role: plainTextSchema.max(160).optional(),
  /** A media library identifier, exactly like every other media reference in the vocabulary. */
  avatar: z.string().min(1).optional(),
})

export type TestimonialAttribution = z.infer<typeof testimonialAttributionSchema>

export const testimonialBlock = defineBlock({
  name: 'testimonial',
  version: VERSION,
  runtime: 'static',
  // Degrades to `text`(`prose`) — the quote's own body survives as an
  // attributed paragraph; only the dedicated attribution layout is lost.
  fallback: 'prose',
  a11y: { headingLevel: 'none' },
  schema: {
    quote: f.richText({ required: true, localized: true }),
    attribution: f.json(testimonialAttributionSchema, { required: true }),
  },
})

// ---------------------------------------------------------------------------
// pricingTable (blocks@2.0, RFC 0001)
// ---------------------------------------------------------------------------

/**
 * `price` is a formatted string, not a numeric/currency type — no billing
 * logic lives here (contract E, `@cogenta/commerce`, owns real money; this is
 * a marketing display of a plan, editable and localizable as free text).
 */
const pricingTierSchema = z.strictObject({
  _key: itemKey,
  name: plainTextSchema.min(1).max(120),
  price: plainTextSchema.min(1).max(64),
  interval: plainTextSchema.max(64).optional(),
  features: z.array(plainTextSchema.min(1).max(200)).max(20),
  action: actionSchema.optional(),
  /** Editorial emphasis on one tier — a "most popular" ribbon, say — never a colour or a class. */
  highlighted: z.boolean().optional(),
})

export type PricingTier = z.infer<typeof pricingTierSchema>

export const pricingTableBlock = defineBlock({
  name: 'pricingTable',
  version: VERSION,
  runtime: 'static',
  // Degrades to `featureGrid` — each tier renders as a card (name/features),
  // losing price emphasis and the side-by-side comparison layout.
  fallback: 'featureGrid',
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    tiers: f.list(pricingTierSchema, { required: true, min: 1, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// accordion (blocks@2.0, RFC 0001)
// ---------------------------------------------------------------------------

/**
 * Shaped exactly like `faq`'s own items on purpose: an accordion is the same
 * question/answer data a FAQ is, offered under the vocabulary as a distinct
 * block because "accordion" and "FAQ" are different editorial intents even
 * when the underlying content shape coincides (a features accordion is not a
 * frequently-asked-question list, and forcing an author to file one as the
 * other is exactly the kind of vocabulary-too-small friction RFC 0001 exists
 * to relieve).
 */
const accordionItemSchema = z.strictObject({
  _key: itemKey,
  question: plainTextSchema.min(1).max(320),
  answer: richTextDocumentSchema,
})

export type AccordionItem = z.infer<typeof accordionItemSchema>

export const accordionBlock = defineBlock({
  name: 'accordion',
  version: VERSION,
  runtime: 'static',
  // Degrades to `prose` — items rendered as a flat sequence of heading + body.
  fallback: 'prose',
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    items: f.list(accordionItemSchema, { required: true, min: 1, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// statCounter (blocks@2.0, RFC 0001)
// ---------------------------------------------------------------------------

/**
 * Deliberately narrower than `stats` (no `unit`): a counter row is meant for
 * a big, animated-in-spirit figure and its label, not the fuller statistic
 * shape `stats` already covers — two blocks for two editorial intents, the
 * same reasoning as `accordion` next to `faq` above.
 */
const statCounterItemSchema = z.strictObject({
  _key: itemKey,
  value: plainTextSchema.min(1).max(32),
  label: plainTextSchema.min(1).max(160),
})

export type StatCounterItem = z.infer<typeof statCounterItemSchema>

export const statCounterBlock = defineBlock({
  name: 'statCounter',
  version: VERSION,
  runtime: 'static',
  // Degrades to `featureGrid` — each stat rendered as a card.
  fallback: 'featureGrid',
  a11y: { headingLevel: 'h2' },
  schema: {
    title: f.text({ max: 200, localized: true }),
    stats: f.list(statCounterItemSchema, { required: true, min: 1, localized: true }),
  },
})

// ---------------------------------------------------------------------------
// logoStrip (blocks@2.0, RFC 0001)
// ---------------------------------------------------------------------------

/**
 * No per-logo `name`/`url`, unlike `logos`: a strip is the lighter-weight
 * "as seen in" / social-proof row, never a set of links to the organisations
 * shown, so there is no accessible-name field to require. The image's own
 * alt text (set once, in the media library) is what names each logo, exactly
 * as `logos` already falls back to when a link is absent.
 */
const logoStripItemSchema = z.strictObject({
  _key: itemKey,
  media: z.string().min(1),
})

export type LogoStripItem = z.infer<typeof logoStripItemSchema>

export const logoStripBlock = defineBlock({
  name: 'logoStrip',
  version: VERSION,
  runtime: 'static',
  // Degrades to `mediaFigure` — only the first logo renders, as a simple image.
  fallback: 'mediaFigure',
  a11y: { headingLevel: 'none' },
  schema: {
    logos: f.list(logoStripItemSchema, { required: true, min: 1 }),
    caption: f.text({ max: 320, localized: true }),
  },
})

// ---------------------------------------------------------------------------

/** The twelve of `blocks@1.0`, in the order contract B lists them. */
export const VOCABULARY_V1 = [
  heroBlock,
  proseBlock,
  mediaFigureBlock,
  featureGridBlock,
  ctaBlock,
  galleryBlock,
  quoteBlock,
  faqBlock,
  statsBlock,
  logosBlock,
  collectionListBlock,
  embedBlock,
] as const

/** The five RFC 0001 added on top, in the order the RFC lists them. */
export const VOCABULARY_V2_ADDITIONS = [
  testimonialBlock,
  pricingTableBlock,
  accordionBlock,
  statCounterBlock,
  logoStripBlock,
] as const

/** The full seventeen of `blocks@2.0`. */
export const VOCABULARY = [...VOCABULARY_V1, ...VOCABULARY_V2_ADDITIONS] as const

export const VOCABULARY_NAMES = VOCABULARY.map((block) => block.name)

export type HeroBlock = BlockValue<typeof heroBlock>
export type ProseBlock = BlockValue<typeof proseBlock>
export type MediaFigureBlock = BlockValue<typeof mediaFigureBlock>
export type FeatureGridBlock = BlockValue<typeof featureGridBlock>
export type CtaBlock = BlockValue<typeof ctaBlock>
export type GalleryBlock = BlockValue<typeof galleryBlock>
export type QuoteBlock = BlockValue<typeof quoteBlock>
export type FaqBlock = BlockValue<typeof faqBlock>
export type StatsBlock = BlockValue<typeof statsBlock>
export type LogosBlock = BlockValue<typeof logosBlock>
export type CollectionListBlock = BlockValue<typeof collectionListBlock>
export type EmbedBlock = BlockValue<typeof embedBlock>
export type TestimonialBlock = BlockValue<typeof testimonialBlock>
export type PricingTableBlock = BlockValue<typeof pricingTableBlock>
export type AccordionBlock = BlockValue<typeof accordionBlock>
export type StatCounterBlock = BlockValue<typeof statCounterBlock>
export type LogoStripBlock = BlockValue<typeof logoStripBlock>

/** Every block of the vocabulary, as a discriminated union on `_type`. */
export type VocabularyBlock =
  | HeroBlock
  | ProseBlock
  | MediaFigureBlock
  | FeatureGridBlock
  | CtaBlock
  | GalleryBlock
  | QuoteBlock
  | FaqBlock
  | StatsBlock
  | LogosBlock
  | CollectionListBlock
  | EmbedBlock
  | TestimonialBlock
  | PricingTableBlock
  | AccordionBlock
  | StatCounterBlock
  | LogoStripBlock
