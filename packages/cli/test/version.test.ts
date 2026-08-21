import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { run } from '../src/index.js'
import { getCliVersion } from '../src/version.js'

/**
 * Real bug found while building `cogenta update` (L22 task 9): `bin.ts`
 * never passed `options.version` to `run()`, so `cogenta version`/`cogenta
 * --version` always printed the fallback `"0.0.0"` regardless of what was
 * actually installed. Fixed by reading it from this package's own
 * `package.json` (`readOwnPackageVersion`, `@cogenta/core`) and wiring it
 * through both `index.ts`'s `getCliVersion()` and `bin.ts`.
 */

describe('getCliVersion', () => {
  it('matches this package.json\'s own "version" field', async () => {
    const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version: string }
    expect(getCliVersion()).toBe(packageJson.version)
  })
})

describe('cogenta version', () => {
  it('prints the real installed version when the caller passes it through', async () => {
    const out: string[] = []
    const code = await run({
      argv: ['version'],
      stdout: (text) => void out.push(text),
      env: {},
      version: getCliVersion(),
    })
    expect(code).toBe(0)
    expect(out.join('').trim()).toBe(getCliVersion())
  })
})
