import { describe, expect, it } from 'vitest'
import type { ExecutableTool } from '../../src/runtime/types.js'
import type { SandboxCallResult } from '../../src/sandbox/types.js'
import { withSandbox, withSandboxForManifest } from '../../src/sandbox/with-sandbox.js'

const CTX = { signal: new AbortController().signal }

describe('withSandbox', () => {
  it('leaves a non-side-effecting tool unchanged — real read', async () => {
    const read: ExecutableTool = {
      spec: { name: 'content.read', description: 'Read.', inputSchema: {} },
      sideEffects: false,
      execute: async () => ({ id: 'e1' }),
    }

    const wrapped = withSandbox(read)

    expect(await wrapped.execute({}, CTX)).toEqual({ id: 'e1' })
  })

  it('leaves a tool with no declared sideEffects unchanged (undefined is treated as read here, unlike withAutonomy)', async () => {
    const undeclared: ExecutableTool = {
      spec: { name: 'echo', description: 'Echo.', inputSchema: {} },
      execute: async (input) => input,
    }

    const wrapped = withSandbox(undeclared)

    expect(await wrapped.execute({ a: 1 }, CTX)).toEqual({ a: 1 })
  })

  it('refuses to call a side-effecting tool with no revert(), reporting simulated: false', async () => {
    let called = false
    const irreversible: ExecutableTool = {
      spec: { name: 'deploy.trigger', description: 'Deploy.', inputSchema: {} },
      sideEffects: true,
      execute: async () => {
        called = true
        return { ok: true }
      },
    }

    const result = await withSandbox(irreversible).execute({}, CTX)

    expect(called).toBe(false)
    expect(result).toEqual({
      simulated: false,
      note: '"deploy.trigger" has no revert() — refusing to run it even once, since the sandbox could not undo it on the copied site.',
    })
  })

  it('runs a reversible tool for real and immediately reverts it, reporting simulated: true', async () => {
    const calls: string[] = []
    const revertReceipt: unknown[] = []
    const publish: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      sideEffects: true,
      reversible: true,
      execute: async (input) => {
        calls.push('execute')
        return { url: `/entries/${input.id as string}` }
      },
      revert: async (receipt) => {
        calls.push('revert')
        revertReceipt.push(receipt)
      },
    }

    const result = await withSandbox(publish).execute({ id: 'e1' }, CTX)

    expect(calls).toEqual(['execute', 'revert'])
    expect(revertReceipt).toEqual([{ url: '/entries/e1' }])
    expect(result).toEqual({
      simulated: true,
      wouldHaveApplied: { url: '/entries/e1' },
      note: '"content.publish" ran against the copy and was immediately reverted — a simulated write.',
    })
  })

  it('includes a diff when a snapshot() function is supplied', async () => {
    let state = { count: 0 }
    const increment: ExecutableTool = {
      spec: { name: 'counter.increment', description: 'Increment.', inputSchema: {} },
      sideEffects: true,
      reversible: true,
      execute: async () => {
        state = { count: state.count + 1 }
        return { newCount: state.count }
      },
      revert: async () => {
        state = { count: state.count - 1 }
      },
    }

    const result = (await withSandbox(increment, { snapshot: async () => ({ ...state }) }).execute(
      {},
      CTX,
    )) as SandboxCallResult

    expect(result.diff).toEqual([{ path: 'count', kind: 'changed', before: 0, after: 1 }])
    expect(state).toEqual({ count: 0 })
  })

  it('omits diff when no snapshot() is supplied', async () => {
    const publish: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      sideEffects: true,
      reversible: true,
      execute: async () => ({ url: '/e1' }),
      revert: async () => undefined,
    }

    const result = (await withSandbox(publish).execute({}, CTX)) as SandboxCallResult

    expect(result.diff).toBeUndefined()
  })
})

describe('withSandboxForManifest', () => {
  it('wraps every tool in the manifest', async () => {
    const read: ExecutableTool = {
      spec: { name: 'content.read', description: 'Read.', inputSchema: {} },
      sideEffects: false,
      execute: async () => ({ ok: true }),
    }
    const irreversible: ExecutableTool = {
      spec: { name: 'deploy.trigger', description: 'Deploy.', inputSchema: {} },
      sideEffects: true,
      execute: async () => ({ ok: true }),
    }

    const [wrappedRead, wrappedDeploy] = withSandboxForManifest([read, irreversible])

    expect(await wrappedRead?.execute({}, CTX)).toEqual({ ok: true })
    expect(await wrappedDeploy?.execute({}, CTX)).toMatchObject({ simulated: false })
  })
})
