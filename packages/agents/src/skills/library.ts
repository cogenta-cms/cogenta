import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'

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
 * Stored the same "one JSON file per record" way every other file store in
 * this package already does (R1) — the lot's own text names this as an
 * acceptable choice ("le store de contenu, ou le store de réglages
 * génériques... pas de nouvelle mécanique de stockage" if a generic one
 * already fits; this package has no content store of its own to reuse, so
 * it reuses its *own* already-established generic mechanism instead of
 * reaching into `@cogenta/schema` for one).
 */

export interface AgentSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
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

export interface FileAgentSkillStoreOptions {
  readonly dir: string
  readonly now?: () => Date
}

export function createFileAgentSkillStore(options: FileAgentSkillStoreOptions): AgentSkillStore {
  const now = options.now ?? ((): Date => new Date())
  const ready = mkdir(options.dir, { recursive: true })

  function fileFor(id: string): string {
    return join(options.dir, `${id}.json`)
  }

  async function readRecord(id: string): Promise<AgentSkill | null> {
    try {
      const raw = await readFile(fileFor(id), 'utf8')
      return JSON.parse(raw) as AgentSkill
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read skill record "${id}".`,
        hint: 'The file may be corrupted; consider removing it.',
        cause: error,
      })
    }
  }

  return {
    async list() {
      await ready
      const filenames = await readdir(options.dir, { withFileTypes: true }).catch(() => [])
      const skills: AgentSkill[] = []
      for (const entry of filenames) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const record = await readRecord(entry.name.replace(/\.json$/u, ''))
        if (record !== null) skills.push(record)
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
      const record: AgentSkill = {
        id,
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        enabledByDefault: input.enabledByDefault ?? true,
        builtin,
        createdAt: at,
        updatedAt: at,
      }
      await writeFile(fileFor(id), JSON.stringify(record, null, 2), 'utf8')
      return record
    },

    async update(id, patch) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw skillUnknown(id)
      const updated: AgentSkill = {
        ...existing,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        instructions: patch.instructions ?? existing.instructions,
        enabledByDefault: patch.enabledByDefault ?? existing.enabledByDefault,
        updatedAt: now().toISOString(),
      }
      await writeFile(fileFor(id), JSON.stringify(updated, null, 2), 'utf8')
      return updated
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
      await rm(fileFor(id), { force: true })
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
