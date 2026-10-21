import { describe, expect, it } from 'vitest'
import { stricterAutonomy } from '../../src/autonomy/with-autonomy.js'

/**
 * Security review of 2026-10-21: a sub-agent ran on its own autonomy, so an
 * agent allowed only to propose could delegate to an autopilot one and have
 * it act.
 */
describe('a delegated run never gets more freedom than its delegator', () => {
  it('takes the stricter default', () => {
    expect(stricterAutonomy({ default: 'propose' }, { default: 'autonomous' }).default).toBe(
      'propose',
    )
    expect(stricterAutonomy({ default: 'autonomous' }, { default: 'observe' }).default).toBe(
      'observe',
    )
  })

  it('takes the stricter level tool by tool, overrides on either side included', () => {
    const merged = stricterAutonomy(
      { default: 'propose' },
      { default: 'autonomous', overrides: { 'redirects.create': 'autonomous' } },
    )
    expect(merged.overrides?.['redirects.create']).toBe('propose')

    const reverse = stricterAutonomy(
      { default: 'autonomous', overrides: { 'content.publish': 'observe' } },
      { default: 'autonomous' },
    )
    expect(reverse.overrides?.['content.publish']).toBe('observe')
    expect(reverse.default).toBe('autonomous')
  })
})
