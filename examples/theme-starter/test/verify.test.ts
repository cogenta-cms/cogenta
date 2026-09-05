import { fileURLToPath } from 'node:url'
import { inspectTheme } from '@cogenta/render'
import { describe, expect, it } from 'vitest'
import manifest from '../theme.config.js'

/**
 * The same "cannot rot" guarantee `docs/guide-plugin.md` holds
 * `examples/plugin-starter/` to: this starter is checked against contract
 * D's real installation gate (`inspectTheme`, the function `cogenta serve`
 * itself runs on every theme before it's allowed to render a page), not
 * merely read by a human. If a future contract D change ever breaks this
 * starter, this test fails in CI instead of a downloader finding out first.
 */

const themeRoot = fileURLToPath(new URL('..', import.meta.url))

describe('the theme starter', () => {
  it('declares all seventeen vocabulary blocks and passes the real installation check', async () => {
    const inspection = await inspectTheme({ root: themeRoot, manifest })

    expect(inspection.missingBlocks).toEqual([])
    expect(inspection.findings).toEqual([])
    expect(inspection.ok).toBe(true)
    // A sanity floor, not an exact count: catches "the scanner silently
    // walked past src/" without pinning this test to the file count.
    expect(inspection.filesScanned).toBeGreaterThanOrEqual(19)
  })
})
