import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import type { DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  defineCollection,
  f,
  type TaxonomyDefinition,
} from '@cogenta/schema'

/**
 * One paragraph, as the structured rich-text document contract A stores (never
 * a string of HTML — rule R3). Shared because a `faq` answer is a rich-text
 * document too, and five blueprints now seed one: writing the same four nested
 * literals out by hand in each of them is how a `_key` collision or a missing
 * `markDefs` gets in.
 */
export function richTextParagraph(key: string, text: string): RichTextDocument {
  return [
    {
      _key: key,
      _type: 'block',
      style: 'normal',
      children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
      markDefs: [],
    },
  ]
}

/**
 * Names, and does not wire, an agent a blueprint recommends.
 *
 * No site anywhere in this codebase constructs a live `AgentRegistry` yet
 * (see `Site.agentsRouter` in `@cogenta/cli`'s `serve.ts`) — R2 requires the
 * CMS to work with no AI provider configured at all. Pretending to schedule
 * an agent from the installer would be dishonest about what actually runs;
 * naming it here is the scoped, truthful version of "agents préconfigurés"
 * until a live scheduler exists somewhere to preconfigure.
 */
export interface RecommendedAgentHint {
  readonly name: string
  readonly package: string
  readonly reason: string
}

export type SeedDemoContent = (
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
) => Promise<void>

/**
 * "Un blueprint = modèle de contenu + skin + agents préconfigurés + contenu
 * de démo + pages types" (`docs/lots/L9-ecosysteme.md`). The skin is a
 * separate, shared concern (`chooseSkin`, L9 task 7) — this is the part that
 * differs per blueprint: its collections, the agents it recommends, and how
 * it seeds its own demo content (including template pages, via
 * `f.blocks()`) through the real `ContentStore`.
 */
export interface BlueprintContentPack {
  readonly collections: readonly CollectionDefinition[]
  /** Declared taxonomies (`schema@2.0`, ADR-0022). Absent: the blueprint declares none — the pre-T02 behaviour. */
  readonly taxonomies?: readonly TaxonomyDefinition[]
  readonly recommendedAgents: readonly RecommendedAgentHint[]
  readonly seedDemoContent: SeedDemoContent
}

/**
 * A `VocabularyBlock` (contract B: `_key`/`_type`/`_version` plus its own
 * fields) as the block zone `f.blocks()` stores it: `key`/`type`/`data`,
 * where `data` is everything but the three contract-B envelope fields.
 * Shared by every blueprint that seeds a page with a `blocks` field.
 */
export function toBlockZoneEntry(block: VocabularyBlock): {
  key: string
  type: string
  data: Record<string, unknown>
} {
  const { _key, _type, _version: _discard, ...data } = block
  return { key: _key, type: _type, data }
}

/**
 * The four SEO override fields `seo-panel.tsx` (the admin's SEO panel) and
 * `@cogenta/seo`'s `metadata.ts`/`indexable.ts` already read by naming
 * convention (fiche 13, Task 0 § decision (a)) — declaring them on a
 * collection is the only thing that makes the panel render instead of the
 * `null` it falls back to for a collection that has none of them. Shared
 * across every routed collection of every blueprint (well past the "three
 * real usages" bar in AGENTS.md) so the four names, the four field kinds
 * and their limits never drift blueprint to blueprint.
 *
 * `admin.label`/`admin.help` are a single string each — `FieldAdminOptions`
 * (`@cogenta/schema`) has no per-locale form, unlike a taxonomy's or a
 * collection's own `labels` — so these are written in English, consistent
 * with every other piece of blueprint content and every other field label
 * in this file and its siblings (all English-only; there is no French
 * variant of any blueprint's schema to match).
 *
 * `seoCanonical` is deliberately not included (fiche 13 audit, T01): rarely
 * useful for a brand-new site and left as a field an editor adds by hand if
 * they ever need it, rather than a fifth SEO field in every form by default.
 */
export const SEO_FIELDS = {
  seoTitle: f.text({
    max: 60,
    admin: {
      label: 'SEO title',
      help: 'Overrides the browser tab title and the title shown in search results. Leave blank to use the page title.',
    },
  }),
  seoDescription: f.text({
    max: 160,
    multiline: true,
    admin: {
      label: 'SEO description',
      help: 'The summary shown under the title in search results. Leave blank to derive one from the content.',
    },
  }),
  seoImage: f.media({
    accept: ['image'],
    admin: {
      label: 'SEO image',
      help: 'Used for social previews (Open Graph, Twitter Card). Leave blank to fall back to the page content.',
    },
  }),
  seoNoindex: f.boolean({
    default: false,
    admin: {
      label: 'Hide from search engines',
      help: 'Adds a "noindex" instruction and removes this entry from the sitemap.',
    },
  }),
} as const

/**
 * The "page types" shape every blueprint beyond `blog` needs (this is the
 * third real usage of it, after `blog.ts`'s own hand-written `page` — see
 * AGENTS.md "not before three real usages"): a title plus a block zone,
 * routed generically. `blog.ts` keeps its own copy rather than being
 * refactored to call this — it predates this helper and already has
 * passing tests against its exact shape; duplication of one small,
 * frozen-contract-shaped collection is cheaper than touching working code.
 */
export function definePageCollection(routingPattern: string): CollectionDefinition {
  return defineCollection({
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: routingPattern },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      blocks: f.blocks({ required: true }),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: {
      read: ['public'],
      create: ['editor', 'admin'],
      update: ['editor', 'admin'],
      delete: ['admin'],
    },
  })
}
