import { describe, expect, it } from 'vitest'
import { runIsolated } from '../../src/host/worker-runner.js'

/**
 * L31 step 1: a plugin can be *called*, with a payload, instead of merely
 * being evaluated once. The script's completion value is the set of handlers
 * it exposes; exactly one is called, and it receives what the host sent.
 */

const PLUGIN = `({
  greet: (input) => ({ hello: input.name }),
  slow: async (input) => {
    const doubled = input.value * 2
    return { doubled }
  },
})`

describe('calling a named handler', () => {
  it('passes the host’s payload to the handler it names and returns its value', async () => {
    const result = await runIsolated(PLUGIN, { invoke: 'greet', input: { name: 'Ada' } })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ hello: 'Ada' })
  })

  it('awaits an async handler', async () => {
    const result = await runIsolated(PLUGIN, { invoke: 'slow', input: { value: 21 } })

    expect(result.value).toEqual({ doubled: 42 })
  })

  it('fails by name when the plugin exposes no such handler', async () => {
    const result = await runIsolated(PLUGIN, { invoke: 'missing', input: {} })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('"missing"')
  })

  it('still evaluates the script and returns its value when nothing is invoked', async () => {
    const result = await runIsolated('1 + 1')

    expect(result.ok).toBe(true)
    expect(result.value).toBe(2)
  })
})
