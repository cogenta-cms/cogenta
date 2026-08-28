import { describe, expect, it } from 'vitest'
import { EMPTY_EXISTING_SITE, type ExistingSiteSnapshot } from '../../src/site-plan/site-context.js'
import { detectStructuralGaps } from '../../src/site-plan/structural-gaps.js'

/** Fiche 60 task 5: a deterministic pass, never a model call. */

describe('detecting structural gaps', () => {
  it('suggests contact, legal and privacy on a plan that covers none of them', () => {
    const gaps = detectStructuralGaps({
      proposedPages: [{ title: 'Home', slug: 'home', purpose: 'x' }],
      existingSite: EMPTY_EXISTING_SITE,
    })

    expect(gaps.map((gap) => gap.topic).sort()).toEqual(['contact', 'legal', 'privacy'])
    // Every suggestion is refusable like any other item: it names itself.
    for (const gap of gaps) {
      expect(gap.id).toBe(gap.topic)
      expect(gap.title.length).toBeGreaterThan(0)
      expect(gap.slug.length).toBeGreaterThan(0)
      expect(gap.reason.length).toBeGreaterThan(0)
    }
  })

  it('does not suggest a page the plan already proposes', () => {
    const gaps = detectStructuralGaps({
      proposedPages: [
        { title: 'Contact', slug: 'contact', purpose: 'Reach us.' },
        { title: 'Mentions légales', slug: 'mentions', purpose: 'Legal.' },
      ],
      existingSite: EMPTY_EXISTING_SITE,
    })

    expect(gaps.map((gap) => gap.topic)).toEqual(['privacy'])
  })

  it('does not suggest a page an existing collection already covers', () => {
    const existingSite: ExistingSiteSnapshot = {
      ...EMPTY_EXISTING_SITE,
      collections: [
        {
          name: 'contact',
          labels: { singular: 'Contact message', plural: 'Contact messages' },
          fields: [],
          routed: false,
          entryCount: 0,
          publishedCount: null,
        },
      ],
    }

    const gaps = detectStructuralGaps({
      proposedPages: [],
      existingSite,
    })

    expect(gaps.map((gap) => gap.topic)).toEqual(['legal', 'privacy'])
  })

  it('suggests nothing once every topic is covered', () => {
    const gaps = detectStructuralGaps({
      proposedPages: [
        { title: 'Contact', slug: 'contact', purpose: 'x' },
        { title: 'Legal notice', slug: 'legal-notice', purpose: 'x' },
        { title: 'Privacy policy', slug: 'privacy-policy', purpose: 'x' },
      ],
      existingSite: EMPTY_EXISTING_SITE,
    })

    expect(gaps).toEqual([])
  })

  it('phrases a suggestion in French when the site is French', () => {
    const gaps = detectStructuralGaps({
      proposedPages: [],
      existingSite: EMPTY_EXISTING_SITE,
      locale: 'fr',
    })

    const legal = gaps.find((gap) => gap.topic === 'legal')
    expect(legal?.title).toBe('Mentions légales')
    expect(legal?.slug).toBe('mentions-legales')
  })
})
