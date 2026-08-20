import { randomUUID } from 'node:crypto'
import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import { createLogger, type Logger } from '../logger/index.js'
import type {
  EnqueueOptions,
  Job,
  JobHandler,
  JobId,
  JobState,
  JobStatus,
  ListJobsOptions,
  QueueConfig,
  QueueDriver,
  QueueDriverOptions,
} from './types.js'

/**
 * Only what this driver calls, described structurally.
 *
 * Importing bullmq's own types would put `bullmq` in the published type
 * declarations, and it is an *optional* peer: a site running the database queue
 * must not be asked to install it — nor to install `ioredis` behind it — just to
 * typecheck (rule R1).
 */
interface BullmqConnectionLike {
  readonly url: string
  readonly retryStrategy?: () => null
}

/**
 * The raw client bullmq keeps for its own connection. It is a documented escape
 * hatch on the Redis backend, and the only way to store the one thing bullmq has
 * no state for: a cancelled job.
 */
interface BullmqRedisLike {
  ping(): Promise<string>
  hset(key: string, field: string, value: string): Promise<number>
  hget(key: string, field: string): Promise<string | null>
}

interface BullmqBackendLike {
  readonly client: Promise<BullmqRedisLike>
}

interface BullmqAddOptionsLike {
  readonly jobId?: string
  readonly delay?: number
  readonly priority?: number
  readonly attempts?: number
  readonly backoff?: { readonly type: string; readonly delay: number }
}

interface BullmqJobLike {
  readonly id?: string | undefined
  readonly name: string
  readonly data: unknown
  readonly attemptsMade: number
  readonly failedReason?: string | undefined
  readonly timestamp: number
  readonly delay: number
  readonly opts: { readonly attempts?: number | undefined }
  getState(): Promise<string>
  moveToCompleted(returnValue: unknown, token: string, fetchNext?: boolean): Promise<unknown>
  moveToFailed(error: Error, token: string, fetchNext?: boolean): Promise<unknown>
  remove(): Promise<void>
  /** bullmq's own re-queue: moves a `failed` job back to `waiting` with a fresh attempt count. */
  retry(state?: 'failed' | 'completed'): Promise<void>
}

interface BullmqQueueLike {
  add(name: string, data: unknown, options?: BullmqAddOptionsLike): Promise<BullmqJobLike>
  getJob(id: string): Promise<BullmqJobLike | undefined>
  /** `types` is bullmq's own vocabulary: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'. */
  getJobs(types: readonly string[], start?: number, end?: number): Promise<BullmqJobLike[]>
  getBackend(): BullmqBackendLike
  close(): Promise<void>
}

interface BullmqWorkerLike {
  getNextJob(token: string, options?: { block?: boolean }): Promise<BullmqJobLike | undefined>
  startStalledCheckTimer(): Promise<void>
  close(force?: boolean): Promise<void>
}

interface BullmqQueueOptionsLike {
  readonly connection: BullmqConnectionLike
  readonly prefix?: string
}

interface BullmqWorkerOptionsLike extends BullmqQueueOptionsLike {
  readonly autorun: false
  readonly lockDuration: number
  readonly stalledInterval: number
  readonly skipLockRenewal: true
}

export interface BullmqModule {
  Queue: new (name: string, options: BullmqQueueOptionsLike) => BullmqQueueLike
  Worker: new (name: string, processor: null, options: BullmqWorkerOptionsLike) => BullmqWorkerLike
}

/**
 * Loads bullmq if the host application installed it. Absent is a normal
 * outcome, not an error: it is what makes a site without Redis fall back to the
 * database queue instead of failing to boot.
 */
export async function loadBullmqModule(): Promise<BullmqModule | null> {
  try {
    return (await import('bullmq')) as unknown as BullmqModule
  } catch {
    return null
  }
}

const DEFAULT_PREFIX = 'cogenta:queue'
const DEFAULT_LEASE_MS = 5 * 60 * 1000
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_BACKOFF_MS = 1000
const DEFAULT_STALLED_INTERVAL_MS = 30_000
const DEFAULT_MAX_ATTEMPTS = 3
const PROBE_TIMEOUT_MS = 3000

/** The name of the queue that exists only to hold a connection for `ping`. */
const CONTROL_QUEUE = '__cogenta_control'

/**
 * Cogenta says "higher priority runs first"; bullmq says "lower number runs
 * first", and reserves 0 for "no priority at all". Mapping onto a mid-range
 * origin keeps both signs of a Cogenta priority inside bullmq's 1..2097151
 * window, and keeps every job prioritised so ordering never depends on which
 * of the two internal lists a job landed in.
 */
const PRIORITY_ORIGIN = 1_048_576
const MAX_BULLMQ_PRIORITY = 2_097_151

