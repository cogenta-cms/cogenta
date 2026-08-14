/**
 * `docs/02-architecture.md` §4.6, four types:
 *
 * | Type        | Contenu                    | Portée        | Rétention    |
 * |-------------|-----------------------------|---------------|--------------|
 * | working     | The run in progress         | Run           | Ephemeral    |
 * | episodic    | Dated log of actions        | Agent or site | Configurable |
 * | semantic    | Stable facts about the site | Site          | Consolidated |
 * | procedural  | What has worked              | Agent         | Consolidated |
 *
 * `working` is deliberately never given special handling by `MemoryStore` —
 * its "ephemeral, run-scoped" retention is just `runAgentLoop`'s own
 * `messages`/`RunResult`, never written here at all. It appears in the type
 * only so a caller that does choose to persist a working-memory snapshot
 * (e.g. for debugging) can tag it correctly; nothing in this module treats
 * it differently from the other three.
 */
export type MemoryType = 'working' | 'episodic' | 'semantic' | 'procedural'

export interface MemoryRecord {
  readonly id: string
  readonly type: MemoryType
  /** Isolation boundary — a query always names one, and a store must never let one site's records answer another's query (R1's sibling rule for this module: never shared between two sites, checked by test). */
  readonly siteId: string
  /** Present for `episodic` (when scoped to one agent rather than the whole site) and `procedural`; absent for `semantic`, which is site-wide by definition. */
  readonly agentName?: string
  readonly content: string
  readonly createdAt: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface MemoryQuery {
  readonly siteId: string
  readonly type?: MemoryType
  readonly agentName?: string
  /** Most recent first; caps how many `query` returns (default implementation-defined, but never unbounded). */
  readonly limit?: number
}

export interface MemoryPruneQuery {
  readonly siteId: string
  readonly olderThanMs: number
  readonly type?: MemoryType
}

export interface MemoryConsolidateQuery {
  readonly siteId: string
  readonly type: MemoryType
  readonly agentName?: string
  /** How many of the newest matching records to keep — every older one in scope is removed. */
  readonly keep: number
}

/**
 * The forgetting policy the design doc requires ("une mémoire qui ne fait
 * que croître devient du bruit coûteux") is these two mechanical halves:
 * `prune` (age-based) and `consolidate` (count-based, "keep the newest N").
 * Turning many kept records into fewer, better ones by actually reading and
 * summarising them is a judgement call for the agent that owns them — a
 * normal `save()` of a new `semantic`/`procedural` record after the agent
 * has done that thinking, not something this store can do on its own
 * (same reasoning `diffValues`, task 10, documents for its own limits).
 */
export interface MemoryStore {
  save(record: MemoryRecord): Promise<void>
  query(query: MemoryQuery): Promise<readonly MemoryRecord[]>
  /** A no-op when `id` does not exist — forgetting something already gone is not an error. */
  forget(id: string): Promise<void>
  prune(query: MemoryPruneQuery, now?: () => number): Promise<number>
  consolidate(query: MemoryConsolidateQuery): Promise<number>
}
