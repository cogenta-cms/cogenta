import type { CollectionDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { requiresMfa, sensitiveRoles } from '../src/mfa.js'

function collection(permissions: CollectionDefinition['permissions']): CollectionDefinition {
  return {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {},
    permissions,
  }
}

describe('sensitiveRoles', () => {
  it('always includes admin, even with no collections at all', () => {
    expect(sensitiveRoles([])).toEqual(new Set(['admin']))
  })

  it('adds every role that can publish on any collection', () => {
    const collections = [collection({ publish: ['editor'] }), collection({ publish: ['reviewer'] })]
    expect(sensitiveRoles(collections)).toEqual(new Set(['admin', 'editor', 'reviewer']))
  })

  it('ignores roles that can only read, create, update or delete', () => {
    const collections = [collection({ read: ['public'], create: ['editor'], update: ['editor'] })]
    expect(sensitiveRoles(collections)).toEqual(new Set(['admin']))
  })

  it('deduplicates a role that can publish on more than one collection', () => {
    const collections = [collection({ publish: ['editor'] }), collection({ publish: ['editor'] })]
    expect(sensitiveRoles(collections)).toEqual(new Set(['admin', 'editor']))
  })

  it('tolerates a collection with no publish permission declared at all', () => {
    expect(sensitiveRoles([collection({})])).toEqual(new Set(['admin']))
  })
})

describe('requiresMfa', () => {
  const collections = [collection({ publish: ['editor'] })]

  it('is true for the admin role unconditionally', () => {
    expect(requiresMfa(['admin'], [])).toBe(true)
  })

  it('is true for a role that can publish', () => {
    expect(requiresMfa(['editor'], collections)).toBe(true)
  })

  it('is false for a role with no publish rights anywhere', () => {
    expect(requiresMfa(['viewer'], collections)).toBe(false)
  })

  it('is true if any one of several roles is sensitive', () => {
    expect(requiresMfa(['viewer', 'editor'], collections)).toBe(true)
  })

  it('is false for a user with no roles at all', () => {
    expect(requiresMfa([], collections)).toBe(false)
  })
})
