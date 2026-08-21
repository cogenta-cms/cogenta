import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSiteSettingsStore,
  type SiteSettingsStore,
} from '../../src/store/site-settings-store.js'
import {
  ensureSiteSettingsTables,
  SITE_SETTINGS_SITE_SCOPE,
} from '../../src/store/site-settings-tables.js'

describe('createSiteSettingsStore (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: SiteSettingsStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-site-settings-'))
    db = await createSqliteHandle({ url: join(directory, 'settings.db') })
    await ensureSiteSettingsTables(db)
    store = createSiteSettingsStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses a key the registry does not declare — never a loose row', async () => {
    await expect(
      store.set('nobody.declared.this', SITE_SETTINGS_SITE_SCOPE, 'x', null),
    ).rejects.toMatchObject({ code: 'SITE_SETTING_UNKNOWN' })
  })

  it('refuses a value that fails the key’s own schema', async () => {
    await expect(
      store.set('reading.postsPerPage', SITE_SETTINGS_SITE_SCOPE, 'not-a-number', null),
    ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })
  })

  it('refuses a locale on a site-scoped key', async () => {
    await expect(store.set('general.title', 'fr', 'Mon site', null)).rejects.toMatchObject({
      code: 'SITE_SETTING_INVALID',
    })
  })

  it('refuses the site sentinel on a locale-scoped key', async () => {
    await expect(
      store.set('general.tagline', SITE_SETTINGS_SITE_SCOPE, 'Bienvenue', null),
    ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })
  })

  it('writes a site-scoped setting and reads it back', async () => {
    const written = await store.set('general.title', SITE_SETTINGS_SITE_SCOPE, 'My Site', 'user-1')
    expect(written.value).toBe('My Site')
    expect(written.updatedBy).toBe('user-1')

    const found = await store.get('general.title', SITE_SETTINGS_SITE_SCOPE)
    expect(found?.value).toBe('My Site')
  })

  it('overwrites rather than duplicating a row on a second write', async () => {
    await store.set('reading.postsPerPage', SITE_SETTINGS_SITE_SCOPE, 5, 'user-1')
    await store.set('reading.postsPerPage', SITE_SETTINGS_SITE_SCOPE, 8, 'user-1')

    const rows = await store.list(SITE_SETTINGS_SITE_SCOPE)
    const matches = rows.filter((row) => row.key === 'reading.postsPerPage')
    expect(matches).toHaveLength(1)
    expect(matches[0]?.value).toBe(8)
  })

  it('keeps two locales of the same locale-scoped setting apart', async () => {
    await store.set('general.tagline', 'en', 'Welcome', null)
    await store.set('general.tagline', 'fr', 'Bienvenue', null)

    expect((await store.get('general.tagline', 'en'))?.value).toBe('Welcome')
    expect((await store.get('general.tagline', 'fr'))?.value).toBe('Bienvenue')
  })

  it('list(locale) returns both this locale’s rows and every site-scoped row', async () => {
    await store.set('general.title', SITE_SETTINGS_SITE_SCOPE, 'My Site', null)
    await store.set('general.tagline', 'fr', 'Bienvenue', null)
    await store.set('general.tagline', 'en', 'Welcome', null)

    const frRows = await store.list('fr')
    const keys = frRows.map((row) => `${row.key}:${row.locale}`)
    expect(keys).toContain('general.title:')
    expect(keys).toContain('general.tagline:fr')
    expect(keys).not.toContain('general.tagline:en')
  })

  it('get() answers null for a key nobody has written', async () => {
    expect(await store.get('privacy.policyPath', SITE_SETTINGS_SITE_SCOPE)).toBeNull()
  })

  it('writes the branding toggle and a custom logo media id (fiche L21 task 8)', async () => {
    await store.set('branding.showCogentaBranding', SITE_SETTINGS_SITE_SCOPE, false, 'user-1')
    await store.set(
      'branding.customLogoMediaId',
      SITE_SETTINGS_SITE_SCOPE,
      'media-abc123',
      'user-1',
    )

    expect((await store.get('branding.showCogentaBranding', SITE_SETTINGS_SITE_SCOPE))?.value).toBe(
      false,
    )
    expect((await store.get('branding.customLogoMediaId', SITE_SETTINGS_SITE_SCOPE))?.value).toBe(
      'media-abc123',
    )
  })
})
