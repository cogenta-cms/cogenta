import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  type PlanDecisions,
  resolveApprovedPlan,
  summarisePlan,
} from '../../src/site-plan/approval.js'
import type { SitePlanDraft } from '../../src/site-plan/types.js'

const TOKENS_A = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' as const },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'ease', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.08)', md: '0 6px 24px rgba(0,0,0,.12)' },
}

function draft(): SitePlanDraft {
  return {
    id: 'draft-1',
    createdAt: '2026-08-16T09:00:00.000Z',
    brief: {
      activity: 'A neighbourhood restaurant.',
      audience: 'Local diners.',
      tone: 'Warm.',
      languages: ['fr'],
      pages: [],
      contentTypes: [],
      constraints: [
        { kind: 'exclusion', topic: 'blog', quote: 'Pas de blog.', source: 'brief.md' },
        { kind: 'language', locales: ['fr'], quote: 'En français uniquement.', source: 'brief.md' },
      ],
      summary: 'A small showcase site.',
      sources: [{ filename: 'brief.md', format: 'markdown', characters: 900, truncated: false }],
      warnings: [],
    },
    contentModel: {
      collections: [
        {
          definition: defineCollection({
            name: 'dish',
            labels: { singular: 'Dish', plural: 'Dishes' },
            fields: { title: f.text({ required: true }) },
            permissions: { read: ['public'] },
          }),
          rationale: 'The menu.',
        },
        {
          definition: defineCollection({
            name: 'page',
            labels: { singular: 'Page', plural: 'Pages' },
            fields: { title: f.text({ required: true }) },
            permissions: { read: ['public'] },
          }),
          rationale: 'Standing pages.',
        },
      ],
    },
    pages: [
      { title: 'La carte', slug: 'carte', purpose: 'The menu.' },
      { title: 'Contact', slug: 'contact', purpose: 'Reach us.' },
    ],
    skins: [
      {
        id: 'editorial',
        label: 'Warm editorial',
        rationale: 'Warm.',
        tokens: TOKENS_A,
        attempts: 1,
      },
      {
        id: 'clinical',
        label: 'Clean and clinical',
        rationale: 'Cool.',
        tokens: { ...TOKENS_A, color: { ...TOKENS_A.color, accent: '#047857' } },
        attempts: 1,
      },
    ],
    demoContent: [
      { collection: 'dish', values: { title: 'Velouté de courge' } },
      { collection: 'dish', values: { title: 'Poulet fermier' } },
    ],
    violations: [],
    warnings: [],
  }
}

function allItemIds(): readonly string[] {
  return summarisePlan(draft()).flatMap((section) => section.items.map((item) => item.id))
}

function decideAll(value: 'accepted' | 'rejected'): PlanDecisions {
  return Object.fromEntries(allItemIds().map((id) => [id, value]))
}

describe('presenting a plan for review', () => {
  it('breaks the plan into sections whose items are each judged on their own', () => {
    const sections = summarisePlan(draft())

    expect(sections.map((section) => section.id)).toEqual([
      'brief',
      'contentModel',
      'pages',
      'skin',
      'demoContent',
    ])
    expect(sections.find((s) => s.id === 'contentModel')?.items.map((i) => i.id)).toEqual([
      'contentModel:dish',
      'contentModel:page',
    ])
    // The designs are alternatives, and the section says so.
    expect(sections.find((s) => s.id === 'skin')?.mode).toBe('one-of')
  })

  it('shows every constraint with the sentence and file it came from, so a misreading is catchable', () => {
    const brief = summarisePlan(draft()).find((section) => section.id === 'brief')

    expect(brief?.items[1]?.title).toBe('No blog')
    expect(brief?.items[1]?.detail).toContain('Read from brief.md: “Pas de blog.”')
  })

  it('shows what each collection actually contains, not only its name', () => {
    const model = summarisePlan(draft()).find((section) => section.id === 'contentModel')

    expect(model?.items[0]?.detail).toContain('title (text)')
  })

  it('shows the proposed permissions on every collection, not just its fields and rationale', () => {
    // `permissions` is entirely the model's own choice — nothing in the
    // brief names a role — so a legitimate but surprising grant has to be
    // visible here even when it is not the unsafe shape `buildCollection`
    // already refuses outright.
    const model = summarisePlan(draft()).find((section) => section.id === 'contentModel')

    expect(model?.items[0]?.detail).toContain('Permissions:')
    expect(model?.items[0]?.detail).toContain('read: public')
  })

  it('shows a proposed routing pattern when the collection has one', () => {
    const withRouting: SitePlanDraft = {
      ...draft(),
      contentModel: {
        collections: [
          {
            definition: defineCollection({
              name: 'dish',
              labels: { singular: 'Dish', plural: 'Dishes' },
              routing: { pattern: '/carte/:slug' },
              fields: {
                title: f.text({ required: true }),
                slug: f.slug({ from: 'title' }),
              },
              permissions: { read: ['public'] },
            }),
            rationale: 'The menu.',
          },
        ],
      },
    }

    const model = summarisePlan(withRouting).find((section) => section.id === 'contentModel')

    expect(model?.items[0]?.detail).toContain('Routed at /carte/:slug')
  })
})

