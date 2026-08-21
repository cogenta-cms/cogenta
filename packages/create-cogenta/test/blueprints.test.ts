import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, DEFAULT_BLUEPRINT_ID, resolveBlueprint } from '../src/blueprints/registry.js'

describe('BLUEPRINTS registry', () => {
  it('lists every blueprint as available — L9 task 8 is complete, no "coming soon" placeholders remain', () => {
    expect(BLUEPRINTS.every((entry) => entry.available)).toBe(true)
    expect(BLUEPRINTS.map((entry) => entry.id).sort()).toEqual(
      [
        'blank',
        'blog',
        'vitrine',
        'portfolio',
        'documentation',
        'magazine',
        'association',
        'restaurant',
        'saas',
        'store',
      ].sort(),
    )
    expect(BLUEPRINTS).toHaveLength(10)
  })
})

describe('resolveBlueprint', () => {
  it('resolves the blank blueprint directly, without falling back', () => {
    const resolved = resolveBlueprint(DEFAULT_BLUEPRINT_ID)
    expect(resolved.fellBackToBlank).toBe(false)
    expect(resolved.blueprint.id).toBe('blank')
  })

  it('resolves the blog blueprint directly, without falling back', () => {
    const resolved = resolveBlueprint('blog')
    expect(resolved.fellBackToBlank).toBe(false)
    expect(resolved.blueprint.id).toBe('blog')
  })

  it.each([
    'vitrine',
    'portfolio',
    'documentation',
    'magazine',
    'association',
    'restaurant',
    'saas',
    'store',
  ])('resolves the %s blueprint directly, without falling back', (id) => {
    const resolved = resolveBlueprint(id)
    expect(resolved.fellBackToBlank).toBe(false)
    expect(resolved.blueprint.id).toBe(id)
  })

  it('falls back to blank, and says so, for an unknown id', () => {
    const resolved = resolveBlueprint('does-not-exist')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })
})
