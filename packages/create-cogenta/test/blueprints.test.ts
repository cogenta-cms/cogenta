import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, DEFAULT_BLUEPRINT_ID, resolveBlueprint } from '../src/blueprints/registry.js'

describe('BLUEPRINTS registry', () => {
  it('lists blank, blog, vitrine, portfolio and documentation as available, plus four remaining ones as coming soon', () => {
    const available = BLUEPRINTS.filter((entry) => entry.available)
    expect(available.map((entry) => entry.id).sort()).toEqual(
      ['blank', 'blog', 'vitrine', 'portfolio', 'documentation'].sort(),
    )
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

  it.each(['vitrine', 'portfolio', 'documentation'])(
    'resolves the %s blueprint directly, without falling back',
    (id) => {
      const resolved = resolveBlueprint(id)
      expect(resolved.fellBackToBlank).toBe(false)
      expect(resolved.blueprint.id).toBe(id)
    },
  )

  it('falls back to blank, and says so, for a blueprint that is still coming soon', () => {
    const resolved = resolveBlueprint('magazine')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })

  it('falls back to blank, and says so, for an unknown id', () => {
    const resolved = resolveBlueprint('does-not-exist')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })
})
