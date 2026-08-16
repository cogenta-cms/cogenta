import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import type { PlanDecisions } from './approval.js'
import type { SitePlanDraft } from './types.js'

/**
 * Where a proposed plan waits for its human.
 *
 * Two implementations, neither needing a service (R1): in memory, and on
 * disk under the site's own `.cogenta/` directory. Deliberately not a
 * database table — a draft outlives no migration, belongs to no collection,
 * and the one place it has to be readable from is a site directory that may
 * not have run its migrations yet (the installer writes one before
 * `cogenta migrate up` has ever run). `@cogenta/agents` already stores
 * memories, traces and skills this way, for the same reason.
 *
 * A stored draft carries the decisions taken on it so far, which is what
 * makes "the installer proposed, the admin decides later" possible: L19's
 * `--yes` clause says a non-interactive run may leave a draft waiting to be
 * validated on first admin launch, never a site published without review.
 */

export interface StoredSitePlan {
  readonly draft: SitePlanDraft
  /** Empty until a human starts deciding. Never pre-filled — an undecided item must stay undecided. */
  readonly decisions: PlanDecisions
  /** Set once the plan has been resolved and applied by a caller. A draft is applied at most once. */
  readonly appliedAt?: string
}

export interface SitePlanStore {
  save(draft: SitePlanDraft): Promise<StoredSitePlan>
  get(id: string): Promise<StoredSitePlan>
  list(): Promise<readonly StoredSitePlan[]>
  /** Merges into whatever was already decided, so a review can be done in several sittings. */
  recordDecisions(id: string, decisions: PlanDecisions): Promise<StoredSitePlan>
  markApplied(id: string, at: string): Promise<StoredSitePlan>
  delete(id: string): Promise<void>
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'SITE_PLAN_DRAFT_NOT_FOUND',
    message: `No site plan draft with id "${id}".`,
    hint: 'List the drafts to see which ones are waiting for review — a draft may have been applied and deleted already.',
    details: { id },
  })
}

export function createMemorySitePlanStore(): SitePlanStore {
  const drafts = new Map<string, StoredSitePlan>()

  const mustGet = (id: string): StoredSitePlan => {
    const stored = drafts.get(id)
    if (stored === undefined) throw notFound(id)
    return stored
  }

  return {
    async save(draft) {
      const stored: StoredSitePlan = { draft, decisions: {} }
      drafts.set(draft.id, stored)
      return stored
    },
    async get(id) {
      return mustGet(id)
    },
    async list() {
      return [...drafts.values()].sort((a, b) => b.draft.createdAt.localeCompare(a.draft.createdAt))
    },
    async recordDecisions(id, decisions) {
      const stored = mustGet(id)
      const next: StoredSitePlan = {
        ...stored,
        decisions: { ...stored.decisions, ...decisions },
      }
      drafts.set(id, next)
      return next
    },
    async markApplied(id, at) {
      const stored = mustGet(id)
      const next: StoredSitePlan = { ...stored, appliedAt: at }
      drafts.set(id, next)
      return next
    },
    async delete(id) {
      drafts.delete(id)
    },
  }
}

const FILE_SUFFIX = '.plan.json'

/** Refuses an id that could escape the directory — a draft id comes from a URL in the admin. */
function fileFor(directory: string, id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new CogentaError({
      code: 'SITE_PLAN_DRAFT_NOT_FOUND',
      message: `"${id}" is not a valid site plan draft id.`,
      hint: 'A draft id is letters, digits, hyphens and underscores only.',
      details: { id },
    })
  }
  return join(directory, `${id}${FILE_SUFFIX}`)
}

export function createFileSitePlanStore(directory: string): SitePlanStore {
  const read = async (id: string): Promise<StoredSitePlan> => {
    let raw: string
    try {
      raw = await readFile(fileFor(directory, id), 'utf8')
    } catch {
      throw notFound(id)
    }
    return JSON.parse(raw) as StoredSitePlan
  }

  const write = async (stored: StoredSitePlan): Promise<StoredSitePlan> => {
    await mkdir(directory, { recursive: true })
    await writeFile(
      fileFor(directory, stored.draft.id),
      `${JSON.stringify(stored, null, 2)}\n`,
      'utf8',
    )
    return stored
  }

  return {
    async save(draft) {
      return write({ draft, decisions: {} })
    },
    get: read,
    async list() {
      let names: string[]
      try {
        names = await readdir(directory)
      } catch {
        return []
      }
      const stored = await Promise.all(
        names
          .filter((name) => name.endsWith(FILE_SUFFIX))
          .map((name) => read(name.slice(0, -FILE_SUFFIX.length))),
      )
      return stored.sort((a, b) => b.draft.createdAt.localeCompare(a.draft.createdAt))
    },
    async recordDecisions(id, decisions) {
      const stored = await read(id)
      return write({ ...stored, decisions: { ...stored.decisions, ...decisions } })
    },
    async markApplied(id, at) {
      const stored = await read(id)
      return write({ ...stored, appliedAt: at })
    },
    async delete(id) {
      try {
        await unlink(fileFor(directory, id))
      } catch {
        // Already gone: deleting a draft twice is not an error.
      }
    },
  }
}
