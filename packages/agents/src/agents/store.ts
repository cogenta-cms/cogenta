import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import type { AutonomyConfig } from '../autonomy/types.js'
import type { BudgetLimits } from '../budget/types.js'
import { parseIdentityMarkdown, renderIdentityMarkdown } from '../identity/markdown.js'
import type {
  AgentDeclaration,
  AgentMemoryConfig,
  AgentModelPreference,
  AgentTrigger,
} from './types.js'

/**
 * L22 task 1's real gap, per the lot: `AgentRegistry` only ever wraps a
 * fixed, in-memory array of `AgentDeclaration`s — nothing persists a
 * create/edit/delete. This module is that persistence layer, one JSON file
 * per agent under `options.dir` (the same "real but local, no external
 * service" tier `memory/file-store.ts` and `skills/file-store.ts` already
 * use — R1). `agents/orchestrator.ts` reads this store to build the live
 * `AgentRegistry` a site actually runs; `@cogenta/cli`'s `serve.ts` is the
 * only caller that reloads it after a write, since this file has no
 * subscription mechanism of its own.
 */

export interface StoredAgentIdentity {
  readonly role: string
  readonly objectives: readonly string[]
  readonly style?: string
  /** Fiche 55 task 1 — extra standing instructions, distinct from `style`. See `identity/markdown.ts`. */
  readonly systemPrompt?: string
}

/** The full, persisted shape of one agent — `AgentDeclaration` plus the fields only the store (not contract C) needs to track. */
export interface StoredAgent extends AgentDeclaration {
  readonly id: string
  readonly enabled: boolean
  /**
   * `true` for the superagent and the two seeded built-ins (`builtinAgentSeeds`).
   * A builtin can be freely edited (identity, tools, autonomy, budget,
   * skills, triggers — "livré comme modèle éditable, pas une fonctionnalité
   * figée") but never removed, so the admin's "Agents" screen always has at
   * least these three rows.
   */
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** What a caller supplies to create or update an agent — `identity` is structured here (the store renders/parses the markdown file `AgentDeclaration.identity` points at). */
export interface AgentDeclarationInput {
  readonly name: string
  readonly identity: StoredAgentIdentity
  readonly model: AgentModelPreference
  readonly tools: readonly string[]
  readonly skills?: readonly string[]
  readonly subagents?: readonly string[]
  readonly autonomy?: AutonomyConfig
  readonly budget?: BudgetLimits
  readonly memory?: AgentMemoryConfig
  readonly triggers?: readonly AgentTrigger[]
  readonly enabled?: boolean
}

export type AgentDeclarationPatch = Partial<Omit<AgentDeclarationInput, 'name'>>

export interface AgentDeclarationStore {
  list(): Promise<readonly StoredAgent[]>
  get(name: string): Promise<StoredAgent | undefined>
  /** Refuses a duplicate `name` (`AGENT_DUPLICATE`). */
  create(input: AgentDeclarationInput, builtin?: boolean): Promise<StoredAgent>
  /** Refuses an unknown `name` (`AGENT_UNKNOWN`). */
  update(name: string, patch: AgentDeclarationPatch): Promise<StoredAgent>
  setEnabled(name: string, enabled: boolean): Promise<StoredAgent>
  /** Refuses to remove a builtin (`AGENT_BUILTIN_UNDELETABLE`) — disable it instead. */
  remove(name: string): Promise<void>
  /** Reads back the structured identity a `StoredAgent.identity` path was rendered from — round-trips `renderIdentityMarkdown`/`parseIdentityMarkdown` for the admin's edit form. */
  readIdentity(name: string): Promise<StoredAgentIdentity>
}

const COMBINING_DIACRITICS = /[\u0300-\u036f]/gu

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return slug.length > 0 ? slug : 'agent'
}

function agentUnknown(name: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_UNKNOWN',
    message: `No agent named "${name}" is registered.`,
    hint: 'Check the name against `list()`, or create it first.',
  })
}

export interface FileAgentDeclarationStoreOptions {
  readonly dir: string
  readonly now?: () => Date
}

