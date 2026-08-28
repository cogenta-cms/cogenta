import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { parseSkillFile, renderSkillFile } from './frontmatter.js'
import type { SkillMetadata } from './types.js'

const SKILL_FILE = 'SKILL.md'
const META_FILE = '.meta.json'

/**
 * The standard reference-folder layout (fiche 57), matching the real Claude
 * Code/Anthropic skill convention: sub-folders under a skill's own
 * directory, all optional, `SKILL.md` the only thing required at the root.
 * `references/` is documents consulted on demand, `scripts/` executable
 * utilities, `assets/` templates/images/files used as-is — none of these are
 * automatically read into an agent's context (see `AgentSkillStore`'s module
 * doc for why); they exist for a human, or a future `skill.read_resource`
 * tool, to reach for on purpose.
 */
export const SKILL_RESOURCE_DIRS = ['references', 'scripts', 'assets'] as const
export type SkillResourceDir = (typeof SKILL_RESOURCE_DIRS)[number]

export interface SkillResource {
  /** Relative to the skill's own directory, e.g. `"references/style-guide.md"`. Forward slashes always, on every OS. */
  readonly path: string
  readonly size: number
  readonly updatedAt: string
}

/**
 * L22 task 1bis's "Skills" screen — a **different concept** from
 * `skills/file-store.ts`'s `SkillStore`/`Skill`, which is L7's marketplace
 * registry (a signed, distributable folder with resource files, gated by
 * pre-check + review). This one is what the lot actually describes: "un
 * skill est un texte d'instruction nommé... qu'un agent charge dans son
 * contexte" — a short, site-authored piece of prompt text ("comment rédiger
 * un article"), never installed from anywhere, never signed, edited
 * in-place from the admin. Naming it `AgentSkill`/`AgentSkillStore` (this
 * file lives in the same `skills/` directory as the marketplace one on
 * purpose — they are siblings, not a replacement) keeps the two distinct in
 * every import site rather than overloading `Skill`/`SkillStore`.
 *
 * **Storage format, changed in L24 task 4**: originally one JSON file per
 * record (`<id>.json`). Now `<dir>/<id>/SKILL.md` (frontmatter + body),
 * reusing `parseSkillFile`/`renderSkillFile` from `frontmatter.ts` rather
 * than a second parser — the same format `file-store.ts`'s marketplace
 * registry already speaks, and the format a real Claude Code/Codex skill
 * ships in. This is what makes L24 task 4's acceptance criterion possible:
 * a `SKILL.md` copied verbatim from `.claude/skills/` (or any other
 * standard agent) is a valid `name`+`description`+body skill the moment it
 * is dropped into this store's directory and given a matching `.meta.json`
 * (or, read without one at all — see `readRecord` below).
 *
 * The fields this store needs that a portable `SKILL.md` has no room for
 * (`enabledByDefault`, `builtin`, `createdAt`, `updatedAt`) are **not**
 * folded into the frontmatter. Two options were open here (see
 * `docs/lots/L24-langgraph-agents-avances.md` task 4): extra frontmatter
 * keys (the parser already ignores keys it does not know), or a sidecar
 * meta file. This store picks the sidecar (`.meta.json`, next to
 * `SKILL.md`) **on purpose**: the whole point of this migration is
 * portability — a skill authored here should export as a clean `SKILL.md`
 * with nothing Cogenta-specific in it, and a `SKILL.md` imported here
 * should not have its author's own frontmatter fields overwritten by this
 * store's bookkeeping. Gluing `enabledByDefault`/`builtin`/timestamps into
 * the frontmatter would make every skill this store ever touches carry
 * Cogenta-only keys forever, defeating that.
 */

export interface AgentSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  /**
   * The exact `SKILL.md` text on disk (frontmatter + body), rendered by
   * `renderSkillFile` — what the admin's raw-Markdown editor (L24 task 4)
   * reads and writes, and what a "copy this skill out" action would hand
   * someone verbatim. Always the canonical rendering of `name`/`description`/
   * `instructions` below: this store has one source of truth (the structured
   * fields on `AgentSkillStore`'s contract, kept stable for its 11 existing
   * call sites), and `content` is a derived, always-consistent view of it —
   * never a second, independently-edited copy that could drift.
   */
  readonly content: string
  /**
   * "Par défaut, un nouvel agent hérite de tous les skills du site" (L22 task
   * 1bis) — a new agent's `AgentDeclaration.skills` is seeded with every
   * skill whose `enabledByDefault` is true at the moment it is created
   * (`agents/orchestrator.ts`'s creation path reads this), so the field stays
   * a plain inclusion list (contract C's own documented shape) while still
   * producing the lot's "inherit everything, exclude what you don't want"
   * behaviour from the admin's point of view.
   */
  readonly enabledByDefault: boolean
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AgentSkillInput {
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly enabledByDefault?: boolean
}

