import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import type { DatabaseHandle } from '@cogenta/core'
import { type CollectionDefinition, defineCollection, f } from '@cogenta/schema'

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
