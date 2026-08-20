import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMaintenanceStore,
  ensureMaintenanceTable,
  type MaintenanceStore,
} from '../../src/store/maintenance-store.js'

describe('createMaintenanceStore (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: MaintenanceStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-maintenance-'))
    db = await createSqliteHandle({ url: join(directory, 'maintenance.db') })
    await ensureMaintenanceTable(db)
    store = createMaintenanceStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('defaults to disabled before anything is ever written', async () => {
    const state = await store.get()
    expect(state.enabled).toBe(false)
    expect(state.message).toBeNull()
  })

  it('turns maintenance mode on with a message, then off again', async () => {
    const on = await store.set({ enabled: true, message: 'Back in ten minutes.', updatedBy: 'u1' })
    expect(on.enabled).toBe(true)
    expect(on.message).toBe('Back in ten minutes.')
    expect(on.updatedBy).toBe('u1')

    const read = await store.get()
    expect(read.enabled).toBe(true)
    expect(read.message).toBe('Back in ten minutes.')

    const off = await store.set({ enabled: false })
    expect(off.enabled).toBe(false)
    // Clearing the message is explicit: omitting it entirely on a later
    // `set` leaves the previous one in place — this call passes none, which
    // is the "clear it" input `SetMaintenanceInput.message` documents.
    expect(off.message).toBeNull()
  })

  it('is a single row: setting it twice updates in place, not append', async () => {
    await store.set({ enabled: true })
    await store.set({ enabled: true, message: 'Second message.' })

    const state = await store.get()
    expect(state.message).toBe('Second message.')
  })
})
