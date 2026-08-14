import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, DEFAULT_BLUEPRINT_ID, resolveBlueprint } from '../src/blueprints/registry.js'

describe('BLUEPRINTS registry', () => {
  it('lists exactly one available blueprint — blank — plus the eight named ones as coming soon', () => {
    const available = BLUEPRINTS.filter((entry) => entry.available)
    expect(available).toHaveLength(1)
    expect(available[0]?.id).toBe('blank')
    expect(BLUEPRINTS).toHaveLength(9)
  })
})

describe('resolveBlueprint', () => {
  it('resolves the blank blueprint directly, without falling back', () => {
    const resolved = resolveBlueprint(DEFAULT_BLUEPRINT_ID)
    expect(resolved.fellBackToBlank).toBe(false)
    expect(resolved.blueprint.id).toBe('blank')
  })

  it('falls back to blank, and says so, for an unavailable blueprint', () => {
    const resolved = resolveBlueprint('blog')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })

  it('falls back to blank, and says so, for an unknown id', () => {
    const resolved = resolveBlueprint('does-not-exist')
    expect(resolved.fellBackToBlank).toBe(true)
    expect(resolved.blueprint.id).toBe('blank')
  })
})
