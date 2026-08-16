import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type ApprovedPlan,
  createAnthropicClient,
  createFileSitePlanStore,
  createGoogleClient,
  createOpenAiClient,
  extractDocumentText,
  type ProviderClient,
  proposeSitePlan,
  resolveApprovedPlan,
  type SitePlanDraft,
  summarisePlan,
} from '@cogenta/agents'
import type {
  AppliedPlanReport,
  SitePlanApplierLike,
  SitePlannerLike,
  SitePlanRouterOptions,
} from '@cogenta/api'
import { type CogentaConfig, CogentaError, type DatabaseHandle, type Logger } from '@cogenta/core'
import { type CollectionDefinition, createContentStore, createSchemaTables } from '@cogenta/schema'
import { findSchemaFile } from './serve.js'

/**
 * L19 task 7 — the same document-driven planning the installer offers, on a
 * site that is already running.
 *
 * This module is the only place where a plan meets a live site, so it is
 * where the "évolution plutôt que création" rule is enforced rather than
 * described:
 *
 * - **Additive only.** A proposed collection whose name the site already
 *   uses is refused and reported, never merged over the top of one that has
 *   rows in it. Redefining a live collection is a migration with a diff and
 *   a backup, not a side effect of accepting a suggestion.
 * - **Reviewed in full.** `resolveApprovedPlan` throws unless every item
 *   carries a decision. There is no path through this file that skips it.
 * - **Honest about what it did not do.** Applying writes the schema file and
 *   creates the new tables, but a running `cogenta serve` loaded its
 *   collections at boot; the report says a restart is needed rather than
 *   pretending the change is live.
 */

const PLAN_DIRECTORY = join('.cogenta', 'site-plans')

function providerClient(
  llm: NonNullable<CogentaConfig['llm']>,
  apiKey: string,
): ProviderClient | undefined {
  const config = {
    apiKey,
    model: llm.model,
    ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
  }
  if (llm.provider === 'anthropic') return createAnthropicClient(config)
  if (llm.provider === 'openai') return createOpenAiClient(config)
  if (llm.provider === 'google') return createGoogleClient(config)
  return undefined
}

function createPlanner(client: ProviderClient, model: string, siteName: string): SitePlannerLike {
  return {
    async propose(input) {
      const documents = input.documents.map((document) =>
        extractDocumentText({
          filename: document.filename,
          bytes: Buffer.from(document.contentBase64, 'base64'),
        }),
      )
      const result = await proposeSitePlan({
        client,
        model,
        documents,
        siteName: input.siteName ?? siteName,
      })
      return result.ok
        ? { ok: true, draft: result.draft }
        : { ok: false, stage: result.stage, reason: result.reason }
    },
    sections: (draft) => summarisePlan(draft as SitePlanDraft),
  }
}

export interface SitePlanApplierOptions {
  readonly projectRoot: string
  readonly db: DatabaseHandle
  /** What the site is serving right now — the names that may not be redefined. */
  readonly collections: readonly CollectionDefinition[]
  readonly defaultLocale: string
  readonly logger: Logger
  /**
   * The schema file this project really loads, resolved by `findSchemaFile`.
   *
   * Passed in rather than guessed: `loadCollections` prefers
   * `cogenta.schema.ts`, and writing `.mjs` on a project that has a `.ts`
   * would create the tables and then write a file nothing reads.
   */
  readonly schemaPath: string
  /** Named in the provenance of anything this writes. */
  readonly model?: string
}

/**
 * Refuses to rewrite a schema whose current contents would not survive the
 * round trip.
 *
 * The file is regenerated with `JSON.stringify`, and contract A's
 * `validate?: (value: unknown) => true | string` is a **function** — it
 * would vanish from every existing field without a word. Losing a
 * validator silently is worse than refusing to add a collection, so this
 * refuses, and names the field so the operator can add the collection by
 * hand instead.
 */
function assertSerialisableSchema(
  collections: readonly CollectionDefinition[],
  schemaPath: string,
): void {
  const lost: string[] = []
  for (const collection of collections) {
    for (const [name, field] of Object.entries(collection.fields)) {
      if (typeof field.validate === 'function') lost.push(`${collection.name}.${name}.validate`)
      if (typeof field.default === 'function') lost.push(`${collection.name}.${name}.default`)
    }
  }
  if (lost.length === 0) return
  throw new CogentaError({
    code: 'SCHEMA_INVALID',
    message: `${schemaPath} declares ${lost.length} value(s) that cannot be written back: ${lost.join(', ')}.`,
    hint: 'Applying a plan regenerates the schema file, and a function does not survive that. Add the accepted collections to the file by hand — the plan lists exactly what they are.',
    details: { schemaPath, lost },
  })
}

/**
 * Writes an approved plan into the project, additively.
 *
 * The schema file is rewritten from the live collections plus the accepted
 * new ones rather than patched: it is generated data (`create-cogenta` writes
 * the same shape), and regenerating it is the only edit that cannot leave a
 * half-applied file behind — which is also why it refuses outright when the
 * current file holds something a regeneration would drop.
 */
