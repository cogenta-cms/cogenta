import type { CogentaConfig } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import {
  type ConfigStatusInput,
  createOpsStatusRouter,
  type OpsStatusRouter,
} from '../../src/rest/ops-status-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `GET /api/security-status` and `GET /api/webhooks-status` — read-only
 * mirrors of the site's configuration file (audit follow-up to L10 task 6
 * and L14 task 1). No database: these routes only ever echo the config
 * object the process already resolved at startup.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

const SECURITY: CogentaConfig['security'] = {
  cors: {
    origins: ['https://example.com'],
    methods: ['GET', 'POST'],
    headers: ['content-type'],
    credentials: false,
    maxAge: 600,
  },
  csp: "default-src 'self'",
  hstsMaxAge: 31536000,
  hstsIncludeSubDomains: true,
  pageMaxAge: 60,
}

function request(method: string, path: string): RestRequest {
  return { method, path, query: {} }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

function routerWith(webhooks: CogentaConfig['webhooks']): OpsStatusRouter {
  return createOpsStatusRouter({ security: SECURITY, webhooks })
}

describe('the ops status transport', () => {
  describe('permissions', () => {
    it('refuses an anonymous read of the security status', async () => {
      const router = routerWith({ endpoints: [], secret: undefined })
      const response = await router.handle(request('GET', '/api/security-status'), asPublic)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor read of either status', async () => {
      const router = routerWith({ endpoints: [], secret: undefined })
      const security = await router.handle(request('GET', '/api/security-status'), asEditor)
      const webhooks = await router.handle(request('GET', '/api/webhooks-status'), asEditor)
      expect(security.status).toBe(403)
      expect(webhooks.status).toBe(403)
    })
  })

  describe('security status', () => {
    it('mirrors the resolved CORS, CSP, HSTS and cache configuration', async () => {
      const router = routerWith({ endpoints: [], secret: undefined })
      const response = await router.handle(request('GET', '/api/security-status'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf(response)).toEqual({
        cors: {
          enabled: true,
          origins: ['https://example.com'],
          methods: ['GET', 'POST'],
          headers: ['content-type'],
          credentials: false,
          maxAge: 600,
        },
        csp: "default-src 'self'",
        hsts: { enabled: true, maxAge: 31536000, includeSubDomains: true },
        pageMaxAge: 60,
      })
    })

    it('reports CORS disabled when no origin is configured', async () => {
      const router = createOpsStatusRouter({
        security: { ...SECURITY, cors: { ...SECURITY.cors, origins: [] } },
        webhooks: { endpoints: [], secret: undefined },
      })
      const response = await router.handle(request('GET', '/api/security-status'), asAdmin)
      expect(dataOf<{ cors: { enabled: boolean } }>(response).cors.enabled).toBe(false)
    })
  })

  describe('webhooks status', () => {
    it('reports configured endpoints as signed when a secret is set', async () => {
      const router = routerWith({ endpoints: ['https://receiver.example/webhook'], secret: 'shh' })
      const response = await router.handle(request('GET', '/api/webhooks-status'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf(response)).toEqual({
        endpoints: ['https://receiver.example/webhook'],
        signed: true,
        disabledForMissingSecret: false,
      })
    })

    it('never leaks the secret itself, and flags endpoints configured without one', async () => {
      const router = routerWith({
        endpoints: ['https://receiver.example/webhook'],
        secret: undefined,
      })
      const response = await router.handle(request('GET', '/api/webhooks-status'), asAdmin)
      const body = JSON.stringify(response.body)
      expect(body).not.toContain('shh')
      const data = dataOf<{ signed: boolean; disabledForMissingSecret: boolean }>(response)
      expect(data.signed).toBe(false)
      expect(data.disabledForMissingSecret).toBe(true)
    })

    it('reports no endpoints configured as not disabled', async () => {
      const router = routerWith({ endpoints: [], secret: undefined })
      const response = await router.handle(request('GET', '/api/webhooks-status'), asAdmin)
      const data = dataOf<{ disabledForMissingSecret: boolean }>(response)
      expect(data.disabledForMissingSecret).toBe(false)
    })
  })

  describe('config status (fiche 23 task 5)', () => {
    const CONFIG: ConfigStatusInput = {
      site: { name: 'Test site', url: 'https://example.com', notFoundPath: '/404' },
      database: { driver: 'sqlite' },
      cache: { driver: 'memory' },
      queue: { driver: 'database' },
      storage: { driver: 'local', bucket: undefined, region: undefined, endpoint: undefined },
      llm: undefined,
      embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
      imageGeneration: undefined,
      vector: { driver: 'memory' },
      billingConfigured: false,
      secretHygiene: {
        databaseUrlHasCredentialsInFile: false,
        envFilePath: null,
        envFileReadableByOthers: null,
      },
    }

    it('refuses an anonymous or editor read', async () => {
      const router = createOpsStatusRouter({
        security: SECURITY,
        webhooks: { endpoints: [], secret: undefined },
        config: CONFIG,
      })
      const asAnon = await router.handle(request('GET', '/api/config-status'), asPublic)
      const asEd = await router.handle(request('GET', '/api/config-status'), asEditor)
      expect(asAnon.status).toBe(403)
      expect(asEd.status).toBe(403)
    })

    it('mirrors driver/provider names to an admin, never a secret field', async () => {
      const router = createOpsStatusRouter({
        security: SECURITY,
        webhooks: { endpoints: [], secret: undefined },
        config: CONFIG,
      })
      const response = await router.handle(request('GET', '/api/config-status'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf(response)).toEqual(CONFIG)
      // Structural guarantee, not just this fixture: `ConfigStatusInput` has
      // no field named `url`, `apiKey`, `accessKeyId` or `secretAccessKey` —
      // there is nothing to accidentally serialise.
      const body = JSON.stringify(response.body)
      expect(body).not.toContain('apiKey')
      expect(body).not.toContain('secretAccessKey')
    })

    it('flags a database URL with embedded credentials found in the config file', async () => {
      const router = createOpsStatusRouter({
        security: SECURITY,
        webhooks: { endpoints: [], secret: undefined },
        config: {
          ...CONFIG,
          secretHygiene: {
            databaseUrlHasCredentialsInFile: true,
            envFilePath: '/site/.env',
            envFileReadableByOthers: true,
          },
        },
      })
      const response = await router.handle(request('GET', '/api/config-status'), asAdmin)
      const data = dataOf<ConfigStatusInput>(response)
      expect(data.secretHygiene.databaseUrlHasCredentialsInFile).toBe(true)
      expect(data.secretHygiene.envFileReadableByOthers).toBe(true)
    })

    it('answers null, not a 500, when the caller never wired a config mirror', async () => {
      const router = createOpsStatusRouter({
        security: SECURITY,
        webhooks: { endpoints: [], secret: undefined },
      })
      const response = await router.handle(request('GET', '/api/config-status'), asAdmin)
      expect(response.status).toBe(200)
      expect(dataOf(response)).toBeNull()
    })
  })

  it('answers 404 for an unrelated path', async () => {
    const router = routerWith({ endpoints: [], secret: undefined })
    const response = await router.handle(request('GET', '/api/something-else'), asAdmin)
    expect(response.status).toBe(404)
  })

  it('answers 405 for a write method on either route', async () => {
    const router = routerWith({ endpoints: [], secret: undefined })
    const response = await router.handle(request('POST', '/api/security-status'), asAdmin)
    expect(response.status).toBe(405)
  })
})
