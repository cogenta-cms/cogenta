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

  // SEO group (fiche 21 task 3) — `seo.tsx`'s previous read-only scope was
  // never an ADR, so this group makes it a real, admin-editable registry
  // group like any other.
  describe('the seo group', () => {
    it('requires a title template to actually carry the %title% token', async () => {
      await expect(
        store.set('seo.titleTemplate', SITE_SETTINGS_SITE_SCOPE, 'A static title', null),
      ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })

      const written = await store.set(
        'seo.titleTemplate',
        SITE_SETTINGS_SITE_SCOPE,
        '%title% — My Site',
        null,
      )
      expect(written.value).toBe('%title% — My Site')
    })

    it('accepts an empty title template — "no template" is a valid state', async () => {
      const written = await store.set('seo.titleTemplate', SITE_SETTINGS_SITE_SCOPE, '', null)
      expect(written.value).toBe('')
    })

    it('stores a per-collection map of title templates, one entry per collection name', async () => {
      const written = await store.set(
        'seo.collectionTitleTemplates',
        SITE_SETTINGS_SITE_SCOPE,
        { article: '%title% | Blog', page: '%title%' },
        null,
      )
      expect(written.value).toEqual({ article: '%title% | Blog', page: '%title%' })
    })

    it('refuses a per-collection template missing the %title% token', async () => {
      await expect(
        store.set(
          'seo.collectionTitleTemplates',
          SITE_SETTINGS_SITE_SCOPE,
          { article: 'Always the same title' },
          null,
        ),
      ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })
    })

    it('validates a Twitter handle needs its leading @', async () => {
      await expect(
        store.set('seo.twitterHandle', SITE_SETTINGS_SITE_SCOPE, 'example', null),
      ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })

      const written = await store.set(
        'seo.twitterHandle',
        SITE_SETTINGS_SITE_SCOPE,
        '@example',
        null,
      )
      expect(written.value).toBe('@example')
    })

    it('accepts a site-relative path or an absolute URL for the default social image, and refuses anything else', async () => {
      await expect(
        store.set('seo.defaultSocialImageUrl', SITE_SETTINGS_SITE_SCOPE, 'not-a-url-or-path', null),
      ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })

      expect(
        (await store.set('seo.defaultSocialImageUrl', SITE_SETTINGS_SITE_SCOPE, '/share.png', null))
          .value,
      ).toBe('/share.png')
      expect(
        (
          await store.set(
            'seo.defaultSocialImageUrl',
            SITE_SETTINGS_SITE_SCOPE,
            'https://cdn.example.com/share.png',
            null,
          )
        ).value,
      ).toBe('https://cdn.example.com/share.png')
    })

    it('stores per-collection sitemap inclusion, changefreq and priority', async () => {
      const written = await store.set(
        'seo.sitemapCollectionSettings',
        SITE_SETTINGS_SITE_SCOPE,
        {
          article: { included: true, changefreq: 'weekly', priority: 0.8 },
          memo: { included: false, changefreq: '', priority: '' },
        },
        null,
      )
      expect(written.value).toEqual({
        article: { included: true, changefreq: 'weekly', priority: 0.8 },
        memo: { included: false, changefreq: '', priority: '' },
      })
    })

    it('refuses a sitemap priority outside 0..1', async () => {
      await expect(
        store.set(
          'seo.sitemapCollectionSettings',
          SITE_SETTINGS_SITE_SCOPE,
          { article: { included: true, changefreq: '', priority: 1.5 } },
          null,
        ),
      ).rejects.toMatchObject({ code: 'SITE_SETTING_INVALID' })
    })
  })
})