export function createSitePlanApplier(options: SitePlanApplierOptions): SitePlanApplierLike {
  return {
    async apply(input): Promise<AppliedPlanReport> {
      const approved: ApprovedPlan = resolveApprovedPlan(
        input.draft as SitePlanDraft,
        input.decisions,
      )

      assertSerialisableSchema(options.collections, options.schemaPath)

      const taken = new Set(options.collections.map((collection) => collection.name))
      const added: CollectionDefinition[] = []
      const skipped: { name: string; reason: string }[] = []
      for (const collection of approved.collections) {
        if (taken.has(collection.name)) {
          skipped.push({
            name: collection.name,
            reason:
              'this site already has a collection with that name, and replacing a live one is a migration, not an edit',
          })
          continue
        }
        taken.add(collection.name)
        added.push(collection)
      }

      const followUp: string[] = []

      if (added.length > 0) {
        const all = [...options.collections, ...added]
        await writeFile(
          options.schemaPath,
          `export default ${JSON.stringify(all, null, 2)}\n`,
          'utf8',
        )
        await createSchemaTables(options.db, added)
        followUp.push(
          `${options.schemaPath} was rewritten — commit it (ADR-0010: the schema lives in git), then restart: the running process loaded its collections at start-up and does not see the new ones yet.`,
        )
      }

      let entriesSeeded = 0
      if (added.length > 0 && approved.demoContent.length > 0) {
        const stores = new Map(
          added.map((collection) => [
            collection.name,
            createContentStore({
              db: options.db,
              collection,
              defaultLocale: options.defaultLocale,
            }),
          ]),
        )
        for (const entry of approved.demoContent) {
          const store = stores.get(entry.collection)
          if (store === undefined) continue
          // Drafts, never published: a model wrote this about somebody's
          // business and nobody has read it yet. And marked `generated`,
          // which contract A calls non-optional because the European AI
          // framework requires it — the default is `human`, and letting
          // model-written content inherit it would be the one field in the
          // contract that lies.
          await store.create({
            status: 'draft',
            createdBy: input.actorId,
            provenance: 'generated',
            provenanceDetail: {
              agent: 'site-planner',
              ...(options.model === undefined ? {} : { model: options.model }),
              at: new Date().toISOString(),
            },
            values: entry.values,
          })
          entriesSeeded++
        }
        followUp.push(
          `${entriesSeeded} demonstration entr${entriesSeeded === 1 ? 'y is' : 'ies are'} waiting as drafts. Read them before publishing.`,
        )
      }

      let skinApplied = false
      if (approved.skin !== undefined) {
        await writeFile(
          join(options.projectRoot, 'theme.tokens.json'),
          `${JSON.stringify(approved.skin, null, 2)}\n`,
          'utf8',
        )
        skinApplied = true
        followUp.push('Restart `cogenta serve` to serve the new design.')
      }

      options.logger.info('site plan applied', {
        draftId: approved.draftId,
        added: added.length,
        skipped: skipped.length,
        entriesSeeded,
        skinApplied,
      })

      return {
        added: added.map((collection) => collection.name),
        skipped,
        entriesSeeded,
        skinApplied,
        followUp,
      }
    },
  }
}

export interface SitePlanningOptions {
  readonly projectRoot: string
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
  readonly config: CogentaConfig
  readonly logger: Logger
  /** A read-only instance can propose and review, never apply. */
  readonly readOnly?: boolean
  /**
   * `cogenta dev`. Without it, no applier is built at all.
   *
   * ADR-0010, verbatim: "L'éditeur visuel de schéma écrit ces fichiers, mais
   * **uniquement en mode développement**. En production le schéma est en
   * lecture seule." Applying a site plan writes `cogenta.schema.*` and
   * creates tables — that *is* the schema editor, arriving by a different
   * door, and the decision applies to it unchanged. L19's own brief asks for
   * this to work on "un site déjà en production"; that half of the brief is
   * refused here rather than quietly delivered, and the disagreement is
   * written down in `BLOCKERS.md` for a human to settle with an ADR.
   */
  readonly development?: boolean
}

/**
 * Builds what `/api/site-plans` needs, from what this site actually has.
 *
 * Always returns a store, so drafts written by the installer are visible in
 * the admin even on a site with no provider configured — that is the whole
 * point of the installer's deferred path. The planner is present only when a
 * provider and a key really are configured (R2), and the router says so to
 * the client rather than failing at it. The applier is present only in
 * development (ADR-0010).
 */
export async function createSitePlanning(
  options: SitePlanningOptions,
): Promise<SitePlanRouterOptions> {
  const store = createFileSitePlanStore(join(options.projectRoot, PLAN_DIRECTORY))
  const llm = options.config.llm
  const apiKey = llm?.apiKey

  const client =
    llm === undefined || apiKey === undefined || apiKey === ''
      ? undefined
      : providerClient(llm, apiKey)

  if (client !== undefined && llm !== undefined && llm.model === '') {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: 'An LLM provider is configured with no model.',
      hint: 'Set `llm.model` in cogenta.config.mjs, or remove the `llm` section entirely.',
    })
  }

  // No applier outside development, and none when the schema file cannot be
  // found — writing a guessed filename would create tables the site never
  // loads.
  const schemaPath =
    options.development === true && options.readOnly !== true
      ? await findSchemaFile(options.projectRoot)
      : undefined

  return {
    store,
    ...(client === undefined || llm === undefined
      ? {}
      : { planner: createPlanner(client, llm.model, options.config.site.name) }),
    ...(schemaPath === undefined
      ? {}
      : {
          applier: createSitePlanApplier({
            projectRoot: options.projectRoot,
            db: options.db,
            collections: options.collections,
            defaultLocale: options.config.site.defaultLocale,
            logger: options.logger,
            schemaPath,
            ...(llm === undefined ? {} : { model: llm.model }),
          }),
        }),
  }
}

export { PLAN_DIRECTORY }
