import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
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
})