export type AgentSkillPatch = Partial<AgentSkillInput>

export interface AgentSkillStore {
  list(): Promise<readonly AgentSkill[]>
  get(id: string): Promise<AgentSkill | undefined>
  create(input: AgentSkillInput, builtin?: boolean): Promise<AgentSkill>
  update(id: string, patch: AgentSkillPatch): Promise<AgentSkill>
  /** Refuses to remove a builtin (`AGENT_SKILL_BUILTIN_UNDELETABLE`). */
  remove(id: string): Promise<void>
  /**
   * Every file under the skill's directory except `SKILL.md`/`.meta.json` —
   * `references/`, `scripts/`, `assets/`, and (for a skill imported from
   * outside this store, which never had to follow the standard layout) any
   * other file that happens to sit there too. Throws `AGENT_SKILL_UNKNOWN`
   * for an unknown id. A skill created before this fiche, with no
   * sub-folders yet, returns an empty list — never an error.
   */
  listResources(id: string): Promise<readonly SkillResource[]>
  /**
   * Writes (or overwrites) a reference file. `relativePath` must start with
   * one of `SKILL_RESOURCE_DIRS` — anything else, or a path that tries to
   * escape the skill's own directory, is refused with
   * `AGENT_SKILL_RESOURCE_INVALID`. Throws `AGENT_SKILL_UNKNOWN` for an
   * unknown skill id.
   */
  addResource(
    id: string,
    relativePath: string,
    content: string | Uint8Array,
  ): Promise<SkillResource>
  /**
   * Throws `AGENT_SKILL_RESOURCE_INVALID` for a path outside the three
   * standard folders, `AGENT_SKILL_RESOURCE_UNKNOWN` for a path that names
   * no file, and `AGENT_SKILL_UNKNOWN` for an unknown skill id.
   */
  removeResource(id: string, relativePath: string): Promise<void>
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return slug.length > 0 ? slug : 'skill'
}

function skillUnknown(id: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_SKILL_UNKNOWN',
    message: `No skill with id "${id}".`,
    hint: 'Check the id against `list()`, or create it first.',
  })
}

function resourcePathInvalid(relativePath: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_SKILL_RESOURCE_INVALID',
    message: `"${relativePath}" is not a valid resource path.`,
    hint: `A resource path must be "<folder>/<file>" where <folder> is one of: ${SKILL_RESOURCE_DIRS.join(', ')}.`,
  })
}

function resourceUnknown(id: string, relativePath: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_SKILL_RESOURCE_UNKNOWN',
    message: `No resource "${relativePath}" on skill "${id}".`,
    hint: 'Check the path against `listResources()`.',
  })
}

/**
 * Validates and normalises a caller-supplied resource path into the segments
 * `join()` should use. Refuses anything that is not "<one of the three
 * standard dirs>/<at least one more segment>" — no bare dir, no `.`/`..`
 * segment (which is what actually matters: it is what would let a caller
 * escape the skill's own directory; the standard-dir prefix check on its own
 * would not catch `references/../../../etc/passwd`).
 */
function resourceSegments(relativePath: string): string[] {
  const normalised = relativePath.replaceAll('\\', '/').trim()
  const segments = normalised.split('/').filter((segment) => segment.length > 0)
  const [first, ...rest] = segments
  if (first === undefined || rest.length === 0) throw resourcePathInvalid(relativePath)
  if (!(SKILL_RESOURCE_DIRS as readonly string[]).includes(first)) {
    throw resourcePathInvalid(relativePath)
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw resourcePathInvalid(relativePath)
  }
  return segments
}

