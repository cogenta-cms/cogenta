import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `deps.scan` — the built-in Security Scanner agent's (`agents/builtins.ts`)
 * one real capability, "réutilise... les vérifications déjà documentées dans
 * AGENTS.md" (L22 task 1 item 5): AGENTS.md's own R9 discipline names an
 * unpinned/wildcard version as exactly the kind of dependency risk this
 * project already cares about, so this tool reads the site's own
 * `package.json` (read-only, no shell exec, no network — zero new
 * dependency, R9/R10) and flags any dependency whose version specifier is
 * not pinned in the loose sense semver tooling already treats as "someone
 * decided this range on purpose": `^`, `~`, an exact version, or
 * `workspace:*` inside this monorepo itself. `*`, `latest`, `x`, and a bare
 * tag (`next`) are flagged — a site that ships one of these has no way to
 * know what it will actually install on the next `npm install`.
 *
 * Deliberately narrow: this reads declared ranges, not installed versions or
 * known CVEs (a real vulnerability database is a service dependency this
 * tool does not take — R1). "Audit du journal d'audit pour des motifs
 * suspects" (the other half the lot names for this agent) is not built here;
 * see this task's closing report for why it is left as a documented
 * follow-up rather than a second, rushed tool.
 */

const UNPINNED_PATTERN = /^(\*|x|latest|next)$/iu

function isUnpinned(range: string): boolean {
  const trimmed = range.trim()
  if (trimmed.length === 0) return true
  if (trimmed.startsWith('workspace:')) return false
  if (UNPINNED_PATTERN.test(trimmed)) return true
  // A real semver range operator, or an exact version, or a URL/file spec —
  // none of those are "we don't know what we'll get".
  if (/^[\^~]?\d/u.test(trimmed)) return false
  if (/^(git|file|https?):/u.test(trimmed)) return false
  return true
}

export interface DepsScanToolOptions {
  /** Where this site's own `package.json` lives — `create-cogenta` always writes one at the project root. */
  readonly projectRoot: string
  readonly readFileImpl?: (path: string) => Promise<string>
}

const DepsScanInputSchema = z.object({})
type DepsScanInput = z.infer<typeof DepsScanInputSchema>

const DependencyFindingSchema = z.object({
  name: z.string(),
  range: z.string(),
  kind: z.enum(['dependencies', 'devDependencies']),
})

const DepsScanOutputSchema = z.object({
  scannedFile: z.string(),
  totalDependencies: z.number(),
  unpinned: z.array(DependencyFindingSchema),
})
export type DepsScanOutput = z.infer<typeof DepsScanOutputSchema>

interface PackageJsonShape {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
}

export function createDepsScanTool(
  options: DepsScanToolOptions,
): ToolDefinition<DepsScanInput, DepsScanOutput> {
  const read = options.readFileImpl ?? ((path: string) => readFile(path, 'utf8'))
  const packageJsonPath = join(options.projectRoot, 'package.json')

  return defineTool({
    name: 'deps.scan',
    version: '1.0.0',
    description:
      "Scan this site's own package.json for dependencies with an unpinned or wildcard version.",
    input: DepsScanInputSchema,
    output: DepsScanOutputSchema,
    permissions: ['deps.scan'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute() {
      const raw = await read(packageJsonPath)
      const parsed = JSON.parse(raw) as PackageJsonShape
      const groups: readonly (keyof PackageJsonShape)[] = ['dependencies', 'devDependencies']

      let total = 0
      const unpinned: DepsScanOutput['unpinned'] = []
      for (const kind of groups) {
        const deps = parsed[kind] ?? {}
        for (const [name, range] of Object.entries(deps)) {
          total += 1
          if (isUnpinned(range)) unpinned.push({ name, range, kind })
        }
      }

      return { scannedFile: packageJsonPath, totalDependencies: total, unpinned }
    },
  })
}
