import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type ApprovedPlan,
  createAnthropicClient,
  createFileSitePlanStore,
  createGoogleClient,
  createOpenAiClient,
  describeExistingSite,
  type ExistingEntryCounts,
  type ExistingSiteSnapshot,
  extractDocumentText,
  type ProviderClient,
  type ProviderTuningDefaults,
  proposeSitePlan,
  resolveApprovedPlan,
  resolveProviderTuningDefaults,
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
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  createSiteSettingsStore,
  createTaxonomyStore,
  createThemeStore,
  ensureSiteSettingsTables,
  ensureThemeTable,
  type TaxonomyDefinition,
} from '@cogenta/schema'
import { findSchemaFile } from './serve.js'
import { DEFAULT_THEME_NAME } from './theme-registry.js'

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
  defaults: ProviderTuningDefaults,
): ProviderClient | undefined {
  const config = {
    apiKey,
    model: llm.model,
    ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
    defaults,
  }
  if (llm.provider === 'anthropic') return createAnthropicClient(config)
  if (llm.provider === 'openai') return createOpenAiClient(config)
  if (llm.provider === 'google') return createGoogleClient(config)
  return undefined
}

/** Fiche 60 task 2's four inputs `describeExistingSite` needs, resolved on this site. */
export interface ExistingSiteContext {
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly defaultLocale: string
  readonly config: CogentaConfig
}

/**
 * Fiche 60 task 2 — detected by config presence alone, never guessed: a
 * section absent from `CogentaConfig` (R2's own vocabulary — "sans
 * fournisseur configuré") is simply not listed here, rather than inferred
 * from some other signal.
 */
export function detectActiveIntegrations(config: CogentaConfig): readonly string[] {
  const active: string[] = []
  if (config.llm !== undefined) active.push('llm')
  if (config.imageGeneration !== undefined) active.push('image generation')
  if (config.billing !== undefined) active.push('billing')
  if (config.webhooks.endpoints.length > 0) active.push('webhooks')
  if (config.payment.stripeSecretKey !== undefined) active.push('stripe payments')
  return active
}

/**
 * Fiche 60 task 6 — read fresh on every call, never cached across the
 * process's lifetime (same discipline `theme-wiring.ts`'s own
 * `computeEffectiveStyles` documents for the theme overlay): a proposal made
 * an hour into a running `cogenta serve` has to see the entries and terms
 * written since boot, not the count at start-up.
 */
export async function buildExistingSiteSnapshot(
  context: ExistingSiteContext,
): Promise<ExistingSiteSnapshot> {
  const entryCounts: Record<string, ExistingEntryCounts> = {}
  for (const collection of context.collections) {
    const store = createContentStore({
      db: context.db,
      collection,
      defaultLocale: context.defaultLocale,
    })
    const counts = await store.count()
    entryCounts[collection.name] = { total: counts.total, published: counts.published }
  }

  const termCounts: Record<string, number> = {}
  for (const taxonomy of context.taxonomies) {
    const store = createTaxonomyStore({ db: context.db, taxonomy })
    termCounts[taxonomy.name] = (await store.list()).length
  }

  // Idempotent (`create table if not exists`) — safe even when
  // `createThemeWiring` already ran this earlier in the same boot.
  await ensureThemeTable(context.db)
  const theme = await createThemeStore({ db: context.db }).get()

  return describeExistingSite({
    collections: context.collections,
    taxonomies: context.taxonomies,
    entryCounts,
    termCounts,
    activeTheme: theme.activeTheme ?? DEFAULT_THEME_NAME,
    integrations: detectActiveIntegrations(context.config),
  })
}