describe('there is no "accept everything"', () => {
  it('refuses to resolve a plan with a single undecided item, naming it', () => {
    const decisions = { ...decideAll('accepted') }
    delete (decisions as Record<string, unknown>)['pages:contact']

    expect(() => resolveApprovedPlan(draft(), decisions)).toThrowError(
      expect.objectContaining({ code: 'SITE_PLAN_DECISION_MISSING' }),
    )
    try {
      resolveApprovedPlan(draft(), decisions)
    } catch (error) {
      expect((error as { message: string }).message).toContain('pages:contact')
    }
  })

  it('refuses a blanket decision id that stands for everything', () => {
    expect(() =>
      resolveApprovedPlan(draft(), { '*': 'accepted', all: 'accepted' } as PlanDecisions),
    ).toThrowError(expect.objectContaining({ code: 'SITE_PLAN_DECISION_UNKNOWN_ITEM' }))
  })

  it('refuses two accepted designs, because a design is a choice and not a checklist', () => {
    const decisions = { ...decideAll('rejected'), 'skin:editorial': 'accepted' as const }
    const both = { ...decisions, 'skin:clinical': 'accepted' as const }

    expect(() => resolveApprovedPlan(draft(), both)).toThrowError(
      expect.objectContaining({ code: 'SITE_PLAN_DECISION_UNKNOWN_ITEM' }),
    )
  })
})

describe('resolving what the human actually approved', () => {
  it('keeps only accepted collections, pages, demo entries and the single chosen design', () => {
    const decisions: PlanDecisions = {
      ...decideAll('rejected'),
      'brief:locales': 'accepted',
      'brief:constraint-0': 'accepted',
      'contentModel:dish': 'accepted',
      'pages:carte': 'accepted',
      'skin:clinical': 'accepted',
      'demoContent:0': 'accepted',
    }

    const approved = resolveApprovedPlan(draft(), decisions, () => new Date('2026-08-16T10:00:00Z'))

    expect(approved.collections.map((c) => c.name)).toEqual(['dish'])
    expect(approved.pages.map((p) => p.slug)).toEqual(['carte'])
    expect(approved.skinId).toBe('clinical')
    expect(approved.demoContent).toHaveLength(1)
    expect(approved.locales).toEqual(['fr'])
    expect(approved.constraints).toEqual([{ quote: 'Pas de blog.', source: 'brief.md' }])
    expect(approved.decidedAt).toBe('2026-08-16T10:00:00.000Z')
  })

  it('records what was refused, not only what was kept', () => {
    const decisions: PlanDecisions = {
      ...decideAll('rejected'),
      'contentModel:dish': 'accepted',
    }

    const approved = resolveApprovedPlan(draft(), decisions)

    expect(approved.rejected).toContain('contentModel:page')
    expect(approved.rejected).toContain('skin:editorial')
    expect(approved.skinId).toBeUndefined()
  })

  it('produces an empty plan when everything is refused, rather than falling back to a default', () => {
    const approved = resolveApprovedPlan(draft(), decideAll('rejected'))

    expect(approved.collections).toEqual([])
    expect(approved.pages).toEqual([])
    expect(approved.skin).toBeUndefined()
    expect(approved.demoContent).toEqual([])
    expect(approved.locales).toEqual([])
  })
})
