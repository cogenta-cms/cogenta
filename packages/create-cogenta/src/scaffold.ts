import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createFileSitePlanStore,
  type DemoEntry,
  type PlanDecisions,
  type SitePlanDraft,
} from '@cogenta/agents'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createOutput, runMigrate, runUsers } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import type { SkinTokens } from '@cogenta/render'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  createSearchIndex,
  reindexAll,
  validateCollectionSet,
} from '@cogenta/schema'
import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
import { DEFAULT_BLUEPRINT_ID, resolveBlueprint } from './blueprints/registry.js'

export interface ScaffoldAnswers {
  readonly targetDir: string
  readonly siteName: string
  readonly siteUrl: string
  readonly defaultLocale: string
  readonly databaseDriver: 'sqlite' | 'postgres' | 'mysql'
  readonly databaseUrl?: string
  readonly llm?: { readonly provider: string; readonly model: string }
  readonly adminEmail: string
  /** Defaults to `blank` (`DEFAULT_BLUEPRINT_ID`) — the existing, unchanged behaviour. */
  readonly blueprintId?: string
  /** Already generated and validated by `chooseSkin` (L9 task 7). Absent: the theme's default `tokens.json` is copied, exactly as before this option existed. */
  readonly skinTokens?: SkinTokens
  /** Every locale the site is set up with. Defaults to `[defaultLocale]` — the behaviour before L19. */
  readonly locales?: readonly string[]
  /** L19 task 8's confirmed per-site-type defaults. Absent: `@cogenta/core`'s own defaults apply, unchanged. */
  readonly security?: { readonly pageMaxAge: number; readonly hstsMaxAge: number }
  /** `false` skips the blueprint's demo content. Defaults to `true` — the behaviour before L19. */
  readonly seedDemoContent?: boolean
  /**
   * Collections a human approved item by item from a document-driven plan
   * (L19). Written into `cogenta.schema.mjs` alongside the blueprint's own,
   * and their tables created. Never the whole proposal — only what
   * `resolveApprovedPlan` returned.
   */
  readonly approvedCollections?: readonly CollectionDefinition[]
  /** Demonstration entries approved one at a time, seeded into `approvedCollections`. */
  readonly approvedDemoContent?: readonly DemoEntry[]
  /**
   * A proposal to keep on disk for later review. Written to
   * `.cogenta/site-plans/`, never applied by this function — this is how a
   * non-interactive run leaves a plan waiting for a human rather than
   * publishing one behind their back (L19, "jamais une publication
   * automatique").
   */
  readonly sitePlan?: { readonly draft: SitePlanDraft; readonly decisions?: PlanDecisions }
}

export interface ScaffoldResult {
  readonly configPath: string
  readonly migrateExitCode: number
  readonly migrateOutput: string
  readonly usersExitCode: number
  readonly usersOutput: string
  /** The blueprint actually applied — may be `blank` if the requested one fell back. */
  readonly blueprintId: string
  readonly fellBackToBlank: boolean
  /** Always written — `[]` for `blank`, a real content pack's collections otherwise. `cogenta serve` requires this file to exist regardless of blueprint. */
  readonly schemaPath: string
  /** Present only when a blueprint wrote `theme.tokens.json` — says whether the AI-generated skin was used or the theme's default was copied. */
  readonly skinSource?: 'generated' | 'default'
  /** Names of the collections that came from an approved document-driven plan, in the order written. */
  readonly approvedCollectionNames: readonly string[]
  /** How many approved demonstration entries were actually seeded. */
  readonly approvedEntriesSeeded: number
  /** Where an unreviewed proposal was left waiting, when one was. */
  readonly sitePlanPath?: string
}

function capture(): { readonly write: (text: string) => void; text(): string } {
  const chunks: string[] = []
  return { write: (text) => chunks.push(text), text: () => chunks.join('') }
}

function databaseUrlFor(answers: ScaffoldAnswers): string {
  if (answers.databaseUrl !== undefined) return answers.databaseUrl
  // SQLite is the zero-config default (R1) — no external service, no Docker,
  // achievable well under sixty seconds.
  return join(answers.targetDir, '.cogenta', 'site.db')
}

/**
 * A hand-written `.mjs` — not a round trip through `defineConfig`'s TS
 * shape — for the same reason this project's own CLI tests generate
 * `cogenta.config.mjs` (`packages/cli/test/doctor.test.ts`): a `.ts` config
 * needs Node 22.18+ to strip types at import time, and the installer's own
 * `--yes` promise ("moins de 60 secondes") should not depend on a Node
 * version newer than the one this wizard itself already required.
 */
