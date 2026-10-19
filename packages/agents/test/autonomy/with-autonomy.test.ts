import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createMemoryApprovalQueue } from '../../src/autonomy/approval-queue.js'
import type { ApprovalQueue } from '../../src/autonomy/types.js'
import { withAutonomy, withAutonomyForManifest } from '../../src/autonomy/with-autonomy.js'
import type { ExecutableTool } from '../../src/runtime/types.js'

const CTX = { signal: new AbortController().signal }

function readTool(): ExecutableTool {
  return {
    spec: { name: 'content.read', description: 'Read.', inputSchema: {} },
    sideEffects: false,
    reversible: false,
    execute: async () => ({ ok: true }),
  }
}

function publishTool(reversible = true): ExecutableTool {
  return {
    spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
    sideEffects: true,
    reversible,
    execute: async (input) => ({ published: input.id }),
  }
}

describe('withAutonomy — read-only tools', () => {
  it('always executes normally, regardless of level', async () => {
    const tool = withAutonomy(readTool(), {
      agentName: 'security',
      autonomy: { default: 'observe' },
      approvalQueue: createMemoryApprovalQueue(),
    })

    expect(await tool.execute({}, CTX)).toEqual({ ok: true })
  })
})

describe('withAutonomy — observe', () => {
  it('never calls a side-effecting tool, and says so', async () => {
    let called = false
    const tool: ExecutableTool = {
      ...publishTool(),
      execute: async () => {
        called = true
        return {}
      },
    }
    const wrapped = withAutonomy(tool, {
      agentName: 'security',
      autonomy: { default: 'observe' },
      approvalQueue: createMemoryApprovalQueue(),
    })

    const result = await wrapped.execute({ id: 'e1' }, CTX)

    expect(called).toBe(false)
    expect(result).toMatchObject({ observed: true })
  })
})

describe('withAutonomy — propose', () => {
  it('reports unexpected proposal storage failures without leaking the action input', async () => {
    const reports: unknown[] = []
    const queue: ApprovalQueue = {
      ...createMemoryApprovalQueue(),
      request: async () => {
        throw new CogentaError({
          code: 'APPROVAL_QUEUE_UNAVAILABLE',
          message: 'Storage failure with sensitive contents',
        })
      },
    }
    const wrapped = withAutonomy(publishTool(true), {
      agentName: 'proposal-test',
      autonomy: { default: 'propose' },
      approvalQueue: queue,
      logger: { error: (...report) => reports.push(report) },
    })
    expect(await wrapped.execute({ secret: 'not-for-logs' }, CTX)).toMatchObject({ proposed: true })
    await Promise.resolve()
    expect(reports).toEqual([
      [
        'Agent proposal could not be recorded for human review',
        { agent: 'proposal-test', tool: 'content.publish', code: 'APPROVAL_QUEUE_UNAVAILABLE' },
      ],
    ])
    expect(JSON.stringify(reports)).not.toContain('not-for-logs')
    expect(JSON.stringify(reports)).not.toContain('sensitive contents')
  })

  it('queues a request without waiting for it, and never calls the tool', async () => {
    let called = false
    const tool: ExecutableTool = {
      ...publishTool(),
      execute: async () => {
        called = true
        return {}
      },
    }
    const approvalQueue = createMemoryApprovalQueue()
    const wrapped = withAutonomy(tool, {
      agentName: 'security',
      autonomy: { default: 'propose' },
      approvalQueue,
    })

    const result = await wrapped.execute({ id: 'e1' }, CTX)

    expect(called).toBe(false)
    expect(result).toMatchObject({ proposed: true })
    expect(await approvalQueue.list('pending')).toHaveLength(1)
  })
})

describe('withAutonomy — autonomous', () => {
  it('calls the tool immediately, with no approval queue involvement', async () => {
    const approvalQueue = createMemoryApprovalQueue()
    const tool = withAutonomy(publishTool(true), {
      agentName: 'security',
      autonomy: { default: 'autonomous' },
      approvalQueue,
    })

    const result = await tool.execute({ id: 'e1' }, CTX)

    expect(result).toEqual({ published: 'e1' })
    expect(await approvalQueue.list()).toHaveLength(0)
  })
})

describe('withAutonomy — execute_with_approval', () => {
  it('blocks until approved, then calls the tool and returns its result', async () => {
    const approvalQueue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    const tool = withAutonomy(publishTool(true), {
      agentName: 'security',
      autonomy: { default: 'execute_with_approval' },
      approvalQueue,
    })

    const pending = tool.execute({ id: 'e1' }, CTX)
    await approvalQueue.decide('req-1', 'approved', 'alice')

    expect(await pending).toEqual({ published: 'e1' })
  })

  it('throws TOOL_CALL_REJECTED when rejected, and never calls the tool', async () => {
    let called = false
    const tool: ExecutableTool = { ...publishTool(true), execute: async () => (called = true) }
    const approvalQueue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    const wrapped = withAutonomy(tool, {
      agentName: 'security',
      autonomy: { default: 'execute_with_approval' },
      approvalQueue,
    })

    const pending = wrapped.execute({ id: 'e1' }, CTX)
    await approvalQueue.decide('req-1', 'rejected', 'alice', 'not now')

    await expect(pending).rejects.toThrowError(/rejected by human review: not now/)
    expect(called).toBe(false)
  })
})

