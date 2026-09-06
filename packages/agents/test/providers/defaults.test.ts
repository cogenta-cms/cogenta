import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createSiteSettingsStore,
  ensureSiteSettingsTables,
  SITE_SETTINGS_SITE_SCOPE,
  type SiteSettingsStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  resolveProviderTuningDefaults,
  staticProviderTuningDefaults,
} from '../../src/providers/defaults.js'

/**
 * `resolveProviderTuningDefaults`/`staticProviderTuningDefaults` are the
 * whole point of the fiche feedback this refactor answers ("rien ne doit
 * être hardcodé, absolument rien") — a real `SiteSettingsStore` (SQLite
 * file, never a mock — AGENTS.md § "Pas de mock de la base") proves the
 * three `assistant.*` settings are genuinely read from storage, not from a
 * constant reintroduced under a new name.
 */
describe('resolveProviderTuningDefaults', () => {
  let directory: string
  let db: DatabaseHandle
  let store: SiteSettingsStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-provider-tuning-'))
    db = await createSqliteHandle({ url: join(directory, 'settings.db') })
    await ensureSiteSettingsTables(db)
    store = createSiteSettingsStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('falls back to the registry default when no admin has ever written a row', async () => {
    const defaults = await resolveProviderTuningDefaults(store)
    expect(defaults).toEqual({
      maxOutputTokens: 8000,
      requestTimeoutMs: 180_000,
      maxCorrectionAttempts: 3,
    })
  })

  it('reads a real value an admin wrote, not the registry default', async () => {
    await store.set('assistant.defaultMaxOutputTokens', SITE_SETTINGS_SITE_SCOPE, 12_000, 'user-1')
    await store.set('assistant.defaultMaxCorrectionAttempts', SITE_SETTINGS_SITE_SCOPE, 7, 'user-1')

    const defaults = await resolveProviderTuningDefaults(store)
    expect(defaults.maxOutputTokens).toBe(12_000)
    expect(defaults.maxCorrectionAttempts).toBe(7)
    // Untouched key still falls back to its own registry default.
    expect(defaults.requestTimeoutMs).toBe(180_000)
  })

  it('converts the stored seconds setting to milliseconds', async () => {
    await store.set(
      'assistant.defaultRequestTimeoutSeconds',
      SITE_SETTINGS_SITE_SCOPE,
      240,
      'user-1',
    )

    const defaults = await resolveProviderTuningDefaults(store)
    expect(defaults.requestTimeoutMs).toBe(240_000)
  })
})

describe('staticProviderTuningDefaults', () => {
  it('returns the registry defaults with no store involved at all', () => {
    expect(staticProviderTuningDefaults()).toEqual({
      maxOutputTokens: 8000,
      requestTimeoutMs: 180_000,
      maxCorrectionAttempts: 3,
    })
  })
})
