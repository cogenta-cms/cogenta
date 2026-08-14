import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, DEFAULT_BLUEPRINT_ID, resolveBlueprint } from '../src/blueprints/registry.js'

describe('BLUEPRINTS registry', () => {
  it('lists blank and blog as available, plus the seven remaining ones as coming soon', () => {
    const available = BLUEPRINTS.filter((entry) => entry.available)
    expect(available.map((entry) => entry.id)).toEqual(['blank', 'blog'])
    expect(BLUEPRINTS).toHaveLength(9)
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

  it('falls back to blank, and says so, for a blueprint that is still coming soon', () => {
    const resolved = resolveBlueprint('vitrine')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })

  it('falls back to blank, and says so, for an unknown id', () => {
    const resolved = resolveBlueprint('does-not-exist')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })
})
