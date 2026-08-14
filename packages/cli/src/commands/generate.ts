import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { isCogentaError, type Logger, loadConfig } from '@cogenta/core'
import { renderTypeDeclarations } from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadCollections } from './serve.js'

export type GenerateSubcommand = 'types'

export interface GenerateOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** Overrides the default `.cogenta/types/schema.d.ts` output path. */
  readonly outFile?: string
}

const DEFAULT_OUTPUT = join('.cogenta', 'types', 'schema.d.ts')

const USAGE = `Usage
  cogenta generate types [--out <file>]

Writes TypeScript declarations for every collection in cogenta.schema.(m)js —
the same generator "cogenta doctor"'s type checks rely on being accurate.
Defaults to ${DEFAULT_OUTPUT}, relative to the project root.

"generate schema" and "generate migrations" do not exist yet: nothing in this
codebase can diff a schema into a migration file today — migrations are
still hand-written (see the write-migration skill). Only "types" is real.
`

/**
 * `cogenta generate` — only `types` is real (see USAGE). 0 written. 1 the
 * schema failed to load. 2 the command line was wrong.
 */
export async function runGenerate(options: GenerateOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env

  if (options.subcommand === undefined) {
    stderr(`cogenta generate needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (options.subcommand !== 'types') {
    stderr(`Unknown subcommand "${options.subcommand}". Only "types" exists today.\n\n${USAGE}`)
    return 2
  }

  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })
  const projectRoot =
    loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)

  try {
    const collections = await loadCollections(projectRoot)
    const declarations = renderTypeDeclarations(collections)
    const outFile = options.outFile ?? join(projectRoot, DEFAULT_OUTPUT)
    await mkdir(dirname(outFile), { recursive: true })
    await writeFile(outFile, declarations, 'utf8')
    out.ok(`Wrote types for ${collections.length} collection(s) to ${outFile}`)
    return 0
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  }
}