interface StoredMeta {
  readonly enabledByDefault: boolean
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface FileAgentSkillStoreOptions {
  readonly dir: string
  readonly now?: () => Date
}

export function createFileAgentSkillStore(options: FileAgentSkillStoreOptions): AgentSkillStore {
  const now = options.now ?? ((): Date => new Date())
  const ready = mkdir(options.dir, { recursive: true })

  function dirFor(id: string): string {
    return join(options.dir, id)
  }

  function skillFileFor(id: string): string {
    return join(dirFor(id), SKILL_FILE)
  }

  function metaFileFor(id: string): string {
    return join(dirFor(id), META_FILE)
  }

  /**
   * Reads a skill without ever failing on a missing `.meta.json` — a folder
   * dropped in by hand (a `SKILL.md` copied straight from `.claude/skills/`,
   * exactly what L24 task 4's acceptance test does) is a perfectly good
   * skill, just one this store has never seen before; it gets the same
   * defaults `create()` would give a new one, and a `.meta.json` is written
   * back the next time it is updated. A `.meta.json` that exists but will
   * not parse *is* treated as corruption, and reported as such.
   */
  async function readMeta(id: string): Promise<StoredMeta> {
    try {
      const raw = await readFile(metaFileFor(id), 'utf8')
      return JSON.parse(raw) as StoredMeta
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const at = now().toISOString()
        return { enabledByDefault: true, builtin: false, createdAt: at, updatedAt: at }
      }
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read metadata for skill "${id}".`,
        hint: 'The .meta.json file may be corrupted; consider removing and recreating the skill.',
        cause: error,
      })
    }
  }

  async function readRecord(id: string): Promise<AgentSkill | null> {
    let raw: string
    try {
      raw = await readFile(skillFileFor(id), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read skill record "${id}".`,
        hint: 'The file may be corrupted; consider removing it.',
        cause: error,
      })
    }
    const { metadata, instructions } = parseSkillFile(skillFileFor(id), raw)
    const meta = await readMeta(id)
    return {
      id,
      name: metadata.name,
      description: metadata.description,
      instructions,
      content: raw,
      enabledByDefault: meta.enabledByDefault,
      builtin: meta.builtin,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    }
  }

  async function writeRecord(
    id: string,
    metadata: SkillMetadata,
    instructions: string,
    meta: StoredMeta,
  ): Promise<AgentSkill> {
    await mkdir(dirFor(id), { recursive: true })
    const content = renderSkillFile(metadata, instructions)
    await writeFile(skillFileFor(id), content, 'utf8')
    await writeFile(metaFileFor(id), JSON.stringify(meta, null, 2), 'utf8')
    return {
      id,
      name: metadata.name,
      description: metadata.description,
      instructions: instructions.trim(),
      content,
      ...meta,
    }
  }

  return {
    async list() {
      await ready
      const entries = await readdir(options.dir, { withFileTypes: true }).catch(() => [])
      const skills: AgentSkill[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          const record = await readRecord(entry.name)
          if (record !== null) skills.push(record)
        } catch {
          // A folder without a valid SKILL.md (or with a corrupted sidecar)
          // is not a skill this store can serve — skip it rather than fail
          // the whole listing, same posture as the marketplace's
          // `file-store.ts`.
        }
      }
      return skills.sort((a, b) => a.name.localeCompare(b.name))
    },

    async get(id) {
      await ready
      const record = await readRecord(id)
      return record ?? undefined
    },

    async create(input, builtin = false) {
      await ready
      const id = slugify(input.name)
      const existing = await readRecord(id)
      if (existing !== null) {
        throw new CogentaError({
          code: 'AGENT_SKILL_DUPLICATE',
          message: `A skill named "${input.name}" already exists.`,
          hint: 'Choose a different name, or edit the existing skill instead.',
        })
      }
      const at = now().toISOString()
      const created = await writeRecord(
        id,
        { name: input.name, description: input.description },
        input.instructions,
        {
          enabledByDefault: input.enabledByDefault ?? true,
          builtin,
          createdAt: at,
          updatedAt: at,
        },
      )
      // Standard reference-folder layout (fiche 57 task 1) — created empty,
      // alongside SKILL.md/.meta.json, so the admin's "Reference files"
      // section always has somewhere real to upload into.
      await Promise.all(
        SKILL_RESOURCE_DIRS.map((resourceDir) =>
          mkdir(join(dirFor(id), resourceDir), { recursive: true }),
        ),
      )
      return created
    },

    async update(id, patch) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw skillUnknown(id)
      return writeRecord(
        id,
        {
          name: patch.name ?? existing.name,
          description: patch.description ?? existing.description,
        },
        patch.instructions ?? existing.instructions,
        {
          enabledByDefault: patch.enabledByDefault ?? existing.enabledByDefault,
          builtin: existing.builtin,
          createdAt: existing.createdAt,
          updatedAt: now().toISOString(),
        },
      )
    },

    async remove(id) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw skillUnknown(id)
      if (existing.builtin) {
        throw new CogentaError({
          code: 'AGENT_SKILL_BUILTIN_UNDELETABLE',
          message: `"${existing.name}" is a built-in skill and cannot be removed.`,
          hint: 'Edit its instructions instead, or exclude it from a specific agent.',
        })
      }
      await rm(dirFor(id), { recursive: true, force: true })
    },

    async listResources(id) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw skillUnknown(id)
      const skillDir = dirFor(id)
      const entries = await readdir(skillDir, { withFileTypes: true, recursive: true }).catch(
        () => [],
      )
      const resources: SkillResource[] = []
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const absolute = join(entry.parentPath, entry.name)
        const relativePath = relative(skillDir, absolute).replaceAll('\\', '/')
        if (relativePath === SKILL_FILE || relativePath === META_FILE) continue
        const info = await stat(absolute)
        resources.push({ path: relativePath, size: info.size, updatedAt: info.mtime.toISOString() })
      }
      return resources.sort((a, b) => a.path.localeCompare(b.path))
    },

    async addResource(id, relativePath, content) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw skillUnknown(id)
      const segments = resourceSegments(relativePath)
      const target = join(dirFor(id), ...segments)
      await mkdir(dirname(target), { recursive: true })
      if (typeof content === 'string') {
        await writeFile(target, content, 'utf8')
      } else {
        await writeFile(target, content)
      }
      const info = await stat(target)
      return { path: segments.join('/'), size: info.size, updatedAt: info.mtime.toISOString() }
    },

    async removeResource(id, relativePath) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw skillUnknown(id)
      const segments = resourceSegments(relativePath)
      const target = join(dirFor(id), ...segments)
      try {
        await rm(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw resourceUnknown(id, relativePath)
        }
        throw error
      }
    },
  }
}