function configFileContents(answers: ScaffoldAnswers): string {
  const llmBlock =
    answers.llm === undefined
      ? ''
      : `  llm: { provider: ${JSON.stringify(answers.llm.provider)}, model: ${JSON.stringify(answers.llm.model)} },\n`

  // Written only when the human confirmed L19 task 8's per-site-type
  // recommendations. Absent, `@cogenta/core`'s own defaults apply, and a
  // config file generated before L19 is unchanged byte for byte.
  const securityBlock =
    answers.security === undefined
      ? ''
      : `  security: { pageMaxAge: ${answers.security.pageMaxAge}, hstsMaxAge: ${answers.security.hstsMaxAge} },\n`

  const locales = answers.locales ?? [answers.defaultLocale]

  return `export default {
  site: {
    name: ${JSON.stringify(answers.siteName)},
    url: ${JSON.stringify(answers.siteUrl)},
    locales: ${JSON.stringify(locales)},
    defaultLocale: ${JSON.stringify(answers.defaultLocale)},
  },
  database: {
    driver: ${JSON.stringify(answers.databaseDriver)},
    url: ${JSON.stringify(databaseUrlFor(answers))},
  },
  cache: { path: ${JSON.stringify(join(answers.targetDir, '.cogenta', 'cache'))} },
  storage: { path: ${JSON.stringify(join(answers.targetDir, '.cogenta', 'media'))} },
${llmBlock}${securityBlock}}
`
}

/**
 * The blueprint's collections plus whatever a human approved from a
 * document-driven plan, with a name collision resolved in the blueprint's
 * favour.
 *
 * That direction is deliberate: the blueprint's `page` collection is seeded
 * with real demo pages by `seedDemoContent`, and replacing its definition
 * with a proposed one of the same name would leave those rows referring to
 * fields that no longer exist. The dropped proposal is reported, not
 * silently discarded.
 */
function mergeCollections(
  fromBlueprint: readonly CollectionDefinition[],
  approved: readonly CollectionDefinition[],
): {
  readonly all: readonly CollectionDefinition[]
  readonly added: readonly CollectionDefinition[]
} {
  const taken = new Set(fromBlueprint.map((collection) => collection.name))
  const added = approved.filter((collection) => !taken.has(collection.name))
  const all = [...fromBlueprint, ...added]
  if (added.length > 0) validateCollectionSet(all)
  return { all, added }
}

function schemaFileContents(collections: readonly CollectionDefinition[]): string {
  // Every `FieldDefinition` a blueprint declares here is plain, serialisable
  // data (contract A) — `defineCollection` validates and returns it as-is,
  // never wrapping it in behaviour — so writing it out as a JSON literal is
  // exactly the array `loadCollections` (`@cogenta/cli`) reads back, not an
  // approximation of it.
  return `export default ${JSON.stringify(collections, null, 2)}\n`
}

