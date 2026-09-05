import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createFileAgentDeclarationStore,
  createFileAgentSkillStore,
  createFileSitePlanStore,
  type DemoEntry,
  ensureBuiltinAgentSkills,
  ensureBuiltinAgents,
  type PlanDecisions,
  type SitePlanDraft,
} from '@cogenta/agents'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createOutput, runMigrate, runUsers, selectMediaImageProcessor } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger, createStorageRegistry } from '@cogenta/core'
import type { SkinTokens } from '@cogenta/render'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  createSearchIndex,
  createThemeStore,
  ensureThemeTable,
  reindexAll,
  type TaxonomyDefinition,
  validateCollectionSet,
} from '@cogenta/schema'
import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
import { seedDemoMedia } from './blueprints/demo-media.js'
import { seedBlueprintMenus } from './blueprints/menus.js'
import { DEFAULT_BLUEPRINT_ID, resolveBlueprint } from './blueprints/registry.js'
import { seedSiteSettings } from './blueprints/site-settings-seed.js'
import { STARTING_SKINS } from './blueprints/starting-skins.js'

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
  /**
   * Present only when a blueprint wrote `theme.tokens.json` — says which
   * skin ended up there: `'generated'` (AI, L9 task 7 / approved plan),
   * `'preset'` (this blueprint's own starting skin, L22 task 10 —
   * `./blueprints/starting-skins.js`) or `'default'`
   * (`@cogenta/theme-canonical`'s own tokens, copied verbatim — the only
   * option for a blueprint with no preset of its own).
   */
  readonly skinSource?: 'generated' | 'preset' | 'default'
  /** Names of the collections that came from an approved document-driven plan, in the order written. */
  readonly approvedCollectionNames: readonly string[]
  /** How many approved demonstration entries were actually seeded. */
  readonly approvedEntriesSeeded: number
  /** Where an unreviewed proposal was left waiting, when one was. */
  readonly sitePlanPath?: string
  /**
   * The npm package name written to `cogenta_theme.active_theme` and to the
   * generated `package.json` (L25 task A0b, D4) — present only when the
   * blueprint declares `defaultTheme`. `blank` and every blueprint without
   * one: absent, `@cogenta/theme-canonical` stays the active theme.
   */
  readonly activeTheme?: string
  /** How many procedural demo images (`seedDemoMedia`) were ingested. `0` for a blueprint with no media specs, or when demo content was skipped. */
  readonly mediaSeeded: number
  /** How many navigation items (header + footer + header-action) were seeded. `0` when the blueprint declares no `menus`. */
  readonly menusSeeded: number
  /** How many site settings (`general.tagline`, …) were written. `0` when the blueprint declares none, or every key it named was unknown to the registry. */
  readonly siteSettingsSeeded: number
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

function schemaFileContents(
  collections: readonly CollectionDefinition[],
  taxonomies: readonly TaxonomyDefinition[],
): string {
  // Every `FieldDefinition`/`TaxonomyDefinition` a blueprint declares here is
  // plain, serialisable data (contract A) — `defineCollection`/
  // `defineTaxonomy` validate and return it as-is, never wrapping it in
  // behaviour — so writing it out as a JSON literal is exactly the shape
  // `loadCollections` (`@cogenta/cli`) reads back, not an approximation of
  // it. `taxonomies` is a *named* export (`export const taxonomies = …`,
  // schema@2.0) alongside the default collections array — `loadCollections`
  // reads that exact name, and a schema file written before ADR-0022 simply
  // has no such export, which it treats as "no taxonomies".
  const taxonomiesExport =
    taxonomies.length > 0
      ? `export const taxonomies = ${JSON.stringify(taxonomies, null, 2)}\n`
      : ''
  return `export default ${JSON.stringify(collections, null, 2)}\n${taxonomiesExport}`
}

/**
 * `defaultTheme` (L25 task A0b, D4): the blueprint's own theme package,
 * added next to `@cogenta/theme-canonical` at the same version spec
 * (`latest`) — never *instead* of it, since the canonical theme stays the
 * fallback `theme-registry.ts` (`@cogenta/cli`) resolves to if the active
 * theme is ever unset or unknown (R1/R2).
 */
