import { createMemoryApprovalQueue } from '@cogenta/agents'
import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createAgentApprovalsRouter } from '../../src/rest/agent-approvals-router.js'

describe('human approval routes', () => {
  it('refuses public, viewer, editor, shopkeeper and automated administrators without deciding any action', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    try {
      await ensureAuthTables(db)
      const queue = createMemoryApprovalQueue()
      const waiting = queue.request({
        agentName: 'mcp',
        toolName: 'content.publish',
        input: { id: 'fixture' },
      })
      const pending = (await queue.list('pending'))[0]
      expect(pending).toBeDefined()
      const router = createAgentApprovalsRouter({ queue, audit: createAuditLog(db) })
      for (const actor of [
        { id: null, roles: ['public'] },
        { id: 'viewer', roles: ['viewer'] },
        { id: 'editor', roles: ['editor'] },
        { id: 'shopkeeper', roles: ['shopkeeper'] },
        { id: 'apikey:fixture', roles: ['admin'] },
        { id: 'agent:fixture', roles: ['admin'] },
      ]) {
        for (const request of [
          { method: 'GET', path: '/api/agent-approvals', query: {} },
          {
            method: 'POST',
            path: `/api/agent-approvals/${pending?.id}/approve`,
            query: {},
            body: {},
          },
        ])
          expect((await router.handle(request, actor)).status).toBe(403)
      }
      expect(await queue.list('pending')).toHaveLength(1)
      await queue.decide(pending?.id ?? '', 'rejected', 'human-cleanup')
      await waiting
    } finally {
      await db.close()
    }
  })

  it('records a human decision in the real audit chain and rejects a second decision', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    try {
      await ensureAuthTables(db)
      const queue = createMemoryApprovalQueue()
      const waiting = queue.request({
        agentName: 'mcp',
        toolName: 'content.publish',
        input: { id: 'fixture' },
      })
      const pending = (await queue.list('pending'))[0]
      expect(pending).toBeDefined()
      const audit = createAuditLog(db)
      const router = createAgentApprovalsRouter({ queue, audit })
      const actor = { id: 'human-admin', roles: ['admin'] }
      const request = {
        method: 'POST',
        path: `/api/agent-approvals/${pending?.id}/approve`,
        query: {},
        body: {},
      }
      expect((await router.handle(request, actor)).status).toBe(200)
      expect((await waiting).status).toBe('approved')
      expect((await audit.list()).some((event) => event.action === 'agent.approval.approved')).toBe(
        true,
      )
      expect((await router.handle(request, actor)).status).toBe(409)
      expect(await queue.list('pending')).toHaveLength(0)
    } finally {
      await db.close()
    }
  })
})
