import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import type { VocabularyBlock } from '@cogenta/blocks'
import { createOutput, runMigrate, runUsers } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger, type DatabaseHandle } from '@cogenta/core'
import { type CollectionDefinition, createContentStore, createSchemaTables } from '@cogenta/schema'
import {
  BLOG_COLLECTIONS,
  BLOG_DEMO_CATEGORIES,
  BLOG_DEMO_PAGES,
  BLOG_DEMO_POSTS,
  BLOG_DEMO_TAGS,
  BLOG_RECOMMENDED_AGENTS,
  category,
  page,
  post,
  tag,
} from './blueprints/blog.js'
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
  /** Present only when a blueprint wrote a content schema (e.g. `blog`). */
  readonly schemaPath?: string
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

  return `export default {
  site: {
    name: ${JSON.stringify(answers.siteName)},
    url: ${JSON.stringify(answers.siteUrl)},
    locales: [${JSON.stringify(answers.defaultLocale)}],
    defaultLocale: ${JSON.stringify(answers.defaultLocale)},
  },
  database: {
    driver: ${JSON.stringify(answers.databaseDriver)},
    url: ${JSON.stringify(databaseUrlFor(answers))},
  },
  cache: { path: ${JSON.stringify(join(answers.targetDir, '.cogenta', 'cache'))} },
  storage: { path: ${JSON.stringify(join(answers.targetDir, '.cogenta', 'media'))} },
${llmBlock}}
`
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
 * A `VocabularyBlock` (contract B: `_key`/`_type`/`_version` plus its own
 * fields) as the block zone `f.blocks()` stores it: `key`/`type`/`data`,
 * where `data` is everything but the three contract-B envelope fields.
 */
function toBlockZoneEntry(block: VocabularyBlock): {
  key: string
  type: string
  data: Record<string, unknown>
} {
  const { _key, _type, _version: _discard, ...data } = block
  return { key: _key, type: _type, data }
}

/**
 * Inserts the `blog` blueprint's demo content through the real `ContentStore`
 * — never mocked (house rule) — so a scaffolded blog blueprint has genuine
 * rows to look at, not a claim that it does.
 */
async function seedBlogDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const categoryStore = createContentStore({ db, collection: category, defaultLocale })
  const tagStore = createContentStore({ db, collection: tag, defaultLocale })
  const postStore = createContentStore({ db, collection: post, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const categoryIdBySlug = new Map<string, string>()
  for (const demo of BLOG_DEMO_CATEGORIES) {
    const entry = await categoryStore.create({
      status: 'published',
      createdBy: adminId,
      values: { name: demo.name, slug: demo.slug },
    })
    categoryIdBySlug.set(demo.slug, entry.id)
  }

  const tagIdBySlug = new Map<string, string>()
  for (const demo of BLOG_DEMO_TAGS) {
    const entry = await tagStore.create({
      status: 'published',
      createdBy: adminId,
      values: { name: demo.name, slug: demo.slug },
    })
    tagIdBySlug.set(demo.slug, entry.id)
  }

  for (const demo of BLOG_DEMO_POSTS) {
    await postStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        body: demo.body,
        category: categoryIdBySlug.get(demo.categorySlug) ?? null,
        tags: demo.tagSlugs.map((slug) => tagIdBySlug.get(slug)).filter((id) => id !== undefined),
      },
    })
  }

  for (const demo of BLOG_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

/**
 * Step 9: "Installation, migrations, contenu de démo." Writes the site's
 * own files, then genuinely runs it up — `runMigrate`/`runUsers` are the
 * exact functions `cogenta migrate up`/`cogenta users create` call, reused
 * rather than re-implemented, so a scaffolded site is provably the same
 * thing those commands would produce by hand afterwards.
 *
 * A blueprint beyond `blank` (currently only `blog`, L9 task 3) additionally
 * writes a content schema, materialises its tables, seeds real demo content,
 * applies a skin and records which agents it recommends — see
 * `./blueprints/blog.ts`. `blank` takes none of these branches, so its
 * output is unchanged.
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

  let schemaPath: string | undefined

  if (blueprint.id === 'blog') {
    schemaPath = join(answers.targetDir, 'cogenta.schema.mjs')
    await writeFile(schemaPath, schemaFileContents(BLOG_COLLECTIONS), 'utf8')
    await writeFile(
      join(answers.targetDir, 'theme.tokens.json'),
      await canonicalTokensJson(),
      'utf8',
    )
    await writeFile(
      join(answers.targetDir, '.cogenta', 'recommended-agents.json'),
      `${JSON.stringify(BLOG_RECOMMENDED_AGENTS, null, 2)}\n`,
      'utf8',
    )
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

  if (blueprint.id === 'blog' && migrateExitCode === 0 && usersExitCode === 0) {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: answers.databaseDriver,
      url: databaseUrlFor(answers),
    })
    try {
      await createSchemaTables(selection.instance, BLOG_COLLECTIONS)
      await ensureAuthTables(selection.instance)
      const admin = await createUserStore(selection.instance).byEmail(answers.adminEmail)
      await seedBlogDemoContent(selection.instance, answers.defaultLocale, admin?.id ?? null)
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
    ...(schemaPath === undefined ? {} : { schemaPath }),
  }
}
