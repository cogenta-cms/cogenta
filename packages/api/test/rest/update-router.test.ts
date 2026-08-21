import { describe, expect, it } from 'vitest'
import {
  createUpdateRouter,
  type RestorePointSummaryLike,
  type UpdateApplierLike,
  type UpdateApplyResultLike,
  type UpdateCheckerLike,
  type UpdateCheckReportLike,
  type UpdateHistoryEntryLike,
  type UpdateHistoryLike,
} from '../../src/rest/update-router.js'
import type { Actor } from '../../src/types.js'

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ANONYMOUS: Actor = { id: null, roles: ['public'] }

const UP_TO_DATE_REPORT: UpdateCheckReportLike = {
  checkedAt: '2026-08-21T09:00:00.000Z',
  packages: [
    {
      name: '@cogenta/core',
      installed: '0.4.0',
      latest: '0.4.0',
      bump: 'none',
      updateAvailable: false,
      checkError: undefined,
      contractRisk: null,
    },
  ],
  updateAvailable: false,
  highestBump: 'none',
  contractRiskDetected: false,
}

function fakeChecker(report: UpdateCheckReportLike): UpdateCheckerLike {
  return { check: async () => report }
}

function fakeApplier(result: UpdateApplyResultLike): UpdateApplierLike & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    apply: async (input) => {
      calls.push(input)
      return result
    },
  }
}

function fakeHistory(
  entries: readonly UpdateHistoryEntryLike[],
  restorePoints: readonly RestorePointSummaryLike[],
): UpdateHistoryLike {
  return { entries: async () => entries, restorePoints: async () => restorePoints }
}

function request(
  method: string,
  path: string,
  body?: unknown,
): {
  readonly method: string
  readonly path: string
  readonly query: Readonly<Record<string, string>>
  readonly body?: unknown
} {
  return body === undefined ? { method, path, query: {} } : { method, path, query: {}, body }
}

describe('createUpdateRouter', () => {
  it('reports the current check to an admin', async () => {
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier: fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT }),
      history: fakeHistory([], []),
    })

    const response = await router.handle(request('GET', '/api/updates/status'), ADMIN)
    expect(response.status).toBe(200)
    expect((response.body as { data: UpdateCheckReportLike }).data).toEqual(UP_TO_DATE_REPORT)
  })

  it('refuses status/history/apply to a non-admin role', async () => {
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier: fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT }),
      history: fakeHistory([], []),
    })

    for (const actor of [EDITOR, ANONYMOUS]) {
      const status = await router.handle(request('GET', '/api/updates/status'), actor)
      expect(status.status).toBe(403)
      const history = await router.handle(request('GET', '/api/updates/history'), actor)
      expect(history.status).toBe(403)
      const apply = await router.handle(request('POST', '/api/updates/apply'), actor)
      expect(apply.status).toBe(403)
    }
  })

  it('merges audit entries and restore points into one history response', async () => {
    const entries: readonly UpdateHistoryEntryLike[] = [
      {
        id: 'a1',
        at: '2026-08-20T00:00:00.000Z',
        action: 'system.update.applied',
        actorId: 'user-admin',
        diff: { from: '0.3.0', to: '0.4.0' },
      },
    ]
    const restorePoints: readonly RestorePointSummaryLike[] = [
      {
        path: '.cogenta/backups/update-2026-08-20.zip',
        createdAt: '2026-08-20T00:00:00.000Z',
        rows: 42,
        tables: 5,
        checksum: 'deadbeef',
        encrypted: false,
        triggeredByUpdate: true,
      },
    ]
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier: fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT }),
      history: fakeHistory(entries, restorePoints),
    })

    const response = await router.handle(request('GET', '/api/updates/history'), ADMIN)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { entries, restorePoints } })
  })

  it('passes confirmBreakingChange and the actor id through to the applier', async () => {
    const applier = fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT })
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier,
      history: fakeHistory([], []),
    })

    await router.handle(
      request('POST', '/api/updates/apply', { confirmBreakingChange: true }),
      ADMIN,
    )
    expect(applier.calls).toEqual([{ confirmBreakingChange: true, actorId: 'user-admin' }])
  })

  it('defaults confirmBreakingChange to false when the body omits it', async () => {
    const applier = fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT })
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier,
      history: fakeHistory([], []),
    })

    await router.handle(request('POST', '/api/updates/apply'), ADMIN)
    expect(applier.calls).toEqual([{ confirmBreakingChange: false, actorId: 'user-admin' }])
  })

  it('reports confirmation-required without applying anything', async () => {
    const risky: UpdateApplyResultLike = {
      kind: 'confirmation-required',
      report: UP_TO_DATE_REPORT,
      risky: [
        {
          name: '@cogenta/core',
          installed: '0.4.0',
          latest: '0.5.0',
          bump: 'minor',
          updateAvailable: true,
          checkError: undefined,
          contractRisk: {
            available: true,
            reason: undefined,
            scannedVersions: ['0.5.0'],
            warnings: [{ version: '0.5.0', excerpt: 'Contract A moves to schema@2.2.' }],
          },
        },
      ],
    }
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier: fakeApplier(risky),
      history: fakeHistory([], []),
    })

    const response = await router.handle(request('POST', '/api/updates/apply'), ADMIN)
    expect(response.status).toBe(200)
    expect((response.body as { data: UpdateApplyResultLike }).data.kind).toBe(
      'confirmation-required',
    )
  })

  it('returns 405 for a method the route does not support', async () => {
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier: fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT }),
      history: fakeHistory([], []),
    })

    const response = await router.handle(request('POST', '/api/updates/status'), ADMIN)
    expect(response.status).toBe(405)
  })

  it('returns 404 for an unknown path under /api/updates', async () => {
    const router = createUpdateRouter({
      checker: fakeChecker(UP_TO_DATE_REPORT),
      applier: fakeApplier({ kind: 'up-to-date', report: UP_TO_DATE_REPORT }),
      history: fakeHistory([], []),
    })

    const response = await router.handle(request('GET', '/api/updates/nope'), ADMIN)
    expect(response.status).toBe(404)
  })
})