describe('withAutonomy — forced approval overrides everything, including autonomous', () => {
  it('a sideEffects tool with reversible: false always requires approval', async () => {
    const approvalQueue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    const tool = withAutonomy(publishTool(false), {
      agentName: 'security',
      autonomy: { default: 'autonomous' },
      approvalQueue,
    })

    const pending = tool.execute({ id: 'e1' }, CTX)
    expect(await approvalQueue.list('pending')).toHaveLength(1)

    await approvalQueue.decide('req-1', 'approved', 'alice')
    expect(await pending).toEqual({ published: 'e1' })
  })

  it('a tool with sideEffects unset is treated as side-effecting (conservative default)', async () => {
    const noMetadata: ExecutableTool = {
      spec: { name: 'x', description: 'x', inputSchema: {} },
      execute: async () => 'ok',
    }
    const approvalQueue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    const tool = withAutonomy(noMetadata, {
      agentName: 'security',
      autonomy: { default: 'autonomous' },
      approvalQueue,
    })

    void tool.execute({}, CTX)
    expect(await approvalQueue.list('pending')).toHaveLength(1)
  })
})

describe('withAutonomy — per-tool overrides', () => {
  it('a tool-specific level takes priority over the agent default', async () => {
    const tool: ExecutableTool = { ...publishTool(true), execute: async () => 'ok' }
    const wrapped = withAutonomy(tool, {
      agentName: 'security',
      autonomy: { default: 'observe', overrides: { 'content.publish': 'autonomous' } },
      approvalQueue: createMemoryApprovalQueue(),
    })

    expect(await wrapped.execute({}, CTX)).toBe('ok')
  })
})

describe('withAutonomyForManifest', () => {
  it('wraps every tool in the manifest', async () => {
    const approvalQueue: ApprovalQueue = createMemoryApprovalQueue()
    const manifest = withAutonomyForManifest([readTool(), publishTool(true)], {
      agentName: 'security',
      autonomy: { default: 'autonomous' },
      approvalQueue,
    })

    expect(manifest).toHaveLength(2)
    expect(await manifest[0]?.execute({}, CTX)).toEqual({ ok: true })
  })
})

it('never executes an action approved after its run was cancelled, with the memory approval driver', async () => {
  let mutations = 0
  const queue = createMemoryApprovalQueue()
  const controller = new AbortController()
  const wrapped = withAutonomy(
    {
      ...publishTool(false),
      execute: async () => {
        mutations += 1
        return {}
      },
    },
    { agentName: 'cancel-test', autonomy: { default: 'autonomous' }, approvalQueue: queue },
  )
  const result = wrapped.execute({}, { signal: controller.signal })
  const rejection = expect(result).rejects.toMatchObject({ code: 'APPROVAL_REQUEST_CANCELLED' })
  const pending = (await queue.list('pending'))[0]
  controller.abort()
  await rejection
  await queue.decide(pending?.id ?? '', 'approved', 'human')
  expect(mutations).toBe(0)
})

it('checks cancellation again after a human decision wins the queue race', async () => {
  const controller = new AbortController()
  let mutations = 0
  const queue: ApprovalQueue = {
    request: async (input) => {
      controller.abort()
      return { ...input, id: 'race', requestedAt: new Date().toISOString(), status: 'approved' }
    },
    list: async () => [],
    decide: async () => {
      throw new Error('Unused test decision.')
    },
  }
  const wrapped = withAutonomy(
    {
      ...publishTool(false),
      execute: async () => {
        mutations += 1
      },
    },
    {
      agentName: 'race-test',
      autonomy: { default: 'autonomous' },
      approvalQueue: queue,
    },
  )
  await expect(wrapped.execute({}, { signal: controller.signal })).rejects.toMatchObject({
    code: 'APPROVAL_REQUEST_CANCELLED',
  })
  expect(mutations).toBe(0)
})

it('prevents a late approval from executing an action after its run deadline expires', async () => {
  let mutations = 0
  const queue = createMemoryApprovalQueue({ newId: () => 'deadline-request' })
  const wrapped = withAutonomy(
    {
      ...publishTool(false),
      execute: async () => {
        mutations += 1
      },
    },
    {
      agentName: 'deadline-test',
      autonomy: { default: 'execute_with_approval' },
      approvalQueue: queue,
    },
  )
  await expect(wrapped.execute({}, { signal: AbortSignal.timeout(20) })).rejects.toMatchObject({
    code: 'APPROVAL_REQUEST_CANCELLED',
  })
  await queue.decide('deadline-request', 'approved', 'human-after-deadline')
  expect(mutations).toBe(0)
})
