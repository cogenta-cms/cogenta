import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  BUILD_TARGETS,
  resolveTarget,
  TARGET_CAPABILITIES,
  targetSatisfies,
} from '../../src/build/targets.js'

describe('build targets', () => {
  it('offers exactly the three targets of the two-plane architecture', () => {
    expect([...BUILD_TARGETS]).toEqual(['static', 'node', 'edge'])
  })

  it('lets the static target carry static needs only', () => {
    const target = TARGET_CAPABILITIES.static
    expect(targetSatisfies(target, 'static')).toBe(true)
    expect(targetSatisfies(target, 'server')).toBe(false)
    expect(targetSatisfies(target, 'edge')).toBe(false)
  })

  it('lets both request-time targets carry every runtime need', () => {
    for (const target of [TARGET_CAPABILITIES.node, TARGET_CAPABILITIES.edge]) {
      expect(targetSatisfies(target, 'static')).toBe(true)
      expect(targetSatisfies(target, 'server')).toBe(true)
      expect(targetSatisfies(target, 'edge')).toBe(true)
    }
  })

  it('maps each target to the Astro output it needs, and only static needs no adapter', () => {
    expect(TARGET_CAPABILITIES.static.astroOutput).toBe('static')
    expect(TARGET_CAPABILITIES.static.adapter).toBeNull()
    expect(TARGET_CAPABILITIES.node.astroOutput).toBe('server')
    expect(TARGET_CAPABILITIES.node.adapter?.recommended).toBe('@astrojs/node')
    expect(TARGET_CAPABILITIES.edge.astroOutput).toBe('server')
    expect(TARGET_CAPABILITIES.edge.adapter?.recommended).toBe('@astrojs/cloudflare')
  })

  it('names the known targets when asked for one that does not exist', () => {
    try {
      resolveTarget('serverless')
      expect.unreachable('an unknown target must be refused')
    } catch (error) {
      expect(isCogentaError(error)).toBe(true)
      if (!isCogentaError(error)) return
      expect(error.code).toBe('BUILD_TARGET_UNKNOWN')
      expect(error.hint).toContain('static, node, edge')
    }
  })
})
