import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { VOCABULARY_NAMES } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import type { ThemeManifest } from '../manifest.js'
import { describeKind, matchForbidden } from './forbidden.js'
import { IGNORED_DIRECTORIES, SCANNED_EXTENSIONS, scanSource } from './scan-file.js'
import type { SourceFinding } from './scanner.js'

/**
 * The installation check of contract D.
 *
 * Two refusals, and the word the contract uses for both is *refused*, not
 * *warned*: a theme that declares fewer than the twelve blocks would silently
 * drop content on a theme switch, and a theme that reaches for `node:fs` or
 * the database has left the sandbox the two-plane architecture gives it for
 * free (ADR-0004, ADR-0016).
 *
 * This module reads the filesystem, so it belongs to the control plane — the
 * install path — and never to the process that renders pages.
 */

export interface FileFinding extends SourceFinding {
  /** Path relative to the theme root, with forward slashes. */
  readonly file: string
}

export interface ThemeInspection {
  readonly ok: boolean
  /** Vocabulary blocks the manifest does not declare. */
  readonly missingBlocks: readonly string[]
  readonly findings: readonly FileFinding[]
  readonly filesScanned: number
}

export interface VerifyThemeOptions {
  readonly root: string
  readonly manifest: ThemeManifest
  /**
   * Blocks the theme must declare. The twelve of the vocabulary by default;
   * a caller passes its own only to check a theme against a future vocabulary.
   */
  readonly requiredBlocks?: readonly string[]
}

/** Collects everything wrong with a theme without deciding what to do about it. */
export async function inspectTheme(options: VerifyThemeOptions): Promise<ThemeInspection> {
  const required = options.requiredBlocks ?? VOCABULARY_NAMES
  const declared = new Set(options.manifest.implements)
  const missingBlocks = required.filter((name) => !declared.has(name))

  const findings: FileFinding[] = []
  let filesScanned = 0

  for await (const file of sourceFiles(options.root)) {
    filesScanned += 1
    const source = await readFile(file, 'utf8')
    const relativePath = relative(options.root, file).split(sep).join('/')
    for (const finding of scanSource(relativePath, source)) {
      findings.push({ ...finding, file: relativePath })
    }
  }

  findings.push(...(await manifestAliasFindings(options.root)))

  return {
    ok: missingBlocks.length === 0 && findings.length === 0,
    missingBlocks,
    findings,
    filesScanned,
  }
}

/**
 * Runs the installation check and refuses.
 *
 * Returns the inspection when the theme passes, so a caller that wants the
 * file count for a log does not have to run the scan twice.
 */
export async function verifyTheme(options: VerifyThemeOptions): Promise<ThemeInspection> {
  const inspection = await inspectTheme(options)
  if (inspection.ok) return inspection

  const name = options.manifest.name

  if (inspection.findings.length > 0) {
    throw new CogentaError({
      code: 'THEME_IMPORT_FORBIDDEN',
      message: `The theme "${name}" is refused: ${describeFindings(inspection.findings)}`,
      hint: 'A theme runs without secrets and without a database connection (R5, ADR-0004). It reads content through `ctx.content`, which is an HTTP client carrying a read-only token. Remove the imports above; there is no flag to allow them.',
      details: {
        theme: name,
        root: options.root,
        findings: inspection.findings,
        missingBlocks: inspection.missingBlocks,
      },
    })
  }

  throw new CogentaError({
    code: 'THEME_BLOCK_MISSING',
    message: `The theme "${name}" does not implement every block of the vocabulary. Missing: ${inspection.missingBlocks.join(', ')}.`,
    hint: 'Every theme implements the twelve blocks, so that switching theme never drops content. Add a component for each missing block and list it in `implements`.',
    details: { theme: name, root: options.root, missingBlocks: inspection.missingBlocks },
  })
}

/** One line per finding, naming the file, the line and the import. */
function describeFindings(findings: readonly FileFinding[]): string {
  const lines = findings.map((finding) => describeFinding(finding))
  return `\n  - ${lines.join('\n  - ')}`
}

function describeFinding(finding: FileFinding): string {
  const at = `${finding.file}:${finding.line}:${finding.column}`

  if (finding.kind === 'unanalysable-import') {
    return `${at} calls import() with a specifier that cannot be read statically`
  }
  if (finding.kind === 'commonjs-require') {
    const on = finding.specifier === null ? '' : ` on "${finding.specifier}"`
    return `${at} uses a CommonJS \`require\` call${on}, and a theme is ESM only`
  }

  const also = finding.specifier === finding.resolved ? '' : `, which is ${finding.resolved ?? ''}`
  const why = describeKind(finding.forbiddenKind ?? 'node-builtin')
  return `${at} imports "${finding.specifier ?? ''}" (${why}${also})`
}

/**
 * The alias route: `package.json` can rename a forbidden module.
 *
 * `"imports": { "#store": "node:fs" }` turns `import '#store'` into a specifier
 * the source scan has no reason to suspect, and a forbidden package listed in
 * `dependencies` is a declaration of intent whatever the sources say.
 */
async function manifestAliasFindings(root: string): Promise<FileFinding[]> {
  let raw: string
  try {
    raw = await readFile(join(root, 'package.json'), 'utf8')
  } catch {
    return [] // a theme without a package.json declares no alias either
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []

  const findings: FileFinding[] = []
  const record = parsed as Record<string, unknown>

  const flag = (specifier: string, note: string): void => {
    const match = matchForbidden(specifier)
    if (match === null) return
    findings.push({
      kind: 'forbidden-import',
      file: 'package.json',
      line: lineOf(raw, specifier),
      column: 1,
      specifier: `${note} → ${specifier}`,
      resolved: match.specifier,
      forbiddenKind: match.kind,
    })
  }

  for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const section = record[key]
    if (typeof section !== 'object' || section === null) continue
    for (const name of Object.keys(section)) flag(name, key)
  }

  const imports = record.imports
  if (typeof imports === 'object' && imports !== null) {
    for (const [alias, target] of Object.entries(imports as Record<string, unknown>)) {
      for (const value of collectStrings(target)) flag(value, `imports["${alias}"]`)
    }
  }

  return findings
}

/** Conditional exports nest, so the targets are gathered rather than assumed flat. */
function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item))
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap((item) => collectStrings(item))
  }
  return []
}

function lineOf(source: string, needle: string): number {
  const index = source.indexOf(needle)
  if (index === -1) return 1
  return source.slice(0, index).split('\n').length
}

/** Every source file below `root`, skipping what a bundler would never read. */
async function* sourceFiles(root: string): AsyncGenerator<string> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' })
  } catch (error) {
    throw new CogentaError({
      code: 'THEME_NOT_FOUND',
      message: `The theme directory "${root}" cannot be read.`,
      hint: 'Check the theme root in the configuration, and that the theme package is installed.',
      cause: error,
      details: { root },
    })
  }

  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.includes(entry.name)) continue
      yield* sourceFiles(path)
      continue
    }
    if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) yield path
  }
}
