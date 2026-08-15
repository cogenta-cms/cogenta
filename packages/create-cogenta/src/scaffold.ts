import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createOutput, runMigrate, runUsers } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import type { SkinTokens } from '@cogenta/render'
import { type CollectionDefinition, createSchemaTables } from '@cogenta/schema'
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
  await writeFile(
    join(answers.targetDir, '.env'),
    `COGENTA_AUTH_SIGNING_KEY=${randomBytes(32).toString('base64')}\n`,
    'utf8',
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
  await writeFile(schemaPath, schemaFileContents(pack?.collections ?? []), 'utf8')
  let skinSource: 'generated' | 'default' | undefined

  if (pack !== undefined) {
    skinSource = answers.skinTokens === undefined ? 'default' : 'generated'
    const tokensJson =
      answers.skinTokens === undefined
        ? await canonicalTokensJson()
        : `${JSON.stringify(answers.skinTokens, null, 2)}\n`
    await writeFile(join(answers.targetDir, 'theme.tokens.json'), tokensJson, 'utf8')
    await writeFile(
      join(answers.targetDir, '.cogenta', 'recommended-agents.json'),
      `${JSON.stringify(pack.recommendedAgents, null, 2)}\n`,
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

  if (pack !== undefined && migrateExitCode === 0 && usersExitCode === 0) {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: answers.databaseDriver,
      url: databaseUrlFor(answers),
    })
    try {
      await createSchemaTables(selection.instance, pack.collections)
      await ensureAuthTables(selection.instance)
      const admin = await createUserStore(selection.instance).byEmail(answers.adminEmail)
      await pack.seedDemoContent(selection.instance, answers.defaultLocale, admin?.id ?? null)
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
  }
}