function createPlanner(
  client: ProviderClient,
  model: string,
  siteName: string,
  siteContext: ExistingSiteContext,
): SitePlannerLike {
  return {
    async propose(input) {
      const documents = input.documents.map((document) =>
        extractDocumentText({
          filename: document.filename,
          bytes: Buffer.from(document.contentBase64, 'base64'),
        }),
      )
      const existingSite = await buildExistingSiteSnapshot(siteContext)
      const result = await proposeSitePlan({
        client,
        model,
        documents,
        siteName: input.siteName ?? siteName,
        existingSite,
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
  readonly schemaPath?: string
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

      const schemaPath = options.schemaPath
      if (schemaPath !== undefined) assertSerialisableSchema(options.collections, schemaPath)

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
        if (schemaPath === undefined) {
          // ADR-0010: the schema is read-only outside development. Named
          // rather than swallowed — and the rest of the plan still applies,
          // because pages and entries are rows, not schema.
          skipped.push({
            name: collection.name,
            reason:
              'adding a collection rewrites the schema, which only `cogenta dev` may do (ADR-0010) — everything in this plan that is content was applied anyway',
          })
          continue
        }
        taken.add(collection.name)
        added.push(collection)
      }

      const followUp: string[] = []

      if (added.length > 0 && schemaPath !== undefined) {
        const all = [...options.collections, ...added]
        await writeFile(schemaPath, `export default ${JSON.stringify(all, null, 2)}\n`, 'utf8')
        await createSchemaTables(options.db, added)
        followUp.push(
          `${schemaPath} was rewritten — commit it (ADR-0010: the schema lives in git), then restart: the running process loaded its collections at start-up and does not see the new ones yet.`,
        )
      }

      let entriesSeeded = 0
      if (approved.demoContent.length > 0) {
        // Every collection this site has, not only the ones this plan just
        // created. Seeding into the newly-added ones alone meant demo content
        // aimed at a collection the site already had was dropped without a
        // word — and under `cogenta serve`, where nothing can be added, it
        // meant no entry was ever seeded at all.
        const stores = new Map(
          [...options.collections, ...added].map((collection) => [
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

      // The pages the human approved, created for real.
      //
      // They were proposed, listed, accepted one by one and then dropped:
      // `approved.pages` was never read here. A page is an ordinary content
      // entry, so the only real question is which collection can hold one —
      // answered from the site's own schema rather than assumed, and
      // answered out loud when nothing can.
      const pagesSkipped: { title: string; reason: string }[] = []
      let pagesCreated = 0
      if (approved.pages.length > 0) {
        const everyCollection = [...options.collections, ...added]
        const target =
          everyCollection.find(
            (collection) => collection.name === 'page' && 'title' in collection.fields,
          ) ??
          everyCollection.find(
            (collection) =>
              collection.routing !== undefined &&
              'title' in collection.fields &&
              'slug' in collection.fields,
          )

        if (target === undefined) {
          for (const page of approved.pages) {
            pagesSkipped.push({
              title: page.title,
              reason:
                'this site has no collection that can hold a page — one with a title and a slug, routed to a public URL',
            })
          }
        } else {
          const store = createContentStore({
            db: options.db,
            collection: target,
            defaultLocale: options.defaultLocale,
          })
          // Only fields this collection actually declares: contract A refuses
          // an unknown one, and a page invented against the wrong shape would
          // fail the whole apply rather than one page.
          const purposeField = ['excerpt', 'summary', 'description', 'body'].find(
            (name) => name in target.fields,
          )
          for (const page of approved.pages) {
            const values: Record<string, unknown> = { title: page.title }
            if ('slug' in target.fields) values.slug = page.slug
            if (purposeField !== undefined) values[purposeField] = page.purpose
            try {
              await store.create({
                status: 'draft',
                createdBy: input.actorId,
                provenance: 'generated',
                provenanceDetail: {
                  agent: 'site-planner',
                  ...(options.model === undefined ? {} : { model: options.model }),
                  at: new Date().toISOString(),
                },
                values,
              })
              pagesCreated++
            } catch (error) {
              pagesSkipped.push({
                title: page.title,
                reason: error instanceof Error ? error.message : String(error),
              })
            }
          }
          if (pagesCreated > 0) {
            followUp.push(
              `${pagesCreated} page${pagesCreated === 1 ? ' is' : 's are'} waiting as draft${pagesCreated === 1 ? '' : 's'} in "${target.name}" — they carry a title and a purpose, not their content yet.`,
            )
          }
        }
      }

      let skinApplied = false
      if (approved.skin !== undefined) {
        if (schemaPath === undefined) {
          // Outside development this instance may not write project files —
          // the same rule `theme-wiring.ts` applies to `theme.tokens.json`
          // through its own dev-only `fileExporter`. The palette still
          // applies, through the database overlay the appearance screen
          // already writes: live on the next page view, reversible from that
          // same screen, and no restart to ask for.
          await ensureThemeTable(options.db)
          await createThemeStore({ db: options.db }).set({
            // A whole validated contract D token set, stored as the overlay
            // — the same shape `PUT /api/theme/overrides` accepts from the
            // appearance screen, which is why the cast is a widening rather
            // than a claim about a different shape.
            tokenOverrides: approved.skin as unknown as Record<string, unknown>,
            updatedBy: input.actorId,
          })
          followUp.push('The new palette is live — no restart needed.')
        } else {
          await writeFile(
            join(options.projectRoot, 'theme.tokens.json'),
            `${JSON.stringify(approved.skin, null, 2)}\n`,
            'utf8',
          )
          followUp.push('Restart `cogenta serve` to serve the new design.')
        }
        skinApplied = true
      }

      options.logger.info('site plan applied', {
        draftId: approved.draftId,
        added: added.length,
        skipped: skipped.length,
        entriesSeeded,
        pagesCreated,
        pagesSkipped: pagesSkipped.length,
        skinApplied,
      })

      return {
        added: added.map((collection) => collection.name),
        skipped,
        entriesSeeded,
        pagesCreated,
        pagesSkipped,
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
  /** Fiche 60 task 2/6 — read into every proposal's `existingSite` snapshot. Absent means none declared. */
  readonly taxonomies?: readonly TaxonomyDefinition[]
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

  let client: ProviderClient | undefined
  if (llm !== undefined && apiKey !== undefined && apiKey !== '') {
    await ensureSiteSettingsTables(options.db)
    const defaults = await resolveProviderTuningDefaults(
      createSiteSettingsStore({ db: options.db }),
    )
    client = providerClient(llm, apiKey, defaults)
  }

  if (client !== undefined && llm !== undefined && llm.model === '') {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: 'An LLM provider is configured with no model.',
      hint: 'Set `llm.model` in cogenta.config.mjs, or remove the `llm` section entirely.',
    })
  }

  // ADR-0010 makes the *schema* read-only outside development. It says
  // nothing about rows — and refusing to create a page or seed an entry under
  // `cogenta serve` was a strictness the decision never asked for, with a
  // real cost: an ordinary operator never runs `cogenta dev`, so applying a
  // plan did nothing for them at all.
  //
  // So the applier now exists whenever this instance may write at all, and
  // `schemaPath` — the permission to add collections — is what stays
  // development-only. A plan whose collections cannot be added says so,
  // collection by collection, and still creates everything that is only rows.
  const schemaPath =
    options.development === true && options.readOnly !== true
      ? await findSchemaFile(options.projectRoot)
      : undefined

  return {
    store,
    ...(client === undefined || llm === undefined
      ? {}
      : {
          planner: createPlanner(client, llm.model, options.config.site.name, {
            db: options.db,
            collections: options.collections,
            taxonomies: options.taxonomies ?? [],
            defaultLocale: options.config.site.defaultLocale,
            config: options.config,
          }),
        }),
    ...(options.readOnly === true
      ? {}
      : {
          applier: createSitePlanApplier({
            projectRoot: options.projectRoot,
            db: options.db,
            collections: options.collections,
            defaultLocale: options.config.site.defaultLocale,
            logger: options.logger,
            ...(schemaPath === undefined ? {} : { schemaPath }),
            ...(llm === undefined ? {} : { model: llm.model }),
          }),
        }),
  }
}

export { PLAN_DIRECTORY }
