import { describe, expect, it } from 'vitest'
import { canPerform, readableCollections } from '../../src/schema/permissions.js'
import type { CollectionSummary } from '../../src/schema/types.js'

const ARTICLE: CollectionSummary = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['editor'],
  },
  fields: [],
}

const MEMO: CollectionSummary = {
  name: 'memo',
  labels: { singular: 'Memo', plural: 'Memos' },
  permissions: { read: ['editor'], create: ['editor'], update: ['editor'] },
  fields: [],
}

describe('canPerform', () => {
  it('allows an action open to public, for any actor including anonymous', () => {
    expect(canPerform('read', ARTICLE, [])).toBe(true)
    expect(canPerform('read', ARTICLE, ['viewer'])).toBe(true)
  })

  it('allows an actor holding one of the granted roles', () => {
    expect(canPerform('create', ARTICLE, ['editor'])).toBe(true)
    expect(canPerform('delete', ARTICLE, ['admin'])).toBe(true)
  })

  it('denies an actor holding none of the granted roles', () => {
    expect(canPerform('delete', ARTICLE, ['editor'])).toBe(false)
    expect(canPerform('create', ARTICLE, ['viewer'])).toBe(false)
  })

  it('denies every actor, including admin, for an action the collection never grants to anyone', () => {
    // Unlisted action: an omission grants nobody, not even the most
    // privileged role — the same "deny by default" rule the API enforces.
    expect(canPerform('publish', MEMO, ['admin'])).toBe(false)
  })

  it('is true if the actor holds any one of several roles', () => {
    expect(canPerform('read', MEMO, ['viewer', 'editor'])).toBe(true)
  })

  it('denies a collection closed to public even for an anonymous-shaped role list', () => {
    expect(canPerform('read', MEMO, [])).toBe(false)
  })
})

describe('readableCollections', () => {
  it('keeps only collections the actor may read', () => {
    expect(readableCollections([ARTICLE, MEMO], [])).toEqual([ARTICLE])
    expect(readableCollections([ARTICLE, MEMO], ['editor'])).toEqual([ARTICLE, MEMO])
  })

  it('returns an empty list rather than throwing when nothing is readable', () => {
    const closed: CollectionSummary = {
      name: 'closed',
      labels: { singular: 'Closed', plural: 'Closed' },
      permissions: { read: ['admin'] },
      fields: [],
    }
    expect(readableCollections([closed], ['viewer'])).toEqual([])
  })
})
