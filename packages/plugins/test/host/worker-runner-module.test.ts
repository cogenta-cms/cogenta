import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runIsolatedModule } from '../../src/host/worker-runner.js'

/**
 * Fiche 73 task 3 — the sizing this test exists to prove, not just assert:
 * piège n°1 (`docs/plans/73-themes-locaux-bac-a-sable-ia.md` § 6) named
 * "an HtmlElement tree crossing the worker boundary" as the fiche's one real
 * technical unknown. It turns out not to be the hard part — it is plain
 * data, and `toSerializable`'s existing JSON round-trip (already proven by
 * every `runIsolated` test in this directory) handles it identically. The
 * actual unknown, proven here instead, is that a theme's `RenderContext` is
 * NOT plain data: it carries live, host-bound methods a theme calls DURING
 * rendering (`ctx.t()`, `ctx.content.entry()`). This suite proves the
 * callback RPC that stands in for that — and, just as important, documents
 * the real, weaker isolation guarantee `runIsolatedModule` carries relative
 * to `runIsolated`'s `vm`-sandboxed classic scripts.
 */

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

function fixtureUrl(name: string): URL {
  return pathToFileURL(join(FIXTURES_DIR, name))
}

describe('runIsolatedModule', () => {
  it('imports a real ES module and calls a named export, returning a JSON-safe value', async () => {
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('env-check-fixture.mjs'),
      exportName: 'checkEnv',
      args: [],
    })
    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ envKeys: [], value: null })
  })

  it('the plain HtmlElement-shaped tree a render function returns survives the boundary byte for byte', async () => {
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('render-tree-fixture.mjs'),
      exportName: 'renderPage',
      args: ['My page'],
      callbacks: {
        t: async () => 'Bonjour',
        'content.entry': async () => ({ title: 'Welcome' }),
      },
    })
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({
      tag: 'main',
      attrs: { class: 'cg-main' },
      children: [
        { tag: 'h1', attrs: {}, children: ['My page'] },
        { tag: 'p', attrs: {}, children: ['Bonjour'] },
        { tag: 'p', attrs: {}, children: ['Welcome'] },
      ],
    })
  })

  it('a host callback the module calls but that was never registered is refused, not silently undefined', async () => {
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('render-tree-fixture.mjs'),
      exportName: 'renderPage',
      args: ['My page'],
      // 't' is missing on purpose — the module's own first `await
      // callbacks.t(...)` call must reject, proving the guest's
      // `buildCallbacks` only ever exposes exactly what the host named.
      callbacks: { 'content.entry': async () => ({ title: 'Welcome' }) },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('callbacks.t is not a function')
  })

  it('a host callback that throws surfaces its message back through the module, not a crash', async () => {
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('render-tree-fixture.mjs'),
      exportName: 'renderPage',
      args: ['My page'],
      callbacks: {
        t: async () => {
          throw new Error('translation catalog unavailable')
        },
        'content.entry': async () => ({ title: 'Welcome' }),
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('translation catalog unavailable')
  })

  it('a nonexistent export is a reported error, never a thrown host-side exception', async () => {
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('render-tree-fixture.mjs'),
      exportName: 'doesNotExist',
      args: [],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no exported function "doesNotExist"')
  })

  it('security: env is empty for a real module import too, same as a classic-script run', async () => {
    const previous = process.env.COGENTA_TEST_SECRET
    process.env.COGENTA_TEST_SECRET = 'top-secret-value'
    try {
      const result = await runIsolatedModule({
        moduleUrl: fixtureUrl('env-check-fixture.mjs'),
        exportName: 'checkEnv',
        args: [],
      })
      expect(result.ok).toBe(true)
      expect(JSON.stringify(result.value)).not.toContain('top-secret-value')
    } finally {
      if (previous === undefined) delete process.env.COGENTA_TEST_SECRET
      else process.env.COGENTA_TEST_SECRET = previous
    }
  })

  // The honest gap, proven rather than asserted in prose: unlike
  // `runIsolated`'s import-less `vm.Script`, a real `import()` here CAN
  // reach `node:fs` — there is no `vm` boundary in this worker refusing it.
  // This is exactly why `verifyTheme`'s static scan (task 1) must run
  // BEFORE a theme's `theme.render.*` is ever handed to `runIsolatedModule`
  // — this function alone is not, and was never claimed to be, a full
  // sandbox (ADR-0034's "point de vigilance").
  it("documents the real gap: a real import() can reach node:fs, unlike runIsolated's vm.Script — this is why verifyTheme must run first", async () => {
    const packageJsonPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'package.json',
    )
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('fs-reachable-fixture.mjs'),
      exportName: 'readPackageJson',
      args: [packageJsonPath],
    })
    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ content: expect.stringContaining('{') })
  })

  it('times out a hanging module export the same way runIsolated times out a hanging script', async () => {
    const result = await runIsolatedModule({
      moduleUrl: fixtureUrl('render-tree-fixture.mjs'),
      exportName: 'renderPage',
      args: ['My page'],
      // No 't' callback reply ever arrives (it never resolves), so the
      // module's own `await callbacks.t(...)` hangs forever — proving the
      // host-side timeout fires regardless of *why* the module never
      // finishes, same guarantee `runIsolated` already has.
      callbacks: { t: () => new Promise(() => {}) },
      timeoutMs: 50,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('timeout')
  })
})
