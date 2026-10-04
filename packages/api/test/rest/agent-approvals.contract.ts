import { createMemoryApprovalQueue } from '@cogenta/agents'
import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import type { DatabaseHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createAgentApprovalsRouter } from '../../src/rest/agent-approvals-router.js'

export function runAgentApprovalsContract(
  label: string,
  connect: () => Promise<DatabaseHandle>,
): void {
  describe(`human decisions and audit persistence — ${label}`, () => {
    it('persists the authenticated decision once and denies automated or unprivileged decisions', async () => {
      const db = await connect()
      try {
        await ensureAuthTables(db)
        const queue = createMemoryApprovalQueue()
        const audit = createAuditLog(db)
        const router = createAgentApprovalsRouter({ queue, audit })
        const waiting = queue.request({
          agentName: 'qa-review',
          toolName: 'content.publish',
          input: { id: 'qa-entry' },
        })
        const pending = (await queue.list('pending'))[0]
        expect(pending).toBeDefined()
        const request = {
          method: 'POST',
          path: `/api/agent-approvals/${pending?.id}/approve`,
          query: {},
          body: {},
        }
        for (const actor of [
          { id: null, roles: ['public'] },
          { id: 'qa-viewer', roles: ['viewer'] },
          { id: 'qa-editor', roles: ['editor'] },
          { id: 'qa-shopkeeper', roles: ['shopkeeper'] },
          { id: 'apikey:qa', roles: ['admin'] },
          { id: 'agent:qa', roles: ['admin'] },
        ])
          expect((await router.handle(request, actor)).status).toBe(403)
        expect(await queue.list('pending')).toHaveLength(1)
        const actor = { id: 'qa-human-admin', roles: ['admin'] }
        expect((await router.handle(request, actor)).status).toBe(200)
        expect((await waiting).status).toBe('approved')
        expect((await router.handle(request, actor)).status).toBe(409)
        const events = (await audit.list({ action: 'agent.approval.approved' })).filter(
          (event) => event.entryId === pending?.id,
        )
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
          actorId: actor.id,
          diff: { from: 'pending', to: 'approved', toolName: 'content.publish' },
        })
      } finally {
        await db.close()
      }
    })
  })
}