function toBullmqPriority(priority: number): number {
  return Math.min(Math.max(PRIORITY_ORIGIN - Math.trunc(priority), 1), MAX_BULLMQ_PRIORITY)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A Cogenta job id carries the job name, because bullmq shards by queue and a
 * bare id says nothing about which queue to look in. The alternative — a second
 * index in Redis — is state that can drift from the jobs it describes.
 */
function encodeJobId(name: string, jobId: string): JobId {
  return `${name}:${jobId}`
}

function decodeJobId(id: JobId): { name: string; jobId: string } | null {
  const at = id.lastIndexOf(':')
  if (at <= 0) return null

  const jobId = id.slice(at + 1)
  if (!UUID.test(jobId)) return null

  return { name: id.slice(0, at), jobId }
}

function toJobStatus(state: string): JobStatus {
  switch (state) {
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'active':
      return 'running'
    // waiting, waiting-children, delayed, prioritized: all "not started yet".
    default:
      return 'pending'
  }
}

/** The inverse of `toJobStatus`, for `getJobs`'s type filter. `cancelled` has no bullmq state of its own — it lives only in the tombstone hash, so `list()` never asks bullmq for it directly. */
function fromJobStatus(status: JobStatus): string {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'running':
      return 'active'
    default:
      return 'waiting'
  }
}

/** The payload is wrapped so a bare `null`, string or number survives the trip. */
interface JobEnvelope {
  readonly payload: unknown
}

async function toJobState(job: BullmqJobLike): Promise<JobState> {
  const failedReason = job.failedReason
  return {
    id: encodeJobId(job.name, job.id ?? ''),
    name: job.name,
    status: toJobStatus(await job.getState()),
    attempt: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS,
    runAt: job.timestamp + job.delay,
    lastError: failedReason === undefined || failedReason === '' ? undefined : failedReason,
  }
}

export interface BullmqQueueOptions extends QueueDriverOptions {
  readonly module: BullmqModule
  readonly url: string
  /**
   * Namespace for every Redis key this driver writes. A Redis instance is often
   * shared; two Cogenta sites on one server must not drain each other's jobs.
   */
  readonly prefix?: string
  /** Base delay of the exponential retry backoff. */
  readonly backoffMs?: number
  /**
   * How often a worker looks for jobs whose owner died. bullmq needs two passes
   * separated by this interval before it returns such a job to the queue.
   */
  readonly stalledIntervalMs?: number
  readonly logger?: Logger
}

/**
 * The optimal job queue: Redis, driven through bullmq.
 *
 * Jobs are fetched by hand rather than by a bullmq `Worker` loop, because
 * `QueueDriver.tick()` is the contract both drivers answer to — a site on shared
 * hosting drives it from cron, and the same call has to mean the same thing
 * here. bullmq documents this as the manual-fetching pattern, and it keeps the
 * atomic claim (the L0 acceptance criterion) inside Redis where it belongs.
 */
