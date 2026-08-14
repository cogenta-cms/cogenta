import { describe, expect, it } from 'vitest'
import { findOrphanedRedirects } from '../../src/seo/redirects.js'

describe('findOrphanedRedirects', () => {
  it('does not flag a redirect pointing directly at a live URL', () => {
    const orphaned = findOrphanedRedirects([{ from: '/old', to: '/new' }], ['/new'])
    expect(orphaned).toEqual([])
  })

  it('flags a redirect pointing at nothing', () => {
    const orphaned = findOrphanedRedirects([{ from: '/old', to: '/gone' }], ['/new'])
    expect(orphaned).toEqual([{ from: '/old', to: '/gone' }])
  })

  it('does not flag a chain that eventually reaches a live URL', () => {
    const orphaned = findOrphanedRedirects(
      [
        { from: '/a', to: '/b' },
        { from: '/b', to: '/c' },
      ],
      ['/c'],
    )
    expect(orphaned).toEqual([])
  })

  it('flags every redirect in a chain whose final target is not live', () => {
    const orphaned = findOrphanedRedirects(
      [
        { from: '/a', to: '/b' },
        { from: '/b', to: '/gone' },
      ],
      ['/live'],
    )
    expect(orphaned).toEqual([
      { from: '/a', to: '/b' },
      { from: '/b', to: '/gone' },
    ])
  })

  it('flags a redirect cycle instead of looping forever', () => {
    const orphaned = findOrphanedRedirects(
      [
        { from: '/a', to: '/b' },
        { from: '/b', to: '/a' },
      ],
      ['/live'],
    )
    expect(orphaned).toHaveLength(2)
  })
})
