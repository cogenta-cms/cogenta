import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPluginDisableStore } from '../../src/permissions/disabled.js'
import { testDb } from '../helpers/db.js'

let db: DatabaseHandle

beforeEach(async () => {
  db = await testDb()
})

afterEach(async () => {
  await db.close()
})

describe('PluginDisableStore.listDisabled', () => {
  it('is empty when nothing is disabled', async () => {
    const store = createPluginDisableStore(db)
    expect(await store.listDisabled()).toEqual([])
  })

  it('lists every disabled plugin, newest first', async () => {
    const store = createPluginDisableStore(db, () => 1_000)
    await store.disable('@auteur/a', 'timeout', 'ran too long')

    const later = createPluginDisableStore(db, () => 2_000)
    await later.disable('@auteur/b', 'memory')

    const listed = await store.listDisabled()
    expect(listed.map((record) => record.pluginName)).toEqual(['@auteur/b', '@auteur/a'])
    expect(listed[0]).toMatchObject({ pluginName: '@auteur/b', reason: 'memory', details: null })
  })

  it('drops a plugin from the list once it is re-enabled', async () => {
    const store = createPluginDisableStore(db)
    await store.disable('@auteur/a', 'crash', 'threw')
    await store.disable('@auteur/b', 'timeout')

    await store.enable('@auteur/a')

    const listed = await store.listDisabled()
    expect(listed.map((record) => record.pluginName)).toEqual(['@auteur/b'])
  })
})