export function createBullmqQueue(options: BullmqQueueOptions): QueueDriver {
  const { module, url } = options
  const now = options.now ?? Date.now
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const stalledInterval = options.stalledIntervalMs ?? DEFAULT_STALLED_INTERVAL_MS
  const logger = (options.logger ?? createLogger()).child({ component: 'queue' })

  const connection: BullmqConnectionLike = { url }
  const handlers = new Map<string, JobHandler<never>>()
  const queues = new Map<string, BullmqQueueLike>()
  const workers = new Map<string, BullmqWorkerLike>()

  /** Cancelled jobs, by id. bullmq has no cancelled state, so we keep our own. */
  const tombstoneKey = `${prefix}:cancelled`

  function queueFor(name: string): BullmqQueueLike {
    const existing = queues.get(name)
    if (existing !== undefined) return existing

    const created = new module.Queue(name, { connection, prefix })
    queues.set(name, created)
    return created
  }

  async function redis(): Promise<BullmqRedisLike> {
    return queueFor(CONTROL_QUEUE).getBackend().client
  }

  async function workerFor(name: string): Promise<BullmqWorkerLike> {
    const existing = workers.get(name)
    if (existing !== undefined) return existing

    const created = new module.Worker(name, null, {
      connection,
      prefix,
      autorun: false,
      lockDuration: leaseMs,
      stalledInterval,
      // Nothing renews a lock here: `tick` holds it for the duration of one
      // handler and then reports an outcome. A lock that outlives the process
      // is exactly what the stalled checker is for.
      skipLockRenewal: true,
    })
    workers.set(name, created)

    // Manual fetching does not start the stalled checker, and without it a job
    // whose worker was killed stays "active" forever — no other worker ever
    // gets it back.
    await created.startStalledCheckTimer()
    return created
  }

  async function runOne(job: BullmqJobLike, token: string): Promise<void> {
    const handler = handlers.get(job.name)
    const id = encodeJobId(job.name, job.id ?? '')
    const maxAttempts = job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS

    if (handler === undefined) {
      // Unreachable in practice: a worker only exists for a registered name.
      // Releasing the job is still better than holding a lock we cannot honour.
      await job.moveToFailed(new Error(`No handler for jobs named "${job.name}".`), token, false)
      return
    }

    const decoded: Job = {
      id,
      name: job.name,
      payload: (job.data as JobEnvelope).payload,
      // bullmq counts attempts that finished; this one is in flight.
      attempt: job.attemptsMade + 1,
      maxAttempts,
    }

    try {
      await handler(decoded as never)
      await job.moveToCompleted(null, token, false)
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      await job.moveToFailed(failure, token, false)

      const exhausted = decoded.attempt >= maxAttempts
      logger.warn(exhausted ? 'job failed for good' : 'job failed, will retry', {
        id,
        name: job.name,
        attempt: decoded.attempt,
        maxAttempts,
      })
    }
  }

  return {
    enqueue: async (enqueueOptions: EnqueueOptions): Promise<JobId> => {
      if (enqueueOptions.name.length === 0) {
        throw new CogentaError({
          code: 'QUEUE_FAILED',
          message: 'A job must have a name.',
          hint: 'The name is what routes the job to a handler registered with process().',
        })
      }

      const jobId = randomUUID()
      const delay = Math.max(0, (enqueueOptions.runAt ?? now()) - now())

      await queueFor(enqueueOptions.name).add(
        enqueueOptions.name,
        { payload: enqueueOptions.payload ?? null } satisfies JobEnvelope,
        {
          jobId,
          priority: toBullmqPriority(enqueueOptions.priority ?? 0),
          attempts: enqueueOptions.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: backoffMs },
          ...(delay > 0 ? { delay } : {}),
        },
      )

      return encodeJobId(enqueueOptions.name, jobId)
    },

    process: <TPayload>(name: string, handler: JobHandler<TPayload>): void => {
      if (handlers.has(name)) {
        throw new CogentaError({
          code: 'QUEUE_FAILED',
          message: `A handler is already registered for jobs named "${name}".`,
          hint: 'One handler per job name. Register a different name, or compose inside the existing handler.',
        })
      }
      handlers.set(name, handler as JobHandler<never>)
    },

    tick: async (): Promise<number> => {
      let handled = 0

      // Only names this process registered are fetched, so two workers with
      // different handlers each take their own work instead of locking jobs
      // they would have to put back.
      for (const name of handlers.keys()) {
        const worker = await workerFor(name)

        while (handled < batchSize) {
          // A fresh token per job: it is the lock's owner, and it has to be
          // presented again to report the outcome.
          const token = randomUUID()
          const job = await worker.getNextJob(token, { block: false })
          if (job === undefined || job === null) break

          handled += 1
          await runOne(job, token)
        }

        if (handled >= batchSize) break
      }

      return handled
    },

    cancel: async (id: JobId): Promise<void> => {
      const parsed = decodeJobId(id)
      if (parsed === null) return

      const job = await queueFor(parsed.name).getJob(parsed.jobId)
      if (job === undefined) return

      const state = toJobStatus(await job.getState())
      // A running job is left alone: cancelling it here would only lose track of
      // work that is still happening in another process.
      if (state !== 'pending') return

      const tombstone: JobState = {
        id,
        name: job.name,
        status: 'cancelled',
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS,
        runAt: job.timestamp + job.delay,
        lastError: undefined,
      }

      // Written before the removal: a crash between the two leaves a job that
      // reads as cancelled and is gone, never one that reads as alive and is not.
      const client = await redis()
      await client.hset(tombstoneKey, id, JSON.stringify(tombstone))
      await job.remove()
    },

    status: async (id: JobId): Promise<JobState | null> => {
      const parsed = decodeJobId(id)
      if (parsed === null) return null

      const client = await redis()
      const tombstone = await client.hget(tombstoneKey, id)
      if (tombstone !== null) return JSON.parse(tombstone) as JobState

      const job = await queueFor(parsed.name).getJob(parsed.jobId)
      if (job === undefined) return null

      return toJobState(job)
    },

    // Only names this driver has actually touched (processed or enqueued
    // through it) can be searched — bullmq shards jobs by queue name, and
    // there is no global "every name that ever existed" index to scan.
    // `cogenta serve` builds one long-lived driver per queue, so this
    // covers everything a real deployment enqueues.
    list: async (listOptions: ListJobsOptions = {}): Promise<readonly JobState[]> => {
      const names = new Set<string>([...handlers.keys(), ...queues.keys()])
      const types =
        listOptions.status === undefined
          ? (['waiting', 'delayed', 'active', 'completed', 'failed'] as const)
          : ([fromJobStatus(listOptions.status)] as const)

      const perQueue = await Promise.all(
        [...names].map((name) => queueFor(name).getJobs([...types], 0, 200)),
      )

      const states = await Promise.all(perQueue.flat().map((job) => toJobState(job)))

      states.sort((a, b) => b.runAt - a.runAt)
      return states.slice(0, listOptions.limit ?? 50)
    },

    retry: async (id: JobId): Promise<boolean> => {
      const parsed = decodeJobId(id)
      if (parsed === null) return false

      const job = await queueFor(parsed.name).getJob(parsed.jobId)
      if (job === undefined) return false
      if (toJobStatus(await job.getState()) !== 'failed') return false

      await job.retry('failed')
      return true
    },

    close: async (): Promise<void> => {
      handlers.clear()
      // Workers first: each holds a blocking connection, and closing the queues
      // underneath it turns a clean shutdown into a pile of connection errors.
      for (const worker of workers.values()) await worker.close()
      workers.clear()
      for (const queue of queues.values()) await queue.close()
      queues.clear()
    },
  }
}

