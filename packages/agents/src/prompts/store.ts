import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import type {
  PromptTemplate,
  PromptTemplateInput,
  PromptTemplatePatch,
  PromptTemplateStore,
} from './types.js'

/**
 * One JSON file per template under `options.dir` — the same "real but
 * local" tier `agents/store.ts` and (pre-L24) `skills/library.ts` already
 * use (R1). Unlike `AgentSkillStore` (which persists a portable `SKILL.md`
 * because a skill is meant to travel between agents), a prompt template has
 * no portable format anyone else defines — it is Cogenta-specific data with
 * a `category`/`builtin` this store owns outright, so plain JSON is the
 * honest choice rather than inventing a frontmatter format nobody else reads.
 */

const FILE_SUFFIX = '.json'

/** Every Unicode combining mark — what NFKD decomposition splits an accented letter into. */
const COMBINING_DIACRITICS = /\p{Mn}/gu

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return slug.length > 0 ? slug : 'prompt'
}

function templateUnknown(id: string): CogentaError {
  return new CogentaError({
    code: 'PROMPT_TEMPLATE_UNKNOWN',
    message: `No prompt template with id "${id}".`,
    hint: 'Check the id against `list()`, or create it first.',
  })
}

interface StoredRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly template: string
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface FilePromptTemplateStoreOptions {
  readonly dir: string
  readonly now?: () => Date
}

export function createFilePromptTemplateStore(
  options: FilePromptTemplateStoreOptions,
): PromptTemplateStore {
  const now = options.now ?? ((): Date => new Date())
  const ready = mkdir(options.dir, { recursive: true })

  function fileFor(id: string): string {
    return join(options.dir, `${id}${FILE_SUFFIX}`)
  }

  async function readRecord(id: string): Promise<PromptTemplate | null> {
    let raw: string
    try {
      raw = await readFile(fileFor(id), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read prompt template "${id}".`,
        hint: 'The file may be corrupted; consider removing it.',
        cause: error,
      })
    }
    let parsed: StoredRecord
    try {
      parsed = JSON.parse(raw) as StoredRecord
    } catch (error) {
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not parse prompt template "${id}".`,
        hint: 'The file is not valid JSON; consider removing it.',
        cause: error,
      })
    }
    return parsed
  }

  async function writeRecord(record: StoredRecord): Promise<PromptTemplate> {
    await writeFile(fileFor(record.id), JSON.stringify(record, null, 2), 'utf8')
    return record
  }

  return {
    async list() {
      await ready
      const entries = await readdir(options.dir, { withFileTypes: true }).catch(() => [])
      const templates: PromptTemplate[] = []
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(FILE_SUFFIX)) continue
        const id = entry.name.slice(0, -FILE_SUFFIX.length)
        try {
          const record = await readRecord(id)
          if (record !== null) templates.push(record)
        } catch {
          // A corrupted file is not a template this store can serve — skip
          // it rather than fail the whole listing (same posture as the
          // agent-skill and marketplace file stores).
        }
      }
      return templates.sort((a, b) => a.name.localeCompare(b.name))
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
          code: 'PROMPT_TEMPLATE_DUPLICATE',
          message: `A prompt template named "${input.name}" already exists.`,
          hint: 'Choose a different name, or edit the existing template instead.',
        })
      }
      const at = now().toISOString()
      return writeRecord({
        id,
        name: input.name,
        description: input.description,
        category: input.category,
        template: input.template,
        builtin,
        createdAt: at,
        updatedAt: at,
      })
    },

    async update(id, patch: PromptTemplatePatch) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw templateUnknown(id)
      return writeRecord({
        id,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        category: patch.category ?? existing.category,
        template: patch.template ?? existing.template,
        builtin: existing.builtin,
        createdAt: existing.createdAt,
        updatedAt: now().toISOString(),
      })
    },

    async remove(id) {
      await ready
      const existing = await readRecord(id)
      if (existing === null) throw templateUnknown(id)
      if (existing.builtin) {
        throw new CogentaError({
          code: 'PROMPT_TEMPLATE_BUILTIN_UNDELETABLE',
          message: `"${existing.name}" is a built-in prompt template and cannot be removed.`,
          hint: 'Edit its text instead — a builtin can always be edited, only never deleted.',
        })
      }
      await rm(fileFor(id), { force: true })
    },
  }
}

export type { PromptTemplate, PromptTemplateInput, PromptTemplatePatch, PromptTemplateStore }
