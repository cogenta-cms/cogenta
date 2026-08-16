import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import type { DetectedConstraint } from '../../src/site-plan/constraints.js'
import {
  enforceOnContentModel,
  enforceOnLanguages,
  enforceOnPages,
} from '../../src/site-plan/enforce.js'
import type { ContentModelProposal, ProposedPage } from '../../src/site-plan/types.js'

const noBlog: DetectedConstraint = {
  kind: 'exclusion',
  topic: 'blog',
  quote: 'Pas de blog. Nous n’aurons jamais le temps d’écrire des articles.',
  source: 'restaurant-brief.md',
}

const frenchOnly: DetectedConstraint = {
  kind: 'language',
  locales: ['fr'],
  quote: 'Le site doit être en français uniquement.',
  source: 'restaurant-brief.md',
}

function proposal(...names: readonly string[]): ContentModelProposal {
  return {
    collections: names.map((name) => ({
      definition: defineCollection({
        name,
        labels: { singular: name, plural: `${name}s` },
        fields: { title: f.text({ required: true }) },
        permissions: { read: ['public'] },
      }),
      rationale: `Proposed for ${name}.`,
    })),
  }
}

describe('enforcing an exclusion on a proposed content model', () => {
  it('removes a collection whose very name is the excluded topic, whatever the model called it', () => {
    for (const name of ['post', 'article', 'actualite', 'news', 'blog']) {
      const result = enforceOnContentModel(proposal(name, 'page'), [noBlog])

      expect(result.proposal.collections.map((c) => c.definition.name)).toEqual(['page'])
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]?.action).toBe('removed')
      expect(result.violations[0]?.explanation).toContain('Pas de blog')
    }
  })

  it('leaves a proposal that respects the constraint completely untouched', () => {
    const input = proposal('dish', 'page')

    const result = enforceOnContentModel(input, [noBlog, frenchOnly])

    expect(result.proposal.collections).toEqual(input.collections)
    expect(result.violations).toEqual([])
  })

  it('quotes the document in the explanation, so a human can check the removal was right', () => {
    const result = enforceOnContentModel(proposal('article'), [noBlog])

    expect(result.violations[0]?.constraint).toBe(noBlog)
    expect(result.violations[0]?.proposed).toBe('collection "article"')
  })
})

describe('enforcing an exclusion on proposed pages', () => {
  it('removes a page whose title or slug is about the excluded topic', () => {
    const pages: readonly ProposedPage[] = [
      { title: 'Accueil', slug: 'home', purpose: 'Landing.' },
      { title: 'Actualités', slug: 'actualites', purpose: 'News feed.' },
      { title: 'Le blog', slug: 'journal', purpose: 'Posts.' },
      { title: 'Contact', slug: 'contact', purpose: 'Reach us.' },
    ]

    const result = enforceOnPages(pages, [noBlog])

    expect(result.kept.map((page) => page.slug)).toEqual(['home', 'contact'])
    expect(result.violations).toHaveLength(2)
  })
})

describe('enforcing a language constraint', () => {
  it('drops every locale outside the exhaustive list the document states', () => {
    const result = enforceOnLanguages(['fr', 'en', 'de'], [frenchOnly])

    expect(result.kept).toEqual(['fr'])
    expect(result.violations[0]?.explanation).toContain('en, de')
  })

  it('falls back to the constrained locales rather than leaving a site with none', () => {
    const result = enforceOnLanguages(['de'], [frenchOnly])

    expect(result.kept).toEqual(['fr'])
  })

  it('leaves the locales alone when the document states no language constraint', () => {
    const result = enforceOnLanguages(['fr', 'en'], [noBlog])

    expect(result.kept).toEqual(['fr', 'en'])
    expect(result.violations).toEqual([])
  })
})
