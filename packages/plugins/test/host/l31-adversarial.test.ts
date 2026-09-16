import { describe, expect, it, vi } from 'vitest'
import {
  createContentWriteDraftHandler,
  createSchemaReadHandler,
} from '../../src/host/capabilities.js'
import { runIsolated } from '../../src/host/worker-runner.js'

/**
 * What L31 added, attacked on purpose: the invocation channel
 * (`invoke`/`input`/`describeHandlers`) and the collection-scoped
 * capabilities. The four escape vectors L7 already proves (filesystem,
 * network, process, secrets) are covered by `worker-runner.test.ts`; these
 * are the new surfaces, and a green run here is the claim that adding them
 * did not open a door.
 */

describe('the invocation channel cannot be turned into an escape', () => {
  it('returns nothing live: a handler that hands back a function loses it at the boundary', async () => {
    const result = await runIsolated('({ take: () => () => 1 })', { invoke: 'take', input: {} })

    expect(result.ok).toBe(true)
    // JSON is the whole vocabulary of the boundary: no function, no live reference.
    expect(result.value).toBeNull()
  })

  it('cannot reach the host through the Function constructor of its own context', async () => {
    const code = `({
      escape: () => {
        try {
          const F = ({}).constructor.constructor
          const found = F('return typeof process')()
          return { escaped: found !== 'undefined', found }
        } catch (error) {
          return { escaped: false, message: String(error) }
        }
      },
    })`

    const result = await runIsolated(code, { invoke: 'escape', input: {} })

    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ escaped: false })
  })

  it('does not let a payload pollute the prototype the host runs on', async () => {
    const before = ({} as Record<string, unknown>)['polluted']

    const result = await runIsolated('({ read: (input) => ({ seen: input.a }) })', {
      invoke: 'read',
      input: JSON.parse('{"a":1,"__proto__":{"polluted":"yes"}}') as unknown,
    })

    expect(result.ok).toBe(true)
    expect(({} as Record<string, unknown>)['polluted']).toBe(before)
  })

  it('reports a missing handler by name instead of running something else', async () => {
    const result = await runIsolated('({ wanted: () => 1, other: () => 2 })', {
      invoke: 'constructor',
      input: {},
    })

    // `constructor` exists on every object: calling it must not be a way to
    // reach a function the plugin never exposed.
    expect(result.ok).toBe(false)
    expect(result.error).toContain('constructor')
  })

  it('describes handlers without running any of them', async () => {
    const code = `({
      safe: () => 1,
      boom: () => { throw new Error('this must never run') },
      notAFunction: 42,
    })`

    const result = await runIsolated(code, { describeHandlers: true })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(['safe', 'boom'])
  })

  it('survives a completion value whose own properties fight back', async () => {
    const code = `(() => {
      const value = {}
      Object.defineProperty(value, 'trap', { enumerable: true, get() { throw new Error('nope') } })
      return value
    })()`

    const result = await runIsolated(code, { describeHandlers: true })

    // Either it reports nothing callable or it fails cleanly — never the
    // host's own error, and never a hang.
    expect(result.ok === false || Array.isArray(result.value)).toBe(true)
  })
})

describe('a capability granted for one collection reaches no other', () => {
  const context = { grantedCapabilities: ['content.write_draft:article'] }

  it('refuses another collection, and never calls the host', async () => {
    const write = vi.fn(async () => ({ id: 'x' }))
    const handler = createContentWriteDraftHandler(write)

    await expect(
      handler({ collection: 'note', values: { title: 'x' } }, context),
    ).rejects.toMatchObject({ code: 'PLUGIN_CAPABILITY_REFUSED' })
    expect(write).not.toHaveBeenCalled()

    await expect(
      handler({ collection: 'article', values: { title: 'x' } }, context),
    ).resolves.toEqual({ id: 'x' })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('refuses everything when the capability was not granted at all', async () => {
    const write = vi.fn(async () => ({ id: 'x' }))
    const handler = createContentWriteDraftHandler(write)

    await expect(
      handler({ collection: 'article', values: {} }, { grantedCapabilities: [] }),
    ).rejects.toMatchObject({ code: 'PLUGIN_CAPABILITY_REFUSED' })
    expect(write).not.toHaveBeenCalled()
  })

  it('checks the grant on every call, so a first accepted call widens nothing', async () => {
    const read = vi.fn(async () => ({}))
    const handler = createSchemaReadHandler(read)

    await expect(handler({}, { grantedCapabilities: ['schema.read'] })).resolves.toEqual({})
    await expect(handler({}, { grantedCapabilities: [] })).rejects.toMatchObject({
      code: 'PLUGIN_CAPABILITY_REFUSED',
    })
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('the sandbox holds nothing of the worker’s own realm (2026-09-16 review)', () => {
  /**
   * The escape this closes, verified before and after: the context used to be
   * handed the worker's `setTimeout`, `console`, `Math`, `JSON` and
   * `Promise`. `setTimeout.constructor` is the *worker's* `Function`, so
   * `setTimeout.constructor('return process')()` returned the real `process`
   * — filesystem, `child_process`, and the site's `.env` with it. No
   * capability was needed.
   */
  const escapes = [
    ['an injected timer', `setTimeout.constructor('return process')()`],
    ['the console it is given', `console.log.constructor('return process')()`],
    ['an SDK method', `sdk.storage.write.constructor('return process')()`],
    ['a plain object', `({}).constructor.constructor('return process')()`],
    ['an async function', `(async () => {}).constructor.constructor('return process')()`],
    [
      'a caught error',
      `(() => { try { null.x } catch (e) { return e.constructor.constructor('return process')() } })()`,
    ],
  ] as const

  for (const [what, expression] of escapes) {
    it(`cannot reach the host through ${what}`, async () => {
      const code = `({
        go: async () => {
          try {
            const found = await (${expression})
            return { escaped: found !== null && typeof found === 'object' && typeof found.pid === 'number' }
          } catch (error) {
            return { escaped: false, message: String(error).slice(0, 80) }
          }
        },
      })`

      const result = await runIsolated(code, {
        invoke: 'go',
        input: {},
        grantedCapabilities: ['storage.write:plugins/x'],
        handlers: { 'storage.write': async () => ({ ok: true }) },
      })

      expect(result.ok).toBe(true)
      expect(result.value).toMatchObject({ escaped: false })
    })
  }

  it('still gives a plugin a working SDK and console through that wall', async () => {
    const code = `({
      go: async () => {
        console.log('a plugin may still log')
        const written = await sdk.storage.write({ key: 'plugins/x/a', content: 'hello' })
        return { written }
      },
    })`

    const result = await runIsolated(code, {
      invoke: 'go',
      input: {},
      grantedCapabilities: ['storage.write:plugins/x'],
      handlers: { 'storage.write': async () => ({ ok: true }) },
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ written: { ok: true } })
  })
})
