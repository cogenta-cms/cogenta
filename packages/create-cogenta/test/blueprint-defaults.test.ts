import { describe, expect, it } from 'vitest'
import {
  blueprintSettings,
  inferBlueprint,
  resolveBlueprintSettings,
} from '../src/blueprint-defaults.js'
import { BLUEPRINTS } from '../src/blueprints/registry.js'

describe('per-site-type defaults', () => {
  it('offers a recommendation for every site type', () => {
    for (const blueprint of BLUEPRINTS) {
      const settings = blueprintSettings(blueprint.id)

      expect(settings.blueprintId).toBe(blueprint.id)
      expect(settings.settings.length).toBeGreaterThan(0)
      // Every setting explains itself. A default nobody can judge is not a
      // default a human can confirm.
      for (const setting of settings.settings) {
        expect(setting.why.length).toBeGreaterThan(20)
        expect(setting.question.endsWith('?')).toBe(true)
      }
    }
  })

  it('recommends a longer page cache for a site that changes rarely than for one that changes hourly', () => {
    expect(blueprintSettings('documentation').pageMaxAge).toBeGreaterThan(
      blueprintSettings('magazine').pageMaxAge,
    )
    expect(blueprintSettings('portfolio').pageMaxAge).toBeGreaterThan(
      blueprintSettings('blog').pageMaxAge,
    )
  })

  it('never recommends HSTS, because a wrong answer takes a site offline for a year', () => {
    for (const blueprint of BLUEPRINTS) {
      const hsts = blueprintSettings(blueprint.id).settings.find((setting) => setting.id === 'hsts')

      expect(hsts?.recommended).toBe(false)
    }
  })

  it('does not offer to seed demo content for a site type that has none', () => {
    const blank = blueprintSettings('blank')

    expect(blank.settings.some((setting) => setting.id === 'seedDemoContent')).toBe(false)
    expect(blueprintSettings('restaurant').settings.some((s) => s.id === 'seedDemoContent')).toBe(
      true,
    )
  })

  it('falls back to blank for a site type it does not know, rather than inventing one', () => {
    expect(blueprintSettings('does-not-exist').blueprintId).toBe('blank')
  })
})

describe('applying the confirmed answers', () => {
  it('turns a refused page cache into zero seconds, not into the recommendation anyway', () => {
    const confirmed = resolveBlueprintSettings('documentation', { pageCache: false })

    expect(confirmed.pageMaxAge).toBe(0)
  })

  it('uses the recommendation for anything the human was not asked about', () => {
    const confirmed = resolveBlueprintSettings('documentation', {})

    expect(confirmed.pageMaxAge).toBe(blueprintSettings('documentation').pageMaxAge)
    expect(confirmed.hstsMaxAge).toBe(0)
    expect(confirmed.seedDemoContent).toBe(true)
  })

  it('never claims to seed demo content for a site type that has none, whatever the answer says', () => {
    expect(resolveBlueprintSettings('blank', { seedDemoContent: true }).seedDemoContent).toBe(false)
  })

  it('turns a confirmed HSTS answer into a real one-year max-age', () => {
    expect(resolveBlueprintSettings('vitrine', { hsts: true }).hstsMaxAge).toBe(31_536_000)
  })
})

describe('inferring a site type from a brief', () => {
  it('matches the obvious cases, in French and in English', () => {
    expect(
      inferBlueprint({ activity: 'Un restaurant de quartier à Lyon.', contentTypes: [] }),
    ).toBe('restaurant')
    expect(
      inferBlueprint({ activity: 'A wedding photographer in Bordeaux.', contentTypes: [] }),
    ).toBe('portfolio')
    expect(
      inferBlueprint({
        activity: 'Compliance workflow tooling for regulated fintechs.',
        contentTypes: [{ name: 'pricing' }],
      }),
    ).toBe('saas')
    expect(
      inferBlueprint({ activity: 'Une association loi 1901 pour les jeunes.', contentTypes: [] }),
    ).toBe('association')
    expect(
      inferBlueprint({
        activity: 'A small online store selling handmade ceramics.',
        contentTypes: [],
      }),
    ).toBe('store')
    expect(
      inferBlueprint({
        activity: 'Une boutique en ligne de vêtements pour enfants.',
        contentTypes: [],
      }),
    ).toBe('store')
  })

  it('reads the content types too, not only the activity sentence', () => {
    expect(inferBlueprint({ activity: 'Something vague.', contentTypes: [{ name: 'plat' }] })).toBe(
      'restaurant',
    )
  })

  it('returns nothing rather than guessing when the brief matches nothing', () => {
    expect(
      inferBlueprint({ activity: 'We move very heavy things.', contentTypes: [{ name: 'thing' }] }),
    ).toBeUndefined()
  })
})
