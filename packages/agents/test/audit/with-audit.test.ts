import { describe, expect, it, vi } from 'vitest'
import type { AuditLogLike, AuditRecordInput } from '../../src/audit/types.js'
import { withAudit, withAuditForManifest } from '../../src/audit/with-audit.js'
import type { ExecutableTool } from '../../src/runtime/types.js'

function fakeAuditLog(): AuditLogLike & { readonly calls: AuditRecordInput[] } {
  const calls: AuditRecordInput[] = []
  return {
    calls,
    record: vi.fn(async (input: AuditRecordInput) => {
      calls.push(input)
      return { id: `audit-${calls.length}`, hash: 'h' }
    }),
  }
}

const ACTOR = { id: 'agent:security', roles: ['agent'] }
const CTX = { signal: new AbortController().signal }

function publishTool(): ExecutableTool {
  return {
    spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
    execute: async (input) => ({ url: `/entries/${input.id as string}` }),
  }
}

describe('withAudit', () => {
  it('records one entry on a successful call, with actor/action/target/diff', async () => {
    const auditLog = fakeAuditLog()
    let tick = 0
    const tool = withAudit(publishTool(), {
      auditLog,
      agentName: 'security',
      actor: ACTOR,
      now: () => {
        tick += 10
        return tick
      },
      targetOf: (input) => ({ collection: 'article', entryId: input.id as string }),
    })

    const result = await tool.execute({ id: 'e1' }, CTX)

    expect(result).toEqual({ url: '/entries/e1' })
    expect(auditLog.calls).toHaveLength(1)
    expect(auditLog.calls[0]).toEqual({
      actorId: 'agent:security',
      actorRoles: ['agent'],
      action: 'agent.tool.content.publish',
      collection: 'article',
      entryId: 'e1',
      diff: {
        agent: 'security',
        tool: 'content.publish',
        input: { id: 'e1' },
        output: { url: '/entries/e1' },
        durationMs: 10,
        ok: true,
      },
    })
  })

  it('records a failure entry and still rethrows the original error', async () => {
    const auditLog = fakeAuditLog()
    const failing: ExecutableTool = {
      spec: { name: 'boom', description: 'Fails.', inputSchema: {} },
      execute: async () => {
        throw new Error('kaboom')
      },
    }
    const tool = withAudit(failing, { auditLog, agentName: 'security', actor: ACTOR })

    await expect(tool.execute({}, CTX)).rejects.toThrowError('kaboom')

    expect(auditLog.calls).toHaveLength(1)
    expect(auditLog.calls[0]?.diff).toMatchObject({ ok: false, error: 'kaboom' })
  })

  it('omits collection/entryId when targetOf is not given', async () => {
    const auditLog = fakeAuditLog()
    const tool = withAudit(publishTool(), { auditLog, agentName: 'security', actor: ACTOR })

    await tool.execute({ id: 'e1' }, CTX)

    expect(auditLog.calls[0]).not.toHaveProperty('collection')
    expect(auditLog.calls[0]).not.toHaveProperty('entryId')
  })

  it('never lets a failing audit write fail the tool call it is auditing (ADR-0018)', async () => {
    const auditLog: AuditLogLike = {
      record: vi.fn(async () => Promise.reject(new Error('db down'))),
    }
    const onAuditFailure = vi.fn()
    const tool = withAudit(publishTool(), {
      auditLog,
      agentName: 'security',
      actor: ACTOR,
      onAuditFailure,
    })

    const result = await tool.execute({ id: 'e1' }, CTX)

    expect(result).toEqual({ url: '/entries/e1' })
    expect(onAuditFailure).toHaveBeenCalledWith(expect.any(Error))
  })

  it('preserves the tool spec unchanged', () => {
    const original = publishTool()
    const wrapped = withAudit(original, { auditLog: fakeAuditLog(), agentName: 'x', actor: ACTOR })
    expect(wrapped.spec).toEqual(original.spec)
  })
})

describe('withAuditForManifest', () => {
  it('wraps every tool in the manifest', async () => {
    const auditLog = fakeAuditLog()
    const manifest = withAuditForManifest([publishTool(), publishTool()], {
      auditLog,
      agentName: 'security',
      actor: ACTOR,
    })

    await manifest[0]?.execute({ id: 'a' }, CTX)
    await manifest[1]?.execute({ id: 'b' }, CTX)

    expect(auditLog.calls).toHaveLength(2)
  })
})
