import { randomUUID } from 'node:crypto'
import { chmod, link, lstat, mkdir, open, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError, type ErrorCode, newId } from '@cogenta/core'
import { z } from 'zod'
import type { ApprovalQueue, ApprovalRequest, ApprovalStatus } from './types.js'

export interface FileApprovalQueueOptions {
  readonly directory: string
  readonly pollIntervalMs?: number
  /** Cancels this process's waiters; pending requests remain available for review. */
  readonly signal?: AbortSignal
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const requestSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  agentName: z.string().min(1),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  requestedAt: z.iso.datetime(),
  status: z.enum(['pending', 'approved', 'rejected']),
  decidedAt: z.iso.datetime().optional(),
  decidedBy: z.string().min(1).optional(),
  reason: z.string().optional(),
})

function failure(code: ErrorCode, message: string): CogentaError {
  return new CogentaError({
    code,
    message,
    hint: 'Check the shared approval directory and review pending requests in the administration.',
  })
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * Shared human decisions without an external service. Requests and decisions
 * are immutable files. A fully written temporary file is hard-linked into its
 * final name: link's exclusive creation is the cross-process compare-and-set,
 * so competing administrators cannot replace or replay a decision. A crash
 * before publication leaves only an ignored temporary file, never partial JSON.
 * Recovery lists existing requests; it never re-executes an old action.
 */
export function createFileApprovalQueue(options: FileApprovalQueueOptions): ApprovalQueue {
  const interval = Math.max(10, options.pollIntervalMs ?? 200)

  async function ensureDirectory(): Promise<void> {
    try {
      await mkdir(options.directory, { recursive: true, mode: 0o700 })
      const stat = await lstat(options.directory)
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw failure(
          'APPROVAL_QUEUE_UNAVAILABLE',
          'The approval directory is not a regular directory.',
        )
      }
      await chmod(options.directory, 0o700)
    } catch (error) {
      if (error instanceof CogentaError) throw error
      throw failure(
        'APPROVAL_QUEUE_UNAVAILABLE',
        'The shared approval directory could not be opened.',
      )
    }
  }

  function pathFor(id: string, decision = false): string {
    if (!ID_PATTERN.test(id))
      throw failure('APPROVAL_REQUEST_INVALID', 'The approval identifier is invalid.')
    return join(options.directory, `${id}${decision ? '.decision' : ''}.json`)
  }

  async function read(path: string): Promise<ApprovalRequest | null> {
    try {
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink())
        throw failure('APPROVAL_REQUEST_INVALID', 'An approval record is not a regular file.')
      const parsed = requestSchema.safeParse(JSON.parse(await readFile(path, 'utf8')) as unknown)
      if (!parsed.success)
        throw failure('APPROVAL_REQUEST_INVALID', 'An approval record is invalid.')
      const { decidedAt, decidedBy, reason, ...required } = parsed.data
      return {
        ...required,
        ...(decidedAt === undefined ? {} : { decidedAt }),
        ...(decidedBy === undefined ? {} : { decidedBy }),
        ...(reason === undefined ? {} : { reason }),
      }
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return null
      if (error instanceof CogentaError) throw error
      throw failure('APPROVAL_REQUEST_INVALID', 'An approval record could not be read.')
    }
  }

  async function atomicCreate(path: string, request: ApprovalRequest): Promise<void> {
    const temporary = join(options.directory, `.pending-${randomUUID()}.tmp`)
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(JSON.stringify(request), 'utf8')
        await file.sync()
      } finally {
        await file.close()
      }
      await link(temporary, path)
    } catch (error) {
      if (hasCode(error, 'EEXIST'))
        throw failure('APPROVAL_ALREADY_DECIDED', 'This approval request already has a decision.')
      throw failure(
        'APPROVAL_QUEUE_UNAVAILABLE',
        'The approval record could not be stored atomically.',
      )
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }

  async function current(id: string): Promise<ApprovalRequest> {
    const request = await read(pathFor(id))
    if (request === null)
      throw failure('APPROVAL_REQUEST_UNKNOWN', 'No approval request has this identifier.')
    if (request.id !== id || request.status !== 'pending')
      throw failure('APPROVAL_REQUEST_INVALID', 'The pending approval record is invalid.')
    const decision = await read(pathFor(id, true))
    if (decision === null) return request
    if (
      decision.id !== id ||
      decision.status === 'pending' ||
      decision.decidedAt === undefined ||
      decision.decidedBy === undefined ||
      decision.agentName !== request.agentName ||
      decision.toolName !== request.toolName ||
      decision.requestedAt !== request.requestedAt ||
      JSON.stringify(decision.input) !== JSON.stringify(request.input)
    ) {
      throw failure(
        'APPROVAL_REQUEST_INVALID',
        'The human decision does not match its pending request.',
      )
    }
    return decision
  }

  function isCancelled(signal?: AbortSignal): boolean {
    return signal?.aborted === true
  }

  function cancelled(): CogentaError {
    return failure('APPROVAL_REQUEST_CANCELLED', 'Waiting for human approval was cancelled.')
  }

  async function wait(signal?: AbortSignal): Promise<void> {
    if (isCancelled(signal)) throw cancelled()
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        resolve()
      }
      const abort = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        reject(cancelled())
      }
      const timer = setTimeout(done, interval)
      signal?.addEventListener('abort', abort, { once: true })
      if (isCancelled(signal)) abort()
    })
  }

  return {
    async request(input, requestSignal) {
      const signals = [options.signal, requestSignal].filter(
        (signal): signal is AbortSignal => signal !== undefined,
      )
      const signal = signals.length === 0 ? undefined : AbortSignal.any(signals)
      if (isCancelled(signal)) throw cancelled()
      await ensureDirectory()
      const request: ApprovalRequest = {
        ...input,
        id: newId(),
        requestedAt: new Date().toISOString(),
        status: 'pending',
      }
      if (!requestSchema.safeParse(request).success)
        throw failure('APPROVAL_REQUEST_INVALID', 'The requested human review is invalid.')
      await atomicCreate(pathFor(request.id), request)
      for (;;) {
        if (isCancelled(signal)) throw cancelled()
        const state = await current(request.id)
        if (state.status !== 'pending') return state
        await wait(signal)
      }
    },
    async list(status?: ApprovalStatus) {
      await ensureDirectory()
      const names = await readdir(options.directory)
      const requests: ApprovalRequest[] = []
      for (const name of names) {
        const id = name.slice(0, -5)
        if (!name.endsWith('.json') || !ID_PATTERN.test(id)) continue
        const request = await current(id)
        if (status === undefined || request.status === status) requests.push(request)
      }
      return requests.sort(
        (left, right) =>
          left.requestedAt.localeCompare(right.requestedAt) || left.id.localeCompare(right.id),
      )
    },
    async decide(id, status, decidedBy, reason) {
      if ((status !== 'approved' && status !== 'rejected') || decidedBy.trim() === '') {
        throw failure(
          'APPROVAL_REQUEST_INVALID',
          'A decision must name its human reviewer and approval or rejection.',
        )
      }
      await ensureDirectory()
      const request = await current(id)
      if (request.status !== 'pending')
        throw failure('APPROVAL_ALREADY_DECIDED', 'This approval request already has a decision.')
      const decision: ApprovalRequest = {
        ...request,
        status,
        decidedAt: new Date().toISOString(),
        decidedBy,
        ...(reason === undefined ? {} : { reason }),
      }
      await atomicCreate(pathFor(id, true), decision)
      return decision
    },
  }
}
