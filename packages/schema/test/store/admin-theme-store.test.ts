import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AdminThemeStore, createAdminThemeStore } from '../../src/store/admin-theme-store.js'
import { ensureAdminThemeTable } from '../../src/store/admin-theme-tables.js'

describe('createAdminThemeStore (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: AdminThemeStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-admin-theme-'))
    db = await createSqliteHandle({ url: join(directory, 'admin-theme.db') })
    await ensureAdminThemeTable(db)
    store = createAdminThemeStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('get() answers null before anybody has ever written a choice', async () => {
    expect(await store.get()).toBeNull()
  })

  it('refuses a template id outside the two built-ins', async () => {
    await expect(store.set('midnight-neon', {}, 'user-1')).rejects.toMatchObject({
      code: 'ADMIN_THEME_TEMPLATE_UNKNOWN',
    })
  })

  it('refuses an override key the schema does not declare', async () => {
    await expect(store.set('nightops', { headerHeightPx: 64 }, 'user-1')).rejects.toMatchObject({
      code: 'ADMIN_THEME_INVALID',
    })
  })

  it('refuses a colour override that is not a #rrggbb hex string', async () => {
    await expect(
      store.set('nightops', { primaryColor: 'rebeccapurple' }, 'user-1'),
    ).rejects.toMatchObject({ code: 'ADMIN_THEME_INVALID' })
  })

  it('refuses a font id the closed self-hosted list does not name', async () => {
    await expect(store.set('nightops', { fontBody: 'comic-sans' }, 'user-1')).rejects.toMatchObject(
      { code: 'ADMIN_THEME_INVALID' },
    )
  })

  it('writes a template choice and reads it back', async () => {
    const written = await store.set('atelier', { primaryColor: '#c23d0a', radius: 0.25 }, 'user-1')
    expect(written.templateId).toBe('atelier')
    expect(written.overrides).toEqual({ primaryColor: '#c23d0a', radius: 0.25 })
    expect(written.updatedBy).toBe('user-1')

    const found = await store.get()
    expect(found?.templateId).toBe('atelier')
    expect(found?.overrides).toEqual({ primaryColor: '#c23d0a', radius: 0.25 })
  })

  it('overwrites the singleton row rather than accumulating rows', async () => {
    await store.set('nightops', { primaryColor: '#123456' }, 'user-1')
    await store.set('atelier', { primaryColor: '#654321' }, 'user-2')

    const found = await store.get()
    expect(found?.templateId).toBe('atelier')
    expect(found?.overrides).toEqual({ primaryColor: '#654321' })
    expect(found?.updatedBy).toBe('user-2')
  })

  it('clearing a previously set logo is a valid write (null, not omission)', async () => {
    await store.set('nightops', { logoMediaId: 'media-1' }, 'user-1')
    const cleared = await store.set('nightops', { logoMediaId: null }, 'user-1')
    expect(cleared.overrides.logoMediaId).toBeNull()
  })
})
