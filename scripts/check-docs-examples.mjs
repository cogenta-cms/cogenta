#!/usr/bin/env node
/**
 * L9 task 5's "un exemple de code est testé en CI et ne peut pas pourrir" rule,
 * enforced mechanically rather than by discipline.
 *
 * A markdown code block preceded by `<!-- embed:<path> -->` must be a byte-for-byte
 * copy of `<path>` (relative to the repo root). `<path>` is a real, type-checked,
 * vitest-covered file under `examples/getting-started/` (see that package's
 * `package.json` — `pnpm typecheck`/`pnpm test` already run against it as part of
 * every normal build). This script only checks that the markdown has not drifted
 * from that source of truth; it does not itself execute anything.
 *
 * Deliberately not a generic "extract every fenced code block and run it" harness:
 * this repo has exactly one guide with this requirement today, and a bespoke
 * markdown-execution engine would be solving a problem nobody has yet.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')

const EMBED_MARKER = /<!--\s*embed:(\S+)\s*-->/

async function findMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(full)))
    } else if (entry.name.endsWith('.md')) {
      files.push(full)
    }
  }
  return files
}

function extractEmbeds(markdown) {
  const lines = markdown.split('\n')
  const embeds = []
  for (let i = 0; i < lines.length; i++) {
    const match = EMBED_MARKER.exec(lines[i])
    if (match === null) continue

    const fenceStart = i + 1
    if (!lines[fenceStart]?.startsWith('```')) {
      throw new Error(`line ${i + 1}: an embed marker must be followed by a fenced code block`)
    }
    const bodyStart = fenceStart + 1
    const bodyEnd = lines.indexOf('```', bodyStart)
    if (bodyEnd === -1) {
      throw new Error(`line ${fenceStart + 1}: unterminated fenced code block`)
    }

    embeds.push({
      sourcePath: match[1],
      markerLine: i + 1,
      body: lines.slice(bodyStart, bodyEnd).join('\n'),
    })
  }
  return embeds
}

async function main() {
  const docsDir = join(repoRoot, 'docs')
  const markdownFiles = await findMarkdownFiles(docsDir)

  const problems = []

  for (const file of markdownFiles) {
    const markdown = await readFile(file, 'utf8')
    let embeds
    try {
      embeds = extractEmbeds(markdown)
    } catch (error) {
      problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }

    for (const embed of embeds) {
      const sourceAbsolute = join(repoRoot, embed.sourcePath)
      let sourceContent
      try {
        sourceContent = await readFile(sourceAbsolute, 'utf8')
      } catch {
        problems.push(
          `${file}:${embed.markerLine}: embeds "${embed.sourcePath}", which does not exist`,
        )
        continue
      }

      const expected = sourceContent.replace(/\n$/, '')
      if (embed.body !== expected) {
        problems.push(
          `${file}:${embed.markerLine}: embedded copy of "${embed.sourcePath}" has drifted from the real file — ` +
            `regenerate the code block from the file's current contents`,
        )
      }
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`)
    process.stderr.write(`\n${problems.length} documentation example(s) out of sync.\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write('All documentation examples match their source files.\n')
}

await main()