/** L22 task 1bis: "au minimum ces trois" — content writing, a basic security review, and site-structure/menu management. */
export function builtinAgentSkillSeeds(): readonly AgentSkillInput[] {
  return [
    {
      name: 'Content writing',
      description: 'How to write and edit site content in this CMS’s voice.',
      instructions: [
        'Write in clear, concise prose. Prefer short paragraphs and active voice.',
        'Match the tone already used by the site’s existing published content when you can see it.',
        'Never invent facts about the site, its products, or its people — if you do not know, say so or ask.',
        'When proposing a draft, give it a real title and, where the collection has one, a short excerpt.',
      ].join('\n'),
      enabledByDefault: true,
    },
    {
      name: 'Basic security review',
      description: 'How to read a dependency scan and report findings without alarmism.',
      instructions: [
        'When reviewing deps.scan output, group findings by package and explain in one line why an unpinned version is a risk (the next install can silently change behaviour).',
        'Never claim a specific vulnerability exists unless a tool result actually named one.',
        'Recommend pinning to the currently installed version as the safest default fix.',
      ].join('\n'),
      enabledByDefault: true,
    },
    {
      name: 'Site structure and menus',
      description: 'How to reason about this site’s navigation and information architecture.',
      instructions: [
        'Before proposing a menu or structure change, read the site’s current collections and their routes.',
        'Keep navigation shallow — prefer two levels over three where the content allows it.',
        'Never remove an existing menu entry without saying so explicitly in your summary.',
      ].join('\n'),
      enabledByDefault: true,
    },
  ]
}

export async function ensureBuiltinAgentSkills(store: AgentSkillStore): Promise<void> {
  const existing = await store.list()
  const byName = new Set(existing.map((skill) => skill.name))
  for (const seed of builtinAgentSkillSeeds()) {
    if (!byName.has(seed.name)) await store.create(seed, true)
  }
}
