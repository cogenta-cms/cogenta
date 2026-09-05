import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SkinTokens } from '@cogenta/render'
import { validateSkin } from '@cogenta/render'
import { afterEach, describe, expect, it } from 'vitest'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'
import { scaffoldSite } from '../src/scaffold.js'

function requiredSkin(blueprintId: string): SkinTokens {
  const tokens = STARTING_SKINS[blueprintId]
  if (tokens === undefined) throw new Error(`no starting skin for "${blueprintId}"`)
  return tokens
}

/**
 * L22 task 10: "chacun avec un skin de départ cohérent avec le type de
 * site." These are fixed token sets, not AI output, so they must clear the
 * exact same gate a generated skin does (contract D) — the same discipline
 * `skin-validation-corpus.test.ts` holds an AI-produced skin to.
 */
describe('per-blueprint starting skins', () => {
  it('every starting skin passes the real contract-D validation gate', () => {
    for (const [blueprintId, tokens] of Object.entries(STARTING_SKINS)) {
      expect(() => validateSkin(tokens), blueprintId).not.toThrow()
    }
  })

  it('offers one for each of the three site types this task adds', () => {
    expect(Object.keys(STARTING_SKINS).sort()).toEqual(['magazine', 'portfolio', 'store'])
  })

  it('gives each starting skin a distinct accent colour, not three copies of one palette', () => {
    const accents = new Set(Object.values(STARTING_SKINS).map((tokens) => tokens.color.accent))
    expect(accents.size).toBe(Object.keys(STARTING_SKINS).length)
  })
})

describe('scaffoldSite — starting skin selection', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it.each(['portfolio', 'magazine', 'store'] as const)(
    'writes the %s blueprint’s own starting skin, not the theme’s generic default',
    async (blueprintId) => {
      const targetDir = await mkdtemp(join(tmpdir(), `cogenta-scaffold-skin-${blueprintId}-`))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'Skin check',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId,
      })

      expect(result.skinSource).toBe('preset')
      const written = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
      expect(written).toEqual(requiredSkin(blueprintId))
    },
    // `store` (L25 task A0b) now renders and ingests 7 real demo images
    // through the real media pipeline during this same `scaffoldSite` call
    // — measured at ~25-30s end to end (see `store-blueprint.test.ts`'s own
    // note). Genuinely slower than the default 5s, not a hang.
    60_000,
  )

  it('keeps using the theme’s generic default for a blueprint with no starting skin of its own', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-skin-restaurant-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'Skin check',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'restaurant',
    })

    expect(result.skinSource).toBe('default')
  })

  it('an explicitly generated skin still wins over a blueprint’s starting skin', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-skin-generated-'))
    dirs.push(targetDir)

    const portfolio = requiredSkin('portfolio')
    const generated: SkinTokens = {
      ...portfolio,
      color: { ...portfolio.color, accent: '#2563eb' },
    }

    const result = await scaffoldSite({
      targetDir,
      siteName: 'Skin check',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
      skinTokens: generated,
    })

    expect(result.skinSource).toBe('generated')
    const written = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(written.color.accent).toBe('#2563eb')
  })
})