function packageJsonContents(answers: ScaffoldAnswers, defaultTheme?: string): string {
  const pkg = {
    name:
      answers.siteName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'cogenta-site',
    version: '0.0.0',
    private: true,
    type: 'module',
    // Audit fiche 15, T04: a scaffolded site had no `scripts.start`, so
    // `npm start`/most PaaS auto-detection (which look for exactly this
    // script) had nothing to run — the only documented way to boot it was
    // typing `cogenta serve` by hand. `engines.node` mirrors the version
    // this installer itself requires and `cogenta doctor` already checks
    // for (`doctor.ts`'s own SQLite driver check names "22.13 or later"),
    // so a host that honours `engines` (Node's own `--engines-strict`, most
    // PaaS buildpacks) refuses to run this site on a Node too old for it,
    // instead of failing later with an obscure `SCHEMA_INVALID` or a
    // missing `node:sqlite`.
    engines: { node: '>=22.13' },
    scripts: { start: 'cogenta serve' },
    dependencies: {
      '@cogenta/core': 'latest',
      '@cogenta/cli': 'latest',
      '@cogenta/theme-canonical': 'latest',
      ...(defaultTheme === undefined ? {} : { [defaultTheme]: 'latest' }),
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
  const pack = BLUEPRINT_CONTENT_PACKS[blueprint.id]

  await mkdir(answers.targetDir, { recursive: true })
  await mkdir(join(answers.targetDir, '.cogenta'), { recursive: true })

  const configPath = join(answers.targetDir, 'cogenta.config.mjs')
  await writeFile(configPath, configFileContents(answers), 'utf8')
  await writeFile(
    join(answers.targetDir, 'package.json'),
    packageJsonContents(answers, pack?.defaultTheme),
    'utf8',
  )

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
  // `COGENTA_PREVIEW_SIGNING_KEY` (`@cogenta/api`'s `preview-token.ts`) signs
  // the unauthenticated draft-preview link — a second, independent key so a
  // leak of one never grants the other. Generated here for the same reason
  // as the auth key above: without it, "Prévisualiser"/"Preview" throws
  // `CONFIG_INVALID` on the very first click, a real onboarding trap found
  // by testing a freshly scaffolded site end to end.
  await writeFile(
    join(answers.targetDir, '.env'),
    `COGENTA_AUTH_SIGNING_KEY=${randomBytes(32).toString('base64')}\n` +
      `COGENTA_PREVIEW_SIGNING_KEY=${randomBytes(32).toString('base64')}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await writeFile(
    join(answers.targetDir, '.gitignore'),
    ['node_modules/', '.env', '.cogenta/'].join('\n') + '\n',
    'utf8',
  )

  // L22 task 1: the superagent ("Cogenta Agent", active by default) and its
  // two disabled example built-ins exist in configuration from the very
  // first boot — the same `.cogenta/agents-runtime/` directory `cogenta
  // serve` (`@cogenta/cli`) reads and writes from. `ensureBuiltinAgents`/
  // `ensureBuiltinAgentSkills` are idempotent, so a site scaffolded here and
  // later `cogenta serve`d again never gets a second copy.
  const agentsRuntimeDir = join(answers.targetDir, '.cogenta', 'agents-runtime')
  await ensureBuiltinAgents(
    createFileAgentDeclarationStore({ dir: join(agentsRuntimeDir, 'agents') }),
  )
  await ensureBuiltinAgentSkills(
    createFileAgentSkillStore({ dir: join(agentsRuntimeDir, 'skills') }),
  )

  // `cogenta serve` (`@cogenta/cli`) hard-requires a `cogenta.schema.*` file
  // to exist next to the config — including for `blank`, whose whole point
  // is an empty collections array, not a missing file. Writing it
  // unconditionally is what makes "npm create cogenta" with every default
  // answer produce a site `cogenta serve` can actually start.
  const schemaPath = join(answers.targetDir, 'cogenta.schema.mjs')
  const merged = mergeCollections(pack?.collections ?? [], answers.approvedCollections ?? [])
  const taxonomies = pack?.taxonomies ?? []
  await writeFile(schemaPath, schemaFileContents(merged.all, taxonomies), 'utf8')
  let skinSource: 'generated' | 'preset' | 'default' | undefined

  // A plan the human approved brings its own skin, whatever blueprint was
  // picked — including `blank`, which has no content pack and therefore
  // never wrote a `theme.tokens.json` before.
  const writesTheme = pack !== undefined || answers.approvedCollections !== undefined

  if (writesTheme) {
    const startingSkin = STARTING_SKINS[blueprint.id]
    if (answers.skinTokens !== undefined) {
      skinSource = 'generated'
    } else if (startingSkin !== undefined) {
      skinSource = 'preset'
    } else {
      skinSource = 'default'
    }
    const tokensJson =
      answers.skinTokens !== undefined
        ? `${JSON.stringify(answers.skinTokens, null, 2)}\n`
        : startingSkin !== undefined
          ? `${JSON.stringify(startingSkin, null, 2)}\n`
          : await canonicalTokensJson()
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
  let activeTheme: string | undefined
  let mediaSeeded = 0
  let menusSeeded = 0
  let siteSettingsSeeded = 0
  const needsDatabaseWork = merged.all.length > 0
  if (needsDatabaseWork && migrateExitCode === 0 && usersExitCode === 0) {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: answers.databaseDriver,
      url: databaseUrlFor(answers),
    })
    try {
      await createSchemaTables(selection.instance, merged.all, taxonomies)
      await ensureAuthTables(selection.instance)
      const admin = await createUserStore(selection.instance).byEmail(answers.adminEmail)
      const adminId = admin?.id ?? null

      if (pack !== undefined) {
        // (b) active theme — same store/table `cogenta serve` and the
        // Appearance screen already read (`theme-store.js`). Written
        // whether or not demo content is seeded: a blueprint's theme is
        // part of what the site *is*, not part of its fake demo data.
        if (pack.defaultTheme !== undefined) {
          await ensureThemeTable(selection.instance)
          await createThemeStore({ db: selection.instance }).set({
            activeTheme: pack.defaultTheme,
            updatedBy: adminId,
          })
          activeTheme = pack.defaultTheme
        }

        // (c) menus and site settings — same reasoning: real site setup,
        // not demo content, so seeded regardless of `seedDemoContent`.
        if (pack.menus !== undefined) {
          menusSeeded = await seedBlueprintMenus(
            selection.instance,
            answers.defaultLocale,
            pack.menus,
          )
        }
        if (pack.siteSettings !== undefined) {
          siteSettingsSeeded = await seedSiteSettings(
            selection.instance,
            answers.defaultLocale,
            pack.siteSettings,
            adminId,
            logger,
          )
        }
      }

      let media: Record<string, string> = {}
      if (pack !== undefined && (answers.seedDemoContent ?? true)) {
        // (d) demo media, before demo content, so the pack's own
        // `seedDemoContent` can reference the ids it seeds. Uses the same
        // storage driver `cogenta serve` will (`storage.path` in
        // `cogenta.config.mjs`) and the same image-processing pipeline a
        // real upload takes, so an installed site's `/_image?id=` URLs work
        // identically for a demo image and one an editor later uploads.
        if (pack.mediaSpecs !== undefined && pack.mediaSpecs.length > 0) {
          const storageSelection = await createStorageRegistry({ logger }).select({
            path: join(answers.targetDir, '.cogenta', 'media'),
          })
          try {
            const imageSelection = await selectMediaImageProcessor(logger)
            media = await seedDemoMedia(
              {
                db: selection.instance,
                storage: storageSelection.instance,
                adminId,
                ...(imageSelection === null ? {} : { images: imageSelection.processor }),
              },
              pack.mediaSpecs,
            )
            mediaSeeded = Object.keys(media).length
          } finally {
            await storageSelection.dispose()
          }
        }

        await pack.seedDemoContent({
          db: selection.instance,
          defaultLocale: answers.defaultLocale,
          adminId,
          media,
        })
      }

      approvedEntriesSeeded = await seedApprovedEntries({
        db: selection.instance,
        collections: merged.added,
        entries: answers.approvedDemoContent ?? [],
        defaultLocale: answers.defaultLocale,
        adminId,
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
    ...(activeTheme === undefined ? {} : { activeTheme }),
    mediaSeeded,
    menusSeeded,
    siteSettingsSeeded,
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