/** One `<slug>.json` record plus one `identities/<slug>.md` file per agent, under `options.dir`. */
export function createFileAgentDeclarationStore(
  options: FileAgentDeclarationStoreOptions,
): AgentDeclarationStore {
  const now = options.now ?? ((): Date => new Date())
  const identitiesDir = join(options.dir, 'identities')
  const ready = Promise.all([
    mkdir(options.dir, { recursive: true }),
    mkdir(identitiesDir, { recursive: true }),
  ])

  function recordFile(slug: string): string {
    return join(options.dir, `${slug}.json`)
  }
  function identityFile(slug: string): string {
    return join(identitiesDir, `${slug}.md`)
  }
  function slugOf(name: string): string {
    return slugify(name)
  }

  async function readRecord(slug: string): Promise<StoredAgent | null> {
    try {
      const raw = await readFile(recordFile(slug), 'utf8')
      return JSON.parse(raw) as StoredAgent
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read agent record "${slug}".`,
        hint: 'The file may be corrupted; consider removing it.',
        cause: error,
      })
    }
  }

  async function readAll(): Promise<StoredAgent[]> {
    const filenames = await readdir(options.dir, { withFileTypes: true }).catch(() => [])
    const agents: StoredAgent[] = []
    for (const entry of filenames) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const record = await readRecord(entry.name.replace(/\.json$/u, ''))
      if (record !== null) agents.push(record)
    }
    return agents.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function writeIdentity(
    slug: string,
    name: string,
    identity: StoredAgentIdentity,
  ): Promise<string> {
    const path = identityFile(slug)
    await writeFile(path, renderIdentityMarkdown(name, identity), 'utf8')
    return path
  }

  async function findBySlug(slug: string): Promise<StoredAgent | undefined> {
    const record = await readRecord(slug)
    return record ?? undefined
  }

  return {
    async list() {
      await ready
      return readAll()
    },

    async get(name) {
      await ready
      return findBySlug(slugOf(name))
    },

    async create(input, builtin = false) {
      await ready
      const slug = slugOf(input.name)
      const existing = await findBySlug(slug)
      if (existing !== undefined) {
        throw new CogentaError({
          code: 'AGENT_DUPLICATE',
          message: `An agent named "${input.name}" already exists.`,
          hint: 'Choose a different name, or edit the existing agent instead.',
        })
      }
      const identityPath = await writeIdentity(slug, input.name, input.identity)
      const at = now().toISOString()
      const record: StoredAgent = {
        id: slug,
        name: input.name,
        identity: identityPath,
        model: input.model,
        tools: input.tools,
        ...(input.skills === undefined ? {} : { skills: input.skills }),
        ...(input.subagents === undefined ? {} : { subagents: input.subagents }),
        ...(input.autonomy === undefined ? {} : { autonomy: input.autonomy }),
        ...(input.budget === undefined ? {} : { budget: input.budget }),
        ...(input.memory === undefined ? {} : { memory: input.memory }),
        ...(input.triggers === undefined ? {} : { triggers: input.triggers }),
        enabled: input.enabled ?? true,
        builtin,
        createdAt: at,
        updatedAt: at,
      }
      await writeFile(recordFile(slug), JSON.stringify(record, null, 2), 'utf8')
      return record
    },

    async update(name, patch) {
      await ready
      const slug = slugOf(name)
      const existing = await findBySlug(slug)
      if (existing === undefined) throw agentUnknown(name)

      const identityPath =
        patch.identity === undefined
          ? existing.identity
          : await writeIdentity(slug, existing.name, patch.identity)

      const updated: StoredAgent = {
        ...existing,
        identity: identityPath,
        model: patch.model ?? existing.model,
        tools: patch.tools ?? existing.tools,
        ...(patch.skills !== undefined
          ? { skills: patch.skills }
          : existing.skills === undefined
            ? {}
            : { skills: existing.skills }),
        ...(patch.subagents !== undefined
          ? { subagents: patch.subagents }
          : existing.subagents === undefined
            ? {}
            : { subagents: existing.subagents }),
        ...(patch.autonomy !== undefined
          ? { autonomy: patch.autonomy }
          : existing.autonomy === undefined
            ? {}
            : { autonomy: existing.autonomy }),
        ...(patch.budget !== undefined
          ? { budget: patch.budget }
          : existing.budget === undefined
            ? {}
            : { budget: existing.budget }),
        ...(patch.memory !== undefined
          ? { memory: patch.memory }
          : existing.memory === undefined
            ? {}
            : { memory: existing.memory }),
        ...(patch.triggers !== undefined
          ? { triggers: patch.triggers }
          : existing.triggers === undefined
            ? {}
            : { triggers: existing.triggers }),
        enabled: patch.enabled ?? existing.enabled,
        updatedAt: now().toISOString(),
      }
      await writeFile(recordFile(slug), JSON.stringify(updated, null, 2), 'utf8')
      return updated
    },

    async setEnabled(name, enabled) {
      await ready
      const slug = slugOf(name)
      const existing = await findBySlug(slug)
      if (existing === undefined) throw agentUnknown(name)
      const updated: StoredAgent = { ...existing, enabled, updatedAt: now().toISOString() }
      await writeFile(recordFile(slug), JSON.stringify(updated, null, 2), 'utf8')
      return updated
    },

    async remove(name) {
      await ready
      const slug = slugOf(name)
      const existing = await findBySlug(slug)
      if (existing === undefined) throw agentUnknown(name)
      if (existing.builtin) {
        throw new CogentaError({
          code: 'AGENT_BUILTIN_UNDELETABLE',
          message: `"${name}" is a built-in agent and cannot be removed.`,
          hint: 'Disable it instead — a built-in stays editable but can be turned off.',
        })
      }
      await rm(recordFile(slug), { force: true })
      await rm(identityFile(slug), { force: true })
    },

    async readIdentity(name) {
      await ready
      const slug = slugOf(name)
      const existing = await findBySlug(slug)
      if (existing === undefined) throw agentUnknown(name)
      const raw = await readFile(identityFile(slug), 'utf8').catch(() => '')
      const parsed = parseIdentityMarkdown(existing.name, raw)
      return {
        role: parsed.role,
        objectives: parsed.objectives,
        ...(parsed.style === undefined ? {} : { style: parsed.style }),
        ...(parsed.systemPrompt === undefined ? {} : { systemPrompt: parsed.systemPrompt }),
      }
    },
  }
}
