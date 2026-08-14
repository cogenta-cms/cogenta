import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import {
  createAnthropicClient,
  createGoogleClient,
  createOpenAiClient,
  generateSkin,
  type ProviderClient,
} from '@cogenta/agents'
import { CogentaError, isCogentaError, type Logger, loadConfig } from '@cogenta/core'
import { type SkinTokens, TOKEN_GROUPS, validateSkin } from '@cogenta/render'
import type { Output, Writer } from '../output.js'

export type SkinSubcommand = 'list' | 'validate' | 'apply' | 'generate'

export interface SkinOptions {
  readonly subcommand: string | undefined
  /** `validate`/`apply`: path to a tokens.json file. Ignored by `list`/`generate`. */
  readonly file: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** `generate` only: free text — sector, mood, audience, brand colours. */
  readonly description?: string
  /** `generate` only: test seam, never used outside tests. */
  readonly fetchImpl?: typeof fetch
}

const TOKENS_FILE = 'theme.tokens.json'

const USAGE = `Usage
  cogenta skin list                       Show the site's active skin
  cogenta skin validate <tokens.json>     Check a token file against contract D
  cogenta skin apply <tokens.json>        Validate, then make it the active skin
  cogenta skin generate --description "…" Generate a skin from a description

"generate" needs an LLM provider configured (cogenta.config's llm block, or
COGENTA_LLM_* environment variables) — the CMS works without one (R2), so
"skin generate" is the one skin subcommand that refuses without it.
`

async function resolveProjectRoot(options: SkinOptions): Promise<string> {
  const env = options.env ?? process.env
  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })
  return loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)
}

function reportCogentaError(error: unknown, stderr: Writer): void {
  if (isCogentaError(error)) {
    stderr(`${error.code}: ${error.message}\n`)
    if (error.hint !== undefined) stderr(`${error.hint}\n`)
  } else {
    stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
}

async function readTokensFile(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

/** Validates, then writes — a skin is never applied without passing contract D first. */
async function applyTokens(tokens: SkinTokens, projectRoot: string): Promise<string> {
  const path = join(projectRoot, TOKENS_FILE)
  await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8')
  return path
}

async function runList(options: SkinOptions): Promise<number> {
  const { out, stderr } = options
  const projectRoot = await resolveProjectRoot(options)
  const path = join(projectRoot, TOKENS_FILE)

  let candidate: unknown
  try {
    candidate = await readTokensFile(path)
  } catch (error) {
    stderr(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  try {
    const tokens = validateSkin(candidate)
    out.heading('Active skin')
    out.line(path)
    for (const group of TOKEN_GROUPS) {
      out.line(`${group}: ${JSON.stringify(tokens[group])}`)
    }
    return 0
  } catch (error) {
    reportCogentaError(error, stderr)
    return 1
  }
}

async function runValidate(options: SkinOptions): Promise<number> {
  const { out, stderr } = options
  if (options.file === undefined || options.file.trim().length === 0) {
    stderr(`A file path is required.\n\n${USAGE}`)
    return 2
  }

  let candidate: unknown
  try {
    candidate = await readTokensFile(options.file)
  } catch (error) {
    stderr(
      `Could not read "${options.file}": ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }

  try {
    validateSkin(candidate)
    out.ok(`${options.file} is a valid skin.`)
    return 0
  } catch (error) {
    reportCogentaError(error, stderr)
    return 1
  }
}

async function runApply(options: SkinOptions): Promise<number> {
  const { out, stderr } = options
  if (options.file === undefined || options.file.trim().length === 0) {
    stderr(`A file path is required.\n\n${USAGE}`)
    return 2
  }

  let candidate: unknown
  try {
    candidate = await readTokensFile(options.file)
  } catch (error) {
    stderr(
      `Could not read "${options.file}": ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }

  try {
    const tokens = validateSkin(candidate)
    const projectRoot = await resolveProjectRoot(options)
    const written = await applyTokens(tokens, projectRoot)
    out.ok(`Applied. ${written}`)
    return 0
  } catch (error) {
    reportCogentaError(error, stderr)
    return 1
  }
}

/** The same adapter construction `create-cogenta`'s `llm-setup.ts` uses for its own provider client — kept as a small, local switch rather than a shared dependency, since the CLI's only need is "one client for the configured provider," with its own test seam. */
function clientFor(
  provider: string,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch | undefined,
): ProviderClient {
  const config = { apiKey, model, ...(fetchImpl === undefined ? {} : { fetchImpl }) }
  if (provider === 'anthropic') return createAnthropicClient(config)
  if (provider === 'openai') return createOpenAiClient(config)
  if (provider === 'google') return createGoogleClient(config)
  throw new CogentaError({
    code: 'PROVIDER_UNKNOWN',
    message: `No provider named "${provider}" is configured for this site.`,
    hint: 'Set llm.provider in cogenta.config to "anthropic", "openai" or "google".',
  })
}

async function runGenerateSkin(options: SkinOptions): Promise<number> {
  const { out, stderr } = options
  if (options.description === undefined || options.description.trim().length === 0) {
    stderr(`--description is required.\n\n${USAGE}`)
    return 2
  }

  const env = options.env ?? process.env
  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })

  if (loaded.config.llm === undefined || loaded.config.llm.apiKey === undefined) {
    stderr('No LLM provider is configured for this site — the CMS works without one (R2).\n')
    stderr('Set llm.provider/llm.model in cogenta.config and COGENTA_LLM_API_KEY to use this.\n')
    return 1
  }

  const projectRoot =
    loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)

  try {
    const client = clientFor(
      loaded.config.llm.provider,
      loaded.config.llm.apiKey,
      loaded.config.llm.model,
      options.fetchImpl,
    )
    out.detail(`Generating a skin from your description…`)
    const result = await generateSkin({
      client,
      model: loaded.config.llm.model,
      description: options.description,
      blueprintLabel: loaded.config.site.name,
    })

    if (!result.ok) {
      stderr(
        `${result.attempts} attempt${result.attempts === 1 ? '' : 's'} all failed validation: ${result.reason}\n`,
      )
      stderr('The site keeps its current skin — nothing was written.\n')
      return 1
    }

    const written = await applyTokens(result.tokens, projectRoot)
    out.ok(
      `Skin generated and validated in ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}. Applied. ${written}`,
    )
    return 0
  } catch (error) {
    reportCogentaError(error, stderr)
    return 1
  }
}

/**
 * `cogenta skin` — 0 the operation succeeded (including a valid `validate`).
 * 1 an invalid skin, a missing file, or a real failure. 2 the command line
 * was wrong.
 */
export async function runSkin(options: SkinOptions): Promise<number> {
  const { stderr } = options

  if (options.subcommand === undefined) {
    stderr(`cogenta skin needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (options.subcommand === 'list') return runList(options)
  if (options.subcommand === 'validate') return runValidate(options)
  if (options.subcommand === 'apply') return runApply(options)
  if (options.subcommand === 'generate') return runGenerateSkin(options)

  stderr(`Unknown subcommand "${options.subcommand}".\n\n${USAGE}`)
  return 2
}