function packageJsonContents(answers: ScaffoldAnswers): string {
  const pkg = {
    name:
      answers.siteName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'cogenta-site',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: {
      '@cogenta/core': 'latest',
      '@cogenta/cli': 'latest',
      '@cogenta/theme-canonical': 'latest',
    },
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

/**
 * The tokens.json this site's skin starts from — the canonical theme's own
 * default, copied verbatim. L9 task 7's AI skin-generation pipeline is a
 * different, later job; this is "apply an existing skin", nothing more.
 */
async function canonicalTokensJson(): Promise<string> {
  const url = import.meta.resolve('@cogenta/theme-canonical/tokens.json')
  return readFile(fileURLToPath(url), 'utf8')
}

/**
 * Step 9: "Installation, migrations, contenu de démo." Writes the site's
 * own files, then genuinely runs it up — `runMigrate`/`runUsers` are the
 * exact functions `cogenta migrate up`/`cogenta users create` call, reused
 * rather than re-implemented, so a scaffolded site is provably the same
 * thing those commands would produce by hand afterwards.
 *
 * A blueprint with a real `BlueprintContentPack` (`./blueprints/content-packs.js`)
 * additionally materialises its tables, seeds real demo content, applies a
 * skin and records which agents it recommends. `blank` (and any blueprint
 * without a pack yet) takes none of those branches — but the content schema
 * file itself is written unconditionally either way (an empty array for
 * `blank`), since `cogenta serve` requires one to exist regardless of
 * blueprint.
 */
export async function scaffoldSite(
  answers: ScaffoldAnswers,
  env: Record<string, string | undefined> = process.env,
): Promise<ScaffoldResult> {
  const { blueprint, fellBackToBlank } = resolveBlueprint(
    answers.blueprintId ?? DEFAULT_BLUEPRINT_ID,
  )

  await mkdir(answers.targetDir, { recursive: true })
  await mkdir(join(answers.targetDir, '.cogenta'), { recursive: true })

  const configPath = join(answers.targetDir, 'cogenta.config.mjs')
  await writeFile(configPath, configFileContents(answers), 'utf8')
  await writeFile(join(answers.targetDir, 'package.json'), packageJsonContents(answers), 'utf8')

  // A real, generated secret, not a manual step: `cogenta serve` refuses to
  // start without `COGENTA_AUTH_SIGNING_KEY`, and asking a brand-new user to
  // find and run the right key-generation command for their own shell (and
  // know it needs to be `export`ed, and know that differs on Windows) was
  // real friction before `@cogenta/core`'s `loadConfig` learned to read a
  // `.env` file here automatically (Node's own `--env-file` support, no new
  // dependency). Never committed — `.gitignore` below covers it.
  //
  // `mode: 0o600` (fiche 23 audit follow-up, `docs/hebergement-mutualise.md`):
  // on shared hosting every tenant's process runs as a different,
  // unprivileged user, and the default mode a plain `writeFile` leaves a new
  // file at is readable by all of them — exactly the file that holds the key
  // signing every admin session. POSIX-only in effect (Windows ACLs ignore
  // it), which is the platform this actually protects against.
  await writeFile(
    join(answers.targetDir, '.env'),
    `COGENTA_AUTH_SIGNING_KEY=${randomBytes(32).toString('base64')}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await writeFile(
    join(answers.targetDir, '.gitignore'),
    ['node_modules/', '.env', '.cogenta/'].join('\n') + '\n',
    'utf8',
  )

  const pack = BLUEPRINT_CONTENT_PACKS[blueprint.id]
  // `cogenta serve` (`@cogenta/cli`) hard-requires a `cogenta.schema.*` file
  // to exist next to the config — including for `blank`, whose whole point
  // is an empty collections array, not a missing file. Writing it
  // unconditionally is what makes "npm create cogenta" with every default
  // answer produce a site `cogenta serve` can actually start.
  const schemaPath = join(answers.targetDir, 'cogenta.schema.mjs')
  const merged = mergeCollections(pack?.collections ?? [], answers.approvedCollections ?? [])
  await writeFile(schemaPath, schemaFileContents(merged.all), 'utf8')
  let skinSource: 'generated' | 'default' | undefined

  // A plan the human approved brings its own skin, whatever blueprint was
  // picked — including `blank`, which has no content pack and therefore
  // never wrote a `theme.tokens.json` before.
  const writesTheme = pack !== undefined || answers.approvedCollections !== undefined

  if (writesTheme) {
    skinSource = answers.skinTokens === undefined ? 'default' : 'generated'
    const tokensJson =
      answers.skinTokens === undefined
        ? await canonicalTokensJson()
        : `${JSON.stringify(answers.skinTokens, null, 2)}\n`
    await writeFile(join(answers.targetDir, 'theme.tokens.json'), tokensJson, 'utf8')
    if (pack !== undefined) {
      await writeFile(
        join(answers.targetDir, '.cogenta', 'recommended-agents.json'),
        `${JSON.stringify(pack.recommendedAgents, null, 2)}\n`,
        'utf8',
      )
    }
  }

  // A proposal nobody reviewed is written down, never acted on. This is the
  // only thing a non-interactive run does with a document-driven plan.
  let sitePlanPath: string | undefined
  if (answers.sitePlan !== undefined) {
    const directory = join(answers.targetDir, '.cogenta', 'site-plans')
    const store = createFileSitePlanStore(directory)
    await store.save(answers.sitePlan.draft)
    if (answers.sitePlan.decisions !== undefined) {
      await store.recordDecisions(answers.sitePlan.draft.id, answers.sitePlan.decisions)
    }
    sitePlanPath = join(directory, `${answers.sitePlan.draft.id}.plan.json`)
  }

  const migrateCapture = capture()
  const migrateStderr = capture()
  const migrateExitCode = await runMigrate({
    subcommand: 'up',
    cwd: answers.targetDir,
    env,
    out: createOutput(migrateCapture.write, false),
    stderr: migrateStderr.write,
  })

  const usersCapture = capture()
  const usersStderr = capture()
  const usersExitCode = await runUsers({
    subcommand: 'create',
    cwd: answers.targetDir,
    env,
    email: answers.adminEmail,
    admin: true,
    out: createOutput(usersCapture.write, false),
    stderr: usersStderr.write,
  })

  let approvedEntriesSeeded = 0
  const needsDatabaseWork = merged.all.length > 0
  if (needsDatabaseWork && migrateExitCode === 0 && usersExitCode === 0) {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: answers.databaseDriver,
      url: databaseUrlFor(answers),
    })
    try {
      await createSchemaTables(selection.instance, merged.all)
      await ensureAuthTables(selection.instance)
      const admin = await createUserStore(selection.instance).byEmail(answers.adminEmail)
      if (pack !== undefined && (answers.seedDemoContent ?? true)) {
        await pack.seedDemoContent(selection.instance, answers.defaultLocale, admin?.id ?? null)
      }
      approvedEntriesSeeded = await seedApprovedEntries({
        db: selection.instance,
        collections: merged.added,
        entries: answers.approvedDemoContent ?? [],
        defaultLocale: answers.defaultLocale,
        adminId: admin?.id ?? null,
        ...(answers.llm === undefined ? {} : { model: answers.llm.model }),
      })

      // Both seed paths above write straight through `createContentStore`,
      // never through the `withSearchIndexing`-wrapped store `cogenta serve`
      // builds at startup (L20 audit, point 2) — so a freshly scaffolded
      // site's demo content was never in the search index, and `/search`
      // found nothing for words that were plainly on the page. Reindexing
      // here, against the same physical index `createSearchIndex` creates on
      // first use, means the index and the content it describes are never
      // out of step from the moment a site exists.
      if (merged.all.length > 0) {
        const searchIndex = await createSearchIndex({ db: selection.instance })
        for (const collection of merged.all) {
          const store = createContentStore({
            db: selection.instance,
            collection,
            defaultLocale: answers.defaultLocale,
          })
          await reindexAll(store, { collection, index: searchIndex })
        }
      }
    } finally {
      await selection.dispose()
    }
  }

  return {
    configPath,
    migrateExitCode,
    migrateOutput: migrateCapture.text() + migrateStderr.text(),
    usersExitCode,
    usersOutput: usersCapture.text() + usersStderr.text(),
    blueprintId: blueprint.id,
    fellBackToBlank,
    schemaPath,
    ...(skinSource === undefined ? {} : { skinSource }),
    approvedCollectionNames: merged.added.map((collection) => collection.name),
    approvedEntriesSeeded,
    ...(sitePlanPath === undefined ? {} : { sitePlanPath }),
  }
}

/**
 * Seeds the demonstration entries a human approved, one at a time, through
 * the real `ContentStore` — the same path the blueprints' own seeders take.
 *
 * Entries are created as drafts, not published. A blueprint's demo content
 * is written by this repository and vouched for; this is written by a model
 * about somebody's business, and putting it live on a public site before its
 * owner has read it is precisely the automatic application R6 forbids.
 */
async function seedApprovedEntries(input: {
  readonly db: Parameters<typeof createSchemaTables>[0]
  readonly collections: readonly CollectionDefinition[]
  readonly entries: readonly DemoEntry[]
  readonly defaultLocale: string
  readonly adminId: string | null
  /** Named in the provenance of every entry seeded here. */
  readonly model?: string
}): Promise<number> {
  if (input.entries.length === 0) return 0
  const stores = new Map(
    input.collections.map((collection) => [
      collection.name,
      createContentStore({
        db: input.db,
        collection,
        defaultLocale: input.defaultLocale,
      }),
    ]),
  )

  let seeded = 0
  for (const entry of input.entries) {
    const store = stores.get(entry.collection)
    if (store === undefined) continue
    await store.create({
      status: 'draft',
      createdBy: input.adminId,
      // `generated`, not the `human` default: contract A calls `provenance`
      // non-optional because the European AI framework requires it, and this
      // entry was written by a model about somebody's business.
      provenance: 'generated',
      provenanceDetail: {
        agent: 'site-planner',
        ...(input.model === undefined ? {} : { model: input.model }),
        at: new Date().toISOString(),
      },
      values: entry.values,
    })
    seeded++
  }
  return seeded
}
