import { describe, expect, it } from 'vitest'
import type { HealthRouter, HealthRouterOptions } from '../../src/rest/health-router.js'
import { createHealthRouter } from '../../src/rest/health-router.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `GET /api/health-report`, `GET /api/migrations-status`,
 * `POST /api/migrations-apply`, `GET /api/audit-integrity`,
 * `GET /api/disk-usage` and `GET /api/error-log` (fiche 24 tasks 1, 2, 4).
 *
 * No database here: every computation is injected, so what this suite
 * actually proves is the HTTP shape and the admin-only gate — the acceptance
 * criterion that the *content* of `getReport` is literally `runDoctor` is
 * proven where that function is wired, in `@cogenta/cli`'s `serve.ts`.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

function request(method: string, path: string, body?: unknown): RestRequest {
  return { method, path, query: {}, body }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

const REPORT = {
  node: 'v22.13.0',
  platform: 'linux',
  arch: 'x64',
  configPath: '/site/cogenta.config.mjs',
  site: { name: 'Test site', url: 'https://example.com', locales: ['en'] },
  checks: [
    {
      need: 'database',
      status: 'degraded' as const,
      driver: 'sqlite',
      tier: 'degraded' as const,
      reason: 'no Postgres configured',
      message: undefined,
    },
  ],
  notes: ['No LLM provider configured. Everything works except the agents.'],
  problems: [],
}

function routerWith(overrides: Partial<HealthRouterOptions> = {}): HealthRouter {
  return createHealthRouter({ getReport: async () => REPORT, ...overrides })
}

describe('the health transport', () => {
  describe('permissions', () => {
    it('refuses an anonymous read of the health report', async () => {
      const router = routerWith()
      const response = await router.handle(request('GET', '/api/health-report'), asPublic)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor read of the health report', async () => {
      const router = routerWith()
      const response = await router.handle(request('GET', '/api/health-report'), asEditor)
      expect(response.status).toBe(403)
    })

    it('refuses a non-admin from applying migrations', async () => {
      const router = routerWith()
      const response = await router.handle(request('POST', '/api/migrations-apply'), asEditor)
      expect(response.status).toBe(403)
    })
  })

  describe('health report', () => {
    it('hands back exactly what getReport returned', async () => {
      const router = routerWith()
      const response = await router.handle(request('GET', '/api/health-report'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf(response)).toEqual(REPORT)
    })
  })

  describe('migrations', () => {
    it('lists pending and applied migrations', async () => {
      const router = routerWith({
        getMigrations: async () => ({
          items: [
            {
              id: '0001',
              name: 'first',
              applied: true,
              appliedAt: '2026-01-01T00:00:00.000Z',
              destructive: false,
            },
            { id: '0002', name: 'second', applied: false, destructive: false },
          ],
        }),
      })
      const response = await router.handle(request('GET', '/api/migrations-status'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf<{ items: readonly unknown[] }>(response).items).toHaveLength(2)
    })

    it('applies only the non-destructive migrations and reports what is left', async () => {
      const router = routerWith({
        applyMigrations: async () => ({ applied: ['0001'], remainingDestructive: ['0002'] }),
      })
      const response = await router.handle(request('POST', '/api/migrations-apply'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf(response)).toEqual({ applied: ['0001'], remainingDestructive: ['0002'] })
    })

    it('answers an empty list when no migrator was wired', async () => {
      const router = routerWith()
      const response = await router.handle(request('GET', '/api/migrations-status'), asAdmin)
      expect(dataOf(response)).toEqual({ items: [] })
    })
  })

  describe('audit integrity', () => {
    it('reports a broken chain without throwing', async () => {
      const router = routerWith({
        getAuditIntegrity: async () => ({
          ok: false,
          checkedAt: '2026-08-19T00:00:00.000Z',
          error: 'Audit entry 12 does not chain from the entry before it.',
        }),
      })
      const response = await router.handle(request('GET', '/api/audit-integrity'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf<{ ok: boolean }>(response).ok).toBe(false)
    })
  })

  describe('error log', () => {
    it('returns the entries the caller supplied', async () => {
      const router = routerWith({
        getErrorLog: () => [
          {
            id: '1',
            at: '2026-08-19T00:00:00.000Z',
            code: 'INTERNAL',
            message: 'boom',
            trace: undefined,
          },
        ],
      })
      const response = await router.handle(request('GET', '/api/error-log'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf<{ entries: readonly unknown[] }>(response).entries).toHaveLength(1)
    })
  })

  it('answers 404 for an unknown path', async () => {
    const router = routerWith()
    const response = await router.handle(request('GET', '/api/health-report/nope'), asAdmin)
    expect(response.status).toBe(404)
  })

  it('answers 405 for the wrong method', async () => {
    const router = routerWith()
    const response = await router.handle(request('POST', '/api/health-report'), asAdmin)
    expect(response.status).toBe(405)
  })

  describe('maintenance mode', () => {
    it('defaults to a disabled state when nothing was wired', async () => {
      const router = routerWith()
      const response = await router.handle(request('GET', '/api/maintenance'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf<{ enabled: boolean }>(response).enabled).toBe(false)
    })

    it('turns it on with a message and reports who did it', async () => {
      const router = routerWith({
        setMaintenance: async (input, actorId) => ({
          enabled: input.enabled,
          message: input.message ?? null,
          updatedAt: '2026-08-19T00:00:00.000Z',
          updatedBy: actorId,
        }),
      })
      const response = await router.handle(
        request('POST', '/api/maintenance', { enabled: true, message: 'Back soon.' }),
        asAdmin,
      )
      expect(response.status).toBe(200)
      expect(dataOf(response)).toEqual({
        enabled: true,
        message: 'Back soon.',
        updatedAt: '2026-08-19T00:00:00.000Z',
        updatedBy: 'user-admin',
      })
    })

    it('refuses a non-admin from reading or setting it', async () => {
      const router = routerWith({
        getMaintenance: async () => ({
          enabled: false,
          message: null,
          updatedAt: '',
          updatedBy: null,
        }),
      })
      const read = await router.handle(request('GET', '/api/maintenance'), asEditor)
      expect(read.status).toBe(403)
      const write = await router.handle(
        request('POST', '/api/maintenance', { enabled: true }),
        asEditor,
      )
      expect(write.status).toBe(403)
    })

    it('refuses a non-boolean "enabled"', async () => {
      const router = routerWith({
        setMaintenance: async () => ({
          enabled: true,
          message: null,
          updatedAt: '',
          updatedBy: null,
        }),
      })
      const response = await router.handle(
        request('POST', '/api/maintenance', { enabled: 'yes' }),
        asAdmin,
      )
      expect(response.status).toBe(400)
    })
  })
})
