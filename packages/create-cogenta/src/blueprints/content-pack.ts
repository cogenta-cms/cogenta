import type { VocabularyBlock } from '@cogenta/blocks'
import type { DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'

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
