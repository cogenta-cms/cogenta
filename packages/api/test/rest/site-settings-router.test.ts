import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createSiteSettingsStore,
  ensureSiteSettingsTables,
  type SiteSettingsStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import {
  createSiteSettingsRouter,
  type SerialisedSiteSetting,
  type SiteSettingsRouter,
} from '../../src/rest/site-settings-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * The `/api/settings` transport, against a real SQLite database (AGENTS.md:
 * no mock of the base). Three things this suite exists to prove: an unknown
 * key is refused rather than silently accepted (fiche 23 task 1), a read is
 * public while a write needs `admin` (fiche 23 § "Critères d'acceptation"),
 * and a locale-scoped setting resolves against the site's default locale
 * when the caller sends none.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

function request(
  method: string,
  extra: { readonly query?: RestRequest['query']; readonly body?: unknown } = {},
): RestRequest {
  return {
    method,
    path: '/api/settings',
    query: extra.query ?? {},
    ...(extra.body === undefined ? {} : { body: extra.body }),
  }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

describe('the site settings transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: SiteSettingsRouter
  let store: SiteSettingsStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-site-settings-api-'))
    db = await createSqliteHandle({ url: join(directory, 'settings.db') })
    await ensureSiteSettingsTables(db)
    store = createSiteSettingsStore({ db })
    router = createSiteSettingsRouter({ store, defaultLocale: 'en' })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('reading', () => {
    it('is public, unlike security/webhooks — the theme must render the same tagline anonymously', async () => {
      const response = await router.handle(request('GET'), asPublic)
      expect(response.status).toBe(200)
    })

    it('lists every registered setting with its default, before anything is written', async () => {
      const response = await router.handle(request('GET'), asPublic)
      const data = dataOf<readonly SerialisedSiteSetting[]>(response)

      const title = data.find((setting) => setting.key === 'general.title')
      expect(title?.value).toBe('')
      expect(title?.isDefault).toBe(true)
      expect(title?.updatedAt).toBeNull()

      const homePath = data.find((setting) => setting.key === 'reading.homePath')
      expect(homePath?.value).toBe('')
      expect(homePath?.scope).toBe('site')
    })
  })

  describe('permissions', () => {
    it('refuses an editor writing a site-scoped setting', async () => {
      const response = await router.handle(
        request('PATCH', { body: { key: 'general.title', value: 'My Site' } }),
        asEditor,
      )
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an anonymous write', async () => {
      const response = await router.handle(
        request('PATCH', { body: { key: 'general.title', value: 'My Site' } }),
        asPublic,
      )
      expect(response.status).toBe(403)
    })

    it('lets an admin write a setting', async () => {
      const response = await router.handle(
        request('PATCH', { body: { key: 'general.title', value: 'My Site' } }),
        asAdmin,
      )
      expect(response.status).toBe(200)
      expect(dataOf<SerialisedSiteSetting>(response).value).toBe('My Site')
    })
  })

  describe('the closed registry', () => {
    it('refuses a key nobody declared, rather than storing it as a loose row', async () => {
      const response = await router.handle(
        request('PATCH', { body: { key: 'general.doesNotExist', value: 'x' } }),
        asAdmin,
      )
      expect(response.status).toBe(404)
      expect(errorOf(response).code).toBe('SITE_SETTING_UNKNOWN')
    })

    it('refuses a value that fails the key’s own schema', async () => {
      const response = await router.handle(
        request('PATCH', { body: { key: 'general.adminEmail', value: 'not-an-email' } }),
        asAdmin,
      )
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('SITE_SETTING_INVALID')
    })
  })

  describe('writing and reading back', () => {
    it('persists a written value and reports it as no longer default', async () => {
      await router.handle(
        request('PATCH', { body: { key: 'reading.homePath', value: '/welcome' } }),
        asAdmin,
      )

      const response = await router.handle(request('GET'), asPublic)
      const data = dataOf<readonly SerialisedSiteSetting[]>(response)
      const homePath = data.find((setting) => setting.key === 'reading.homePath')

      expect(homePath?.value).toBe('/welcome')
      expect(homePath?.isDefault).toBe(false)
      expect(homePath?.updatedAt).not.toBeNull()
      expect(homePath?.updatedBy).toBe('user-admin')
    })

    it('overwrites a previously written value rather than duplicating a row', async () => {
      await router.handle(
        request('PATCH', { body: { key: 'reading.postsPerPage', value: 12 } }),
        asAdmin,
      )
      await router.handle(
        request('PATCH', { body: { key: 'reading.postsPerPage', value: 20 } }),
        asAdmin,
      )

      const response = await router.handle(request('GET'), asPublic)
      const data = dataOf<readonly SerialisedSiteSetting[]>(response)
      expect(data.find((setting) => setting.key === 'reading.postsPerPage')?.value).toBe(20)
    })
  })

  describe('locale-scoped settings', () => {
    it('resolves against the router’s default locale when the caller sends none', async () => {
      await router.handle(
        request('PATCH', {
          query: { locale: 'fr' },
          body: { key: 'general.tagline', value: 'Bienvenue' },
        }),
        asAdmin,
      )
      await router.handle(
        request('PATCH', {
          query: { locale: 'en' },
          body: { key: 'general.tagline', value: 'Welcome' },
        }),
        asAdmin,
      )

      const defaultRead = dataOf<readonly SerialisedSiteSetting[]>(
        await router.handle(request('GET'), asPublic),
      )
      expect(defaultRead.find((setting) => setting.key === 'general.tagline')?.value).toBe(
        'Welcome',
      )

      const frenchRead = dataOf<readonly SerialisedSiteSetting[]>(
        await router.handle(request('GET', { query: { locale: 'fr' } }), asPublic),
      )
      expect(frenchRead.find((setting) => setting.key === 'general.tagline')?.value).toBe(
        'Bienvenue',
      )
    })
  })
})
