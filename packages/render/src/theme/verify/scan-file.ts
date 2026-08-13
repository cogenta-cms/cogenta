import { type SourceFinding, scanCode } from './scanner.js'

/**
 * Which files are scanned. Everything a bundler would turn into code.
 *
 * `.astro`, `.ts`, `.js` and their variants are obvious. `.md`/`.mdx` are not
 * scanned here: MDX imports are a real vector, but MDX is not part of the
 * theme structure contract D fixes, and scanning it would need a Markdown
 * reader this check does not have.
 */
export const SCANNED_EXTENSIONS = [
  '.astro',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const

/** Directories never scanned: not theme source, and enormous. */
export const IGNORED_DIRECTORIES = ['node_modules', 'dist', '.git', '.astro', 'coverage']

interface Position {
  readonly line: number
  readonly column: number
}

/** Position of an absolute offset in the source, both 1-based. */
function positionAt(source: string, offset: number): Position {
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') {
      line += 1
      lastBreak = i
    }
  }
  return { line, column: offset - lastBreak }
}

interface Chunk {
  readonly code: string
  readonly offset: number
}

/**
 * The code inside an `.astro` file: the frontmatter, every `{…}` expression of
 * the template, and every `<script>` body.
 *
 * The template markup itself is skipped rather than lexed, because prose is
 * full of apostrophes and an apostrophe read as a quote would swallow the rest
 * of the line — which is how a scanner ends up missing the import it was
 * written to catch.
 */
function astroChunks(source: string): Chunk[] {
  const chunks: Chunk[] = []
  let templateStart = 0

  // Astro's own rule: the frontmatter is fenced by `---` at the very start.
  const fence = /^﻿?\s*---\r?\n/u.exec(source)
  if (fence !== null) {
    const bodyStart = fence[0].length
    const close = /^---[ \t]*\r?$/mu.exec(source.slice(bodyStart))
    const bodyEnd = close === null ? source.length : bodyStart + (close.index ?? 0)
    chunks.push({ code: source.slice(bodyStart, bodyEnd), offset: bodyStart })
    templateStart = close === null ? source.length : bodyEnd + close[0].length
  }

  for (const chunk of braceExpressions(source, templateStart)) chunks.push(chunk)
  for (const chunk of scriptBodies(source, templateStart)) chunks.push(chunk)

  return chunks
}

/**
 * Every `{…}` region of the template, brace-matched while respecting the
 * strings and comments inside it.
 */
function braceExpressions(source: string, from: number): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = from; i < source.length; i += 1) {
    if (source[i] !== '{') continue

    const start = i + 1
    let depth = 1
    let cursor = start

    while (cursor < source.length && depth > 0) {
      const char = source[cursor]
      if (char === '"' || char === "'" || char === '`') {
        cursor = endOfString(source, cursor, char)
        continue
      }
      if (char === '/' && source[cursor + 1] === '/') {
        while (cursor < source.length && source[cursor] !== '\n') cursor += 1
        continue
      }
      if (char === '/' && source[cursor + 1] === '*') {
        const end = source.indexOf('*/', cursor + 2)
        cursor = end === -1 ? source.length : end + 2
        continue
      }
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      cursor += 1
    }

    const end = depth === 0 ? cursor - 1 : source.length
    chunks.push({ code: source.slice(start, end), offset: start })
    i = end
  }

  return chunks
}

/** Index just past a string literal that starts at `start`. */
function endOfString(source: string, start: number, quote: string): number {
  let cursor = start + 1
  while (cursor < source.length) {
    const char = source[cursor]
    if (char === '\\') {
      cursor += 2
      continue
    }
    if (char === quote) return cursor + 1
    if (quote !== '`' && char === '\n') return cursor
    cursor += 1
  }
  return cursor
}

const SCRIPT_TAG = /<script\b[^>]*>/giu

function scriptBodies(source: string, from: number): Chunk[] {
  const chunks: Chunk[] = []
  SCRIPT_TAG.lastIndex = from

  let opening = SCRIPT_TAG.exec(source)
  while (opening !== null) {
    const start = opening.index + opening[0].length
    const end = source.toLowerCase().indexOf('</script', start)
    const stop = end === -1 ? source.length : end
    chunks.push({ code: source.slice(start, stop), offset: start })
    SCRIPT_TAG.lastIndex = stop
    opening = SCRIPT_TAG.exec(source)
  }

  return chunks
}

/** Findings of one source file, deduplicated by position and kind. */
export function scanSource(path: string, source: string): SourceFinding[] {
  const chunks = path.endsWith('.astro') ? astroChunks(source) : [{ code: source, offset: 0 }]

  const seen = new Set<string>()
  const findings: SourceFinding[] = []

  for (const chunk of chunks) {
    const at = positionAt(source, chunk.offset)
    for (const finding of scanCode(chunk.code, { line: at.line, column: at.column })) {
      const key = `${finding.kind}:${finding.line}:${finding.column}:${finding.specifier ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push(finding)
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column)
}
