import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { defineCollection } from '../src/define-collection.js'
import { f } from '../src/fields.js'
import { renderTypeDeclarations } from '../src/generate-types.js'

/**
 * The acceptance criterion of L1, checked the only way that proves it: by
 * running the compiler over the generated declarations.
 *
 * Asserting on the string says the generator wrote what we expected; only tsc
 * says a theme referencing a field that no longer exists fails to build.
 */

const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: {
    title: f.text({ required: true }),
    excerpt: f.text(),
    tags: f.relation({ to: 'article', many: true }),
  },
  permissions: { read: ['public'] },
})

const workspace = mkdtempSync(join(tmpdir(), 'cogenta-types-'))

const require_ = createRequire(import.meta.url)
const tsc = join(dirname(require_.resolve('typescript')), '..', 'bin', 'tsc')

writeFileSync(join(workspace, 'package.json'), JSON.stringify({ type: 'module' }))
writeFileSync(join(workspace, 'types.d.ts'), renderTypeDeclarations([article]))

/** Compiles a theme-like file against the generated declarations. */
function compile(source: string): { code: number; output: string } {
  const file = join(workspace, 'theme.ts')
  writeFileSync(file, source)

  const result = spawnSync(
    process.execPath,
    [tsc, '--noEmit', '--strict', '--target', 'es2023', '--module', 'nodenext', file],
    // Run from the temporary workspace: tsc refuses to take files on the command
    // line while a tsconfig.json sits in the current directory.
    { encoding: 'utf8', cwd: workspace },
  )

  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` }
}

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe('the generated declarations, as a compiler sees them', () => {
  it('compiles a theme that reads fields the schema declares', () => {
    const result = compile(`import type { Article } from './types.js'

export function render(article: Article): string {
  return \`\${article.title} \${article.excerpt ?? ''} \${article.tags.length} \${article.provenance}\`
}
`)

    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  }, 60_000)

  it('fails to compile a theme reading a field the schema does not declare', () => {
    const result = compile(`import type { Article } from './types.js'

export function render(article: Article): string {
  return article.subtitle
}
`)

    expect(result.code).not.toBe(0)
    expect(result.output).toContain('subtitle')
  }, 60_000)

  it('fails to compile a theme that forgets an optional field may be empty', () => {
    const result = compile(`import type { Article } from './types.js'

export function render(article: Article): number {
  return article.excerpt.length
}
`)

    expect(result.code).not.toBe(0)
    expect(result.output).toContain('null')
  }, 60_000)
})
