import { FIELD_KINDS } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import type { DetectedConstraint } from '../../src/site-plan/constraints.js'
import { proposeContentModel } from '../../src/site-plan/content-model.js'
import type { SiteBrief } from '../../src/site-plan/types.js'
import { scriptedClient } from './fake-client.js'

const noBlog: DetectedConstraint = {
  kind: 'exclusion',
  topic: 'blog',
  quote: 'Pas de blog.',
  source: 'brief.md',
}

function brief(constraints: readonly DetectedConstraint[] = []): SiteBrief {
  return {
    activity: 'A neighbourhood restaurant serving a seasonal menu.',
    audience: 'Local diners.',
    tone: 'Warm and familial.',
    languages: ['fr'],
    pages: [{ title: 'La carte', purpose: 'The menu.' }],
    contentTypes: [{ name: 'plat', description: 'One dish.' }],
    constraints,
    summary: 'A small restaurant showcase site.',
    sources: [{ filename: 'brief.md', format: 'markdown', characters: 900, truncated: false }],
    warnings: [],
  }
}

function proposalJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    collections: [
      {
        name: 'dish',
        labels: { singular: 'Dish', plural: 'Dishes' },
        routing: { pattern: '/carte/:slug' },
        fields: {
          title: { kind: 'text', required: true, options: { max: 200 } },
          slug: { kind: 'slug', unique: true, options: { from: 'title' } },
          price: { kind: 'number', options: { min: 0 } },
          course: { kind: 'select', options: { options: ['entree', 'plat', 'dessert'] } },
          photo: { kind: 'media', options: { accept: ['image'] } },
        },
        permissions: { read: ['public'], create: ['editor', 'admin'], delete: ['admin'] },
        rationale: 'The menu is the point of the site.',
      },
    ],
    pages: [{ title: 'Contact', slug: 'contact', purpose: 'Phone and directions.' }],
    ...overrides,
  })
}

describe('proposing a content model', () => {
  it('returns real contract A collections, with the constructors’ own defaults filled in', async () => {
    const { client } = scriptedClient([proposalJson()])

    const result = await proposeContentModel({ client, model: 'm', brief: brief() })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const dish = result.proposal.collections[0]?.definition
    expect(dish?.name).toBe('dish')
    // `f.media()` materialises `accept` and `many`; a hand-built object would not.
    expect(dish?.fields.photo?.options).toEqual({ accept: ['image'], many: false })
    // `f.select()` widens bare strings into {value}.
    expect(dish?.fields.course?.options).toEqual({
      options: [{ value: 'entree' }, { value: 'plat' }, { value: 'dessert' }],
      many: false,
    })
    expect(result.pages.map((page) => page.slug)).toEqual(['contact'])
  })

  it('offers the model exactly the field kinds contract A declares, read from the contract', async () => {
    const { client, requests } = scriptedClient([proposalJson()])

    await proposeContentModel({ client, model: 'm', brief: brief() })

    const prompt = requests[0]?.messages[0]?.content ?? ''
    for (const kind of FIELD_KINDS) expect(prompt).toContain(`"${kind}"`)
    expect(prompt).toContain('This list is closed')
  })

  it('rejects an invented field kind through the schema, not through a hand-written check', async () => {
    const { client } = scriptedClient([
      proposalJson({
        collections: [
          {
            name: 'dish',
            labels: { singular: 'Dish', plural: 'Dishes' },
            fields: { price: { kind: 'currency' } },
            permissions: { read: ['public'] },
            rationale: 'x',
          },
        ],
      }),
    ])

    const result = await proposeContentModel({
      client,
      model: 'm',
      brief: brief(),
      maxAttempts: 1,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('kind')
  })

  it('feeds the real defineCollection failure back as the next attempt’s correction', async () => {
    const broken = JSON.stringify({
      collections: [
        {
          name: 'dish',
          labels: { singular: 'Dish', plural: 'Dishes' },
          // Routed with `:slug` but no slug field — a real contract A rule.
          routing: { pattern: '/carte/:slug' },
          fields: { title: { kind: 'text', required: true } },
          permissions: { read: ['public'] },
          rationale: 'x',
        },
      ],
      pages: [],
    })
    const { client, requests } = scriptedClient([broken, proposalJson()])

    const result = await proposeContentModel({ client, model: 'm', brief: brief() })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attempts).toBe(2)
    const second = requests[1]?.messages[0]?.content ?? ''
    expect(second).toContain('previous attempt was rejected')
    expect(second.toLowerCase()).toContain('slug')
  })
})

describe('a proposal that contradicts an explicit constraint', () => {
  it('never reaches the human: the offending collection is removed and reported', async () => {
    const { client } = scriptedClient([
      proposalJson({
        collections: [
          {
            name: 'post',
            labels: { singular: 'Post', plural: 'Posts' },
            fields: { title: { kind: 'text', required: true } },
            permissions: { read: ['public'] },
            rationale: 'A blog to share seasonal recipes.',
          },
          {
            name: 'dish',
            labels: { singular: 'Dish', plural: 'Dishes' },
            fields: { title: { kind: 'text', required: true } },
            permissions: { read: ['public'] },
            rationale: 'The menu.',
          },
        ],
        pages: [
          { title: 'Actualités', slug: 'actualites', purpose: 'News.' },
          { title: 'Contact', slug: 'contact', purpose: 'Reach us.' },
        ],
      }),
    ])

    const result = await proposeContentModel({ client, model: 'm', brief: brief([noBlog]) })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.proposal.collections.map((c) => c.definition.name)).toEqual(['dish'])
    expect(result.pages.map((page) => page.slug)).toEqual(['contact'])
    expect(result.violations).toHaveLength(2)
    expect(result.violations[0]?.explanation).toContain('Pas de blog')
  })

  it('states the constraint in the prompt as non-negotiable, quoting the document', async () => {
    const { client, requests } = scriptedClient([proposalJson()])

    await proposeContentModel({ client, model: 'm', brief: brief([noBlog]) })

    const prompt = requests[0]?.messages[0]?.content ?? ''
    expect(prompt).toContain('not negotiable')
    expect(prompt).toContain('Pas de blog.')
  })
})
