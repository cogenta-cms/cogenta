import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createThemeStore, ensureThemeTable, type ThemeStore } from '../../src/store/theme-store.js'

describe('createThemeStore (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: ThemeStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-theme-'))
    db = await createSqliteHandle({ url: join(directory, 'theme.db') })
    await ensureThemeTable(db)
    store = createThemeStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('starts with no overrides at all', async () => {
    const state = await store.get()
    expect(state.tokenOverrides).toBeNull()
    expect(state.additionalCss).toBeNull()
    expect(state.logoMediaId).toBeNull()
    expect(state.faviconMediaId).toBeNull()
  })

  it('writes a partial token override and round-trips it as an object', async () => {
    const written = await store.set({
      tokenOverrides: { color: { accent: '#ff0000' } },
      updatedBy: 'u1',
    })
    expect(written.tokenOverrides).toEqual({ color: { accent: '#ff0000' } })
    expect(written.updatedBy).toBe('u1')

    const read = await store.get()
    expect(read.tokenOverrides).toEqual({ color: { accent: '#ff0000' } })
  })

  it('is a single row: writing twice updates in place', async () => {
    await store.set({ additionalCss: '.a { color: red; }' })
    await store.set({ additionalCss: '.b { color: blue; }' })
    const state = await store.get()
    expect(state.additionalCss).toBe('.b { color: blue; }')
  })

  it('leaves a field untouched when the input omits it, but clears it on an explicit null', async () => {
    await store.set({ tokenOverrides: { color: { accent: '#ff0000' } }, additionalCss: '.a{}' })

    const leftAlone = await store.set({ additionalCss: '.b{}' })
    expect(leftAlone.tokenOverrides).toEqual({ color: { accent: '#ff0000' } })
    expect(leftAlone.additionalCss).toBe('.b{}')

    const cleared = await store.set({ tokenOverrides: null })
    expect(cleared.tokenOverrides).toBeNull()
    expect(cleared.additionalCss).toBe('.b{}')
  })

  it('stores every identity media reference independently', async () => {
    const written = await store.set({
      logoMediaId: 'media-logo',
      logoDarkMediaId: 'media-logo-dark',
      faviconMediaId: 'media-favicon',
      shareImageMediaId: 'media-share',
    })
    expect(written.logoMediaId).toBe('media-logo')
    expect(written.logoDarkMediaId).toBe('media-logo-dark')
    expect(written.faviconMediaId).toBe('media-favicon')
    expect(written.shareImageMediaId).toBe('media-share')
  })

  it('clear() resets every field in one call', async () => {
    await store.set({
      tokenOverrides: { color: { accent: '#ff0000' } },
      additionalCss: '.a{}',
      logoMediaId: 'media-logo',
    })
    const cleared = await store.clear('u2')
    expect(cleared.tokenOverrides).toBeNull()
    expect(cleared.additionalCss).toBeNull()
    expect(cleared.logoMediaId).toBeNull()
    expect(cleared.updatedBy).toBe('u2')

    const read = await store.get()
    expect(read.tokenOverrides).toBeNull()
  })

  it('starts with the built-in default theme (null) and round-trips a switch', async () => {
    expect((await store.get()).activeTheme).toBeNull()

    const written = await store.set({ activeTheme: '@cogenta/theme-portfolio' })
    expect(written.activeTheme).toBe('@cogenta/theme-portfolio')

    const read = await store.get()
    expect(read.activeTheme).toBe('@cogenta/theme-portfolio')
  })

  it('clear() resets the skin but never the active theme — a colour undo must not silently switch layouts', async () => {
    await store.set({
      tokenOverrides: { color: { accent: '#ff0000' } },
      activeTheme: '@cogenta/theme-magazine',
    })

    const cleared = await store.clear('u3')
    expect(cleared.tokenOverrides).toBeNull()
    expect(cleared.activeTheme).toBe('@cogenta/theme-magazine')

    const read = await store.get()
    expect(read.activeTheme).toBe('@cogenta/theme-magazine')
  })

  it('adds active_theme to a table that predates it, in place, without losing existing rows', async () => {
    // A second, independent connection to the *same* file, building the
    // table exactly as it looked before this column existed — `create table
    // if not exists` alone would silently do nothing for a database in this
    // shape, which is exactly the bug this migration-style column add exists
    // to avoid (`menu-tables.ts`'s own precedent).
    const legacyDirectory = await mkdtemp(join(tmpdir(), 'cogenta-theme-legacy-'))
    const legacyDb = await createSqliteHandle({ url: join(legacyDirectory, 'legacy.db') })
    try {
      await legacyDb.query(sql`create table cogenta_theme (
          id text not null primary key,
          token_overrides text,
          additional_css text,
          logo_media_id text,
          logo_dark_media_id text,
          favicon_media_id text,
          share_image_media_id text,
          updated_at text not null,
          updated_by text
        )`)
      await legacyDb.query(
        sql`insert into cogenta_theme (id, updated_at, updated_by) values ('site', '2026-01-01T00:00:00.000Z', 'legacy-user')`,
      )

      // Same code path a real upgrade takes: `ensureThemeTable` runs again
      // against a table that already exists, just without the new column.
      await ensureThemeTable(legacyDb)
      const legacyStore = createThemeStore({ db: legacyDb })

      const existing = await legacyStore.get()
      expect(existing.activeTheme).toBeNull()
      expect(existing.updatedBy).toBe('legacy-user')

      const written = await legacyStore.set({ activeTheme: '@cogenta/theme-ecommerce' })
      expect(written.activeTheme).toBe('@cogenta/theme-ecommerce')
    } finally {
      await legacyDb.close()
      await rm(legacyDirectory, { recursive: true, force: true })
    }
  })
})
