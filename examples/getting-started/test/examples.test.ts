import { resolveConfig } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import config from '../src/cogenta.config.js'
import collections, { note } from '../src/cogenta.schema.js'

describe('docs/getting-started.md examples', () => {
  it('cogenta.config.ts resolves into a usable CogentaConfig', () => {
    const resolved = resolveConfig(config, {})

    expect(resolved.site.name).toBe('My site')
    expect(resolved.database.driver).toBe('sqlite')
  })

  it('cogenta.schema.ts declares a real, valid collection', () => {
    expect(collections).toEqual([note])
    expect(note.name).toBe('note')
    expect(note.routing?.pattern).toBe('/notes/:slug')
  })
})