/** Redis URLs carry a password. Nothing derived from one reaches an operator. */
function withoutUrl(message: string): string {
  return message.replace(/rediss?:\/\/\S+/gi, '<redis url>')
}

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis did not answer in time.')), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export interface BullmqQueueDriverOptions extends Omit<BullmqQueueOptions, 'module' | 'url'> {}

export function bullmqQueueDriver(
  options: BullmqQueueDriverOptions = {},
): Driver<QueueDriver, QueueConfig> {
  const prefix = options.prefix ?? DEFAULT_PREFIX
  let instance: QueueDriver | undefined
  let probe: BullmqQueueLike | undefined

  async function loadOrThrow(): Promise<BullmqModule> {
    const module = await loadBullmqModule()
    if (module === null) {
      throw new CogentaError({
        code: 'DRIVER_INIT_FAILED',
        message: 'The Redis queue driver needs the "bullmq" package.',
        hint: 'Run `pnpm add bullmq`, or leave queue.driver unset to use the database queue.',
      })
    }
    return module
  }

  return {
    name: 'bullmq',
    tier: 'optimal',

    // Does Redis actually answer? Not "is a URL configured?" — the difference is
    // what turns a graceful fallback into a startup crash.
    available: async (config) => {
      if (config.url === undefined) return false

      const module = await loadBullmqModule()
      if (module === null) return false

      // `retryStrategy` returning null tells ioredis to give up instead of
      // reconnecting forever, which is what makes an absent Redis answer "no"
      // rather than hang. The working connection keeps the default.
      const attempt = new module.Queue(CONTROL_QUEUE, {
        connection: { url: config.url, retryStrategy: () => null },
        prefix,
      })
      try {
        const client = await withDeadline(attempt.getBackend().client, PROBE_TIMEOUT_MS)
        await withDeadline(client.ping(), PROBE_TIMEOUT_MS)
        return true
      } catch {
        return false
      } finally {
        await attempt.close().catch(() => undefined)
      }
    },

    init: async (config) => {
      const module = await loadOrThrow()
      const { url } = config
      if (url === undefined) {
        throw new CogentaError({
          code: 'DRIVER_INIT_FAILED',
          message: 'The Redis queue driver needs a connection URL.',
          hint: 'Set queue.url (or REDIS_URL), or leave queue.driver unset to use the database queue.',
        })
      }

      probe ??= new module.Queue(CONTROL_QUEUE, { connection: { url }, prefix })
      instance ??= createBullmqQueue({ ...options, module, url })
      return instance
    },

    dispose: async () => {
      try {
        await instance?.close()
        await probe?.close()
      } catch {
        // Shutdown must not fail because the connection already dropped.
      }
      instance = undefined
      probe = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (probe === undefined) {
        return { status: 'down', driver: 'bullmq', tier: 'optimal', message: 'Not connected.' }
      }

      const startedAt = Date.now()
      try {
        const client = await withDeadline(probe.getBackend().client, PROBE_TIMEOUT_MS)
        await withDeadline(client.ping(), PROBE_TIMEOUT_MS)
        return {
          status: 'ok',
          driver: 'bullmq',
          tier: 'optimal',
          latencyMs: Date.now() - startedAt,
          // The URL is not reported: it routinely carries a password.
          message: 'Connected.',
        }
      } catch (error) {
        return {
          status: 'down',
          driver: 'bullmq',
          tier: 'optimal',
          message: withoutUrl(error instanceof Error ? error.message : 'Redis did not answer.'),
        }
      }
    },
  }
}
