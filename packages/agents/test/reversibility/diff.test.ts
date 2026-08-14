import { describe, expect, it } from 'vitest'
import { diffValues } from '../../src/reversibility/diff.js'

describe('diffValues', () => {
  it('returns no entries for identical plain objects', () => {
    expect(diffValues({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([])
  })

  it('reports a changed field at its own path', () => {
    expect(diffValues({ title: 'Old' }, { title: 'New' })).toEqual([
      { path: 'title', kind: 'changed', before: 'Old', after: 'New' },
    ])
  })

  it('reports an added field', () => {
    expect(diffValues({ a: 1 }, { a: 1, b: 2 })).toEqual([
      { path: 'b', kind: 'added', before: undefined, after: 2 },
    ])
  })

  it('reports a removed field', () => {
    expect(diffValues({ a: 1, b: 2 }, { a: 1 })).toEqual([
      { path: 'b', kind: 'removed', before: 2, after: undefined },
    ])
  })

  it('recurses into nested objects, using dotted paths', () => {
    expect(diffValues({ author: { name: 'Alice' } }, { author: { name: 'Bob' } })).toEqual([
      { path: 'author.name', kind: 'changed', before: 'Alice', after: 'Bob' },
    ])
  })

  it('treats an array as a single leaf value rather than recursing into indices', () => {
    expect(diffValues({ tags: ['a', 'b'] }, { tags: ['a', 'c'] })).toEqual([
      { path: 'tags', kind: 'changed', before: ['a', 'b'], after: ['a', 'c'] },
    ])
  })

  it('reports no entry when only array element order/content matches after stringify', () => {
    expect(diffValues({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([])
  })

  it('reports a change at the root when both values are primitives', () => {
    expect(diffValues('old', 'new')).toEqual([
      { path: '(root)', kind: 'changed', before: 'old', after: 'new' },
    ])
  })

  it('reports no entries when both root primitives are equal', () => {
    expect(diffValues(42, 42)).toEqual([])
  })

  it('collects multiple entries across different keys', () => {
    const entries = diffValues({ a: 1, b: 2, c: 3 }, { a: 1, b: 20, d: 4 })
    expect(entries).toHaveLength(3)
    expect(entries).toContainEqual({ path: 'b', kind: 'changed', before: 2, after: 20 })
    expect(entries).toContainEqual({ path: 'c', kind: 'removed', before: 3, after: undefined })
    expect(entries).toContainEqual({ path: 'd', kind: 'added', before: undefined, after: 4 })
  })
})
