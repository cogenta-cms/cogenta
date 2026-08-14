import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createOutput, runMigrate, runUsers } from '@cogenta/cli'

export interface ScaffoldAnswers {
  readonly targetDir: string
  readonly siteName: string
  readonly siteUrl: string
  readonly defaultLocale: string
  readonly databaseDriver: 'sqlite' | 'postgres' | 'mysql'
  readonly databaseUrl?: string
  readonly llm?: { readonly provider: string; readonly model: string }
  readonly adminEmail: string
}

export interface ScaffoldResult {
  readonly configPath: string
  readonly migrateExitCode: number
  readonly migrateOutput: string
  readonly usersExitCode: number
  readonly usersOutput: string
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
 * Step 9: "Installation, migrations, contenu de démo." Writes the site's
 * own files, then genuinely runs it up — `runMigrate`/`runUsers` are the
 * exact functions `cogenta migrate up`/`cogenta users create` call, reused
 * rather than re-implemented, so a scaffolded site is provably the same
 * thing those commands would produce by hand afterwards.
 */
export async function scaffoldSite(
  answers: ScaffoldAnswers,
  env: Record<string, string | undefined> = process.env,
): Promise<ScaffoldResult> {
  await mkdir(answers.targetDir, { recursive: true })
  await mkdir(join(answers.targetDir, '.cogenta'), { recursive: true })

  const configPath = join(answers.targetDir, 'cogenta.config.mjs')
  await writeFile(configPath, configFileContents(answers), 'utf8')
  await writeFile(join(answers.targetDir, 'package.json'), packageJsonContents(answers), 'utf8')

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

  return {
    configPath,
    migrateExitCode,
    migrateOutput: migrateCapture.text() + migrateStderr.text(),
    usersExitCode,
    usersOutput: usersCapture.text() + usersStderr.text(),
  }
}
