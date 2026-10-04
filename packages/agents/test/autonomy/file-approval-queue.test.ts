import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileApprovalQueue } from '../../src/autonomy/file-approval-queue.js'
import type { ApprovalQueue, ApprovalRequest } from '../../src/autonomy/types.js'
import { withAutonomy } from '../../src/autonomy/with-autonomy.js'

const directories: string[] = []
const controllers: AbortController[] = []
const input = {
  agentName: 'mcp',
  toolName: 'content.publish',
  input: { collection: 'page', id: 'entry' },
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-approvals-'))
  directories.push(directory)
  const controller = new AbortController()
  controllers.push(controller)
  return {
    directory,
    controller,
    queue: createFileApprovalQueue({ directory, signal: controller.signal, pollIntervalMs: 10 }),
  }
}

async function pending(queue: ApprovalQueue): Promise<ApprovalRequest> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const request = (await queue.list('pending')).at(0)
    if (request !== undefined) return request
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('No request reached the shared approval directory.')
}

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

describe('shared file approval queue', () => {
  it('shuts down a proposal waiter without an unhandled rejection or executing its action', async () => {
    const { directory, controller, queue } = await fixture()
    const errors: unknown[] = []
    let mutations = 0
    const tool = withAutonomy(
      {
        spec: { name: 'content.publish', description: '', inputSchema: {} },
        sideEffects: true,
        reversible: true,
        async execute() {
          mutations += 1
        },
      },
      {
        agentName: 'shutdown-proposal',
        autonomy: { default: 'propose' },
        approvalQueue: queue,
        logger: { error: (...report) => errors.push(report) },
      },
    )
    expect(await tool.execute(input.input, { signal: new AbortController().signal })).toMatchObject(
      { proposed: true },
    )
    const request = await pending(queue)
    controller.abort()
    // Let the detached request settle. Vitest treats any unhandled rejection
    // as a failing suite, even though execute already returned its receipt.
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
    const recovered = createFileApprovalQueue({ directory })
    await recovered.decide(request.id, 'approved', 'human-after-shutdown')
    expect(mutations).toBe(0)
    expect(errors).toEqual([])
  })

  it('keeps a non-reversible action untouched until another instance records its human decision', async () => {
    const { directory, controller, queue } = await fixture()
    const human = createFileApprovalQueue({ directory })
    let mutations = 0
    const tool = withAutonomy(
      {
        spec: { name: 'content.publish', description: '', inputSchema: {} },
        sideEffects: true,
        reversible: false,
        async execute() {
          mutations += 1
          return { ok: true }
        },
      },
      { agentName: 'mcp', autonomy: { default: 'autonomous' }, approvalQueue: queue },
    )
    const result = tool.execute(input.input, { signal: controller.signal })
    const request = await pending(human)
    expect(mutations).toBe(0)
    await human.decide(request.id, 'approved', 'human-admin')
    expect(await result).toEqual({ ok: true })
    expect(mutations).toBe(1)
    expect(await queue.list('approved')).toMatchObject([
      { id: request.id, decidedBy: 'human-admin' },
    ])
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(directory, `${request.id}.json`))).mode & 0o777).toBe(0o600)
  })

  it('persists a rejection across queue reconstruction and prevents the action', async () => {
    const { directory, queue } = await fixture()
    const result = queue.request(input)
    const request = await pending(queue)
    const recovered = createFileApprovalQueue({ directory })
    await recovered.decide(request.id, 'rejected', 'human-admin', 'Keep the page private.')
    expect(await result).toMatchObject({ status: 'rejected', reason: 'Keep the page private.' })
    expect(await createFileApprovalQueue({ directory }).list('rejected')).toHaveLength(1)
  })

  it('permits exactly one concurrent decision and refuses repeated approvals without rewriting the receipt', async () => {
    const { directory, queue } = await fixture()
    const result = queue.request(input)
    const request = await pending(queue)
    const second = createFileApprovalQueue({ directory })
    const decisions = await Promise.allSettled([
      queue.decide(request.id, 'approved', 'first-human'),
      second.decide(request.id, 'rejected', 'second-human'),
    ])
    expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1)
    expect(decisions.find((decision) => decision.status === 'rejected')).toMatchObject({
      reason: { code: 'APPROVAL_ALREADY_DECIDED' },
    })
    const receipt = await result
    const original = await readFile(join(directory, `${request.id}.decision.json`), 'utf8')
    await expect(second.decide(request.id, 'approved', 'third-human')).rejects.toMatchObject({
      code: 'APPROVAL_ALREADY_DECIDED',
    })
    expect(await readFile(join(directory, `${request.id}.decision.json`), 'utf8')).toBe(original)
    expect((await second.list()).at(0)).toEqual(receipt)
  })

  it('cancels process waiters and retains reviewable requests without re-executing actions after recovery', async () => {
    const { directory, controller, queue } = await fixture()
    const result = queue.request(input)
    const rejection = expect(result).rejects.toMatchObject({ code: 'APPROVAL_REQUEST_CANCELLED' })
    const request = await pending(queue)
    controller.abort()
    await rejection
    const recovered = createFileApprovalQueue({ directory })
    expect(await recovered.list('pending')).toHaveLength(1)
    await recovered.decide(request.id, 'approved', 'human-after-restart')
    expect(await recovered.list('approved')).toHaveLength(1)
  })

  it('ignores abandoned temporary files and refuses malformed or unknown records', async () => {
    const { directory, queue } = await fixture()
    await writeFile(join(directory, '.pending-crashed.tmp'), '{unfinished')
    expect(await queue.list()).toEqual([])
    await expect(queue.decide('../escape', 'approved', 'human')).rejects.toMatchObject({
      code: 'APPROVAL_REQUEST_INVALID',
    })
    await expect(
      queue.decide('00000000-0000-0000-0000-000000000000', 'approved', 'human'),
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUEST_UNKNOWN' })
    await writeFile(join(directory, '00000000-0000-0000-0000-000000000000.json'), '{unfinished')
    await expect(queue.list()).rejects.toMatchObject({ code: 'APPROVAL_REQUEST_INVALID' })
    expect(await readdir(directory)).toHaveLength(2)
  })
})

it('cancels only the timed-out request while the shared queue remains available', async () => {
  const { queue } = await fixture()
  const requestController = new AbortController()
  const waiting = queue.request(input, requestController.signal)
  const rejection = expect(waiting).rejects.toMatchObject({ code: 'APPROVAL_REQUEST_CANCELLED' })
  const record = await pending(queue)
  requestController.abort()
  await rejection
  await queue.decide(record.id, 'approved', 'late-human')
  const second = queue.request(input)
  const next = await pending(queue)
  await queue.decide(next.id, 'rejected', 'human')
  expect((await second).status).toBe('rejected')
})
