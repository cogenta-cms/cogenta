import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type ExtractedDocument, extractDocumentText } from '../../src/documents/extract-text.js'
import type { ChatRequest } from '../../src/providers/types.js'
import { resolveApprovedPlan, summarisePlan } from '../../src/site-plan/approval.js'
import { createMemorySitePlanStore } from '../../src/site-plan/draft-store.js'
import { proposeSitePlan } from '../../src/site-plan/propose-plan.js'
import { scriptedClient } from './fake-client.js'

/**
 * The whole L19 pipeline in one place, against a real document from the
 * corpus: upload → analyse → propose → review → approve. The provider is
 * scripted (no key, no network — R2 applies to this package's own tests
 * too), but everything between the requests is the real code, including
 * contract A validation, contract D validation and constraint enforcement.
 */

const CORPUS = join(fileURLToPath(new URL('..', import.meta.url)), 'documents', 'corpus')

async function load(filename: string): Promise<ExtractedDocument> {
  return extractDocumentText({ filename, bytes: await readFile(join(CORPUS, filename)) })
}

const BRIEF_JSON = JSON.stringify({
  activity: 'A neighbourhood restaurant in Lyon serving a seasonal menu.',
  audience: 'Local diners who phone to ask for the day’s menu.',
  tone: 'Warm and familial, no gastronomic jargon.',
  languages: ['fr'],
  pages: [
    { title: 'Accueil', purpose: 'Show the menu of the day.' },
    { title: 'La carte', purpose: 'The full menu.' },
  ],
  contentTypes: [{ name: 'plat', description: 'One dish, with allergens.' }],
  constraints: [],
  summary: 'A small showcase site for a restaurant.',
})

// The model proposes a blog anyway, which the document rules out twice over.
const MODEL_JSON = JSON.stringify({
  collections: [
    {
      name: 'dish',
      labels: { singular: 'Plat', plural: 'Plats' },
      routing: { pattern: '/carte/:slug' },
      fields: {
        title: { kind: 'text', required: true, options: { max: 200 } },
        slug: { kind: 'slug', unique: true, options: { from: 'title' } },
        allergens: { kind: 'select', options: { options: ['gluten', 'lait'], many: true } },
      },
      permissions: { read: ['public'], create: ['editor'] },
      rationale: 'The menu is the point of the site.',
    },
    {
      name: 'post',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: { title: { kind: 'text', required: true } },
      permissions: { read: ['public'] },
      rationale: 'A blog to share seasonal recipes.',
    },
  ],
  pages: [
    { title: 'Accueil', slug: 'home', purpose: 'Menu of the day.' },
    { title: 'Actualités', slug: 'actualites', purpose: 'Recipes and news.' },
  ],
})

const DEMO_JSON = JSON.stringify({
  entries: [
    { collection: 'dish', values: { title: 'Velouté de courge', slug: 'veloute-de-courge' } },
    { collection: 'dish', values: { title: 'Poulet fermier', slug: 'poulet-fermier' } },
    { collection: 'post', values: { title: 'Ce que devient le blog' } },
  ],
})

const TOKENS = {
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
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'ease', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.08)', md: '0 6px 24px rgba(0,0,0,.12)' },
}

const SKIN_ACCENTS: Readonly<Record<string, string>> = {
  'Warm and editorial': '#b45309',
  'Clean and clinical': '#1d4ed8',
  'Bold and graphic': '#7c2d12',
}

/** Routes each request to the right canned answer by what it asks for. */
function planner() {
  return scriptedClient([
    (request: ChatRequest) => {
      const prompt = request.messages.at(-1)?.content ?? ''
      if (prompt.includes('visual design tokens')) {
        const label =
          Object.keys(SKIN_ACCENTS).find((name) => prompt.includes(name)) ?? 'Warm and editorial'
        return JSON.stringify({
          ...TOKENS,
          color: { ...TOKENS.color, accent: SKIN_ACCENTS[label] ?? '#1d4ed8' },
        })
      }
      if (prompt.includes('demonstration content')) return DEMO_JSON
      if (prompt.includes('content model of a Cogenta CMS site')) return MODEL_JSON
      return BRIEF_JSON
    },
  ])
}

describe('the whole pipeline, from an uploaded document to an approved plan', () => {
  it('proposes a plan whose every part traces back to the document', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = planner()

    const result = await proposeSitePlan({
      client,
      model: 'm',
      documents: [document],
      siteName: 'Le Petit Marché',
      skinCount: 3,
      idFactory: () => 'draft-1',
      now: () => new Date('2026-08-16T09:00:00Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { draft } = result
    expect(draft.id).toBe('draft-1')
    expect(draft.brief.languages).toEqual(['fr'])
    expect(draft.skins).toHaveLength(3)
    expect(draft.pages.map((page) => page.slug)).toEqual(['home'])
  })

  it('removes what the document ruled out before a human ever sees the plan', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = planner()

    const result = await proposeSitePlan({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The model proposed a `post` collection and an "Actualités" page; the
    // brief says "Pas de blog" twice over.
    expect(result.draft.contentModel.collections.map((c) => c.definition.name)).toEqual(['dish'])
    expect(result.draft.pages.map((page) => page.slug)).toEqual(['home'])
    expect(result.draft.violations).toHaveLength(2)
    expect(result.draft.violations.every((v) => v.action === 'removed')).toBe(true)
    // The demo entry for the removed collection is dropped too, and said so.
    expect(result.draft.demoContent.map((entry) => entry.collection)).toEqual(['dish', 'dish'])
    expect(result.draft.warnings.join(' ')).toContain('"post"')
  })

  it('walks a real review: store, decide item by item, resolve', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = planner()
    const store = createMemorySitePlanStore()

    const proposed = await proposeSitePlan({
      client,
      model: 'm',
      documents: [document],
      skinCount: 2,
      idFactory: () => 'draft-1',
    })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    await store.save(proposed.draft)

    // A human walking the sections: every item gets its own answer.
    const sections = summarisePlan(proposed.draft)
    const decisions: Record<string, 'accepted' | 'rejected'> = {}
    for (const section of sections) {
      for (const [index, item] of section.items.entries()) {
        decisions[item.id] =
          section.mode === 'one-of' ? (index === 1 ? 'accepted' : 'rejected') : 'accepted'
      }
    }
    await store.recordDecisions('draft-1', decisions)

    const stored = await store.get('draft-1')
    const approved = resolveApprovedPlan(stored.draft, stored.decisions)

    expect(approved.collections.map((collection) => collection.name)).toEqual(['dish'])
    expect(approved.skinId).toBe(proposed.draft.skins[1]?.id)
    expect(approved.locales).toEqual(['fr'])
    expect(approved.demoContent).toHaveLength(2)

    await store.markApplied('draft-1', '2026-08-16T11:00:00.000Z')
    expect((await store.get('draft-1')).appliedAt).toBe('2026-08-16T11:00:00.000Z')
  })

  it('says which stage failed rather than returning half a plan', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = scriptedClient(['not json'])

    const result = await proposeSitePlan({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('brief')
  })
})
