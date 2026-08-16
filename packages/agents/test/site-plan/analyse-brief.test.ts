import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type ExtractedDocument, extractDocumentText } from '../../src/documents/extract-text.js'
import { analyseBrief } from '../../src/site-plan/analyse-brief.js'
import { failingClient, scriptedClient } from './fake-client.js'

const CORPUS = join(fileURLToPath(new URL('..', import.meta.url)), 'documents', 'corpus')

async function load(filename: string): Promise<ExtractedDocument> {
  return extractDocumentText({ filename, bytes: await readFile(join(CORPUS, filename)) })
}

function briefJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    activity: 'A neighbourhood restaurant in Lyon serving a seasonal menu.',
    audience: 'Local diners who currently phone to ask for the day’s menu.',
    tone: 'Warm and familial, no gastronomic jargon.',
    languages: ['fr'],
    pages: [
      { title: 'Accueil', purpose: 'Show the menu of the day.' },
      { title: 'La carte', purpose: 'The full menu with allergens.' },
      { title: 'Contact', purpose: 'Opening hours and directions.' },
    ],
    contentTypes: [
      { name: 'plat', description: 'One dish on the menu, with its allergens.' },
      { name: 'page', description: 'A standing page.' },
    ],
    constraints: [
      { kind: 'exclusion', topic: 'blog', quote: 'Pas de blog.' },
      { kind: 'language', topic: 'fr', quote: 'Le site doit être en français uniquement.' },
    ],
    summary: 'A small showcase site for a restaurant, menu first, mobile first.',
    ...overrides,
  })
}

describe('analysing a real brief', () => {
  it('returns the structure the model described, keyed to the documents it read', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = scriptedClient([briefJson()])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.brief.activity).toContain('restaurant')
    expect(result.brief.languages).toEqual(['fr'])
    expect(result.brief.sources).toEqual([
      {
        filename: 'restaurant-brief.md',
        format: 'markdown',
        characters: document.characters,
        truncated: false,
      },
    ])
  })

  it('carries every constraint the document states even when the model reports none', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = scriptedClient([briefJson({ constraints: [] })])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const excluded = result.brief.constraints
      .filter((entry) => entry.kind === 'exclusion')
      .map((entry) => entry.topic)
    expect(excluded).toContain('blog')
    expect(excluded).toContain('ecommerce')
    expect(result.brief.constraints.find((e) => e.kind === 'language')?.locales).toEqual(['fr'])
  })

  it('overrides a locale list that contradicts the document, and says it did', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = scriptedClient([briefJson({ languages: ['fr', 'en', 'de'] })])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.brief.languages).toEqual(['fr'])
    expect(result.brief.warnings.join(' ')).toContain('en, de')
  })

  it('refuses a constraint the model did not quote from any document', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = scriptedClient([
      briefJson({
        constraints: [
          { kind: 'exclusion', topic: 'newsletter', quote: 'The client hates newsletters.' },
        ],
      }),
    ])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.brief.constraints.some((entry) => entry.topic === 'newsletter')).toBe(false)
  })

  it('surfaces the extraction warnings of the documents it read', async () => {
    const document = await load('photographer-brief.txt')
    const { client } = scriptedClient([briefJson({ languages: ['fr', 'en'] })])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.brief.warnings.join(' ')).toContain('CP-1252')
  })
})

describe('when the model misbehaves', () => {
  it('retries with the validation failure as the correction, then succeeds', async () => {
    const document = await load('restaurant-brief.md')
    const { client, requests } = scriptedClient([
      'Here you go!',
      JSON.stringify({ activity: 'x' }),
      briefJson(),
    ])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attempts).toBe(3)
    const lastAsk = requests[2]?.messages.at(-1)?.content ?? ''
    expect(lastAsk).toContain('previous attempt was rejected')
  })

  it('gives up with a reason rather than returning a half-brief', async () => {
    const document = await load('restaurant-brief.md')
    const { client } = scriptedClient(['not json at all'])

    const result = await analyseBrief({ client, model: 'm', documents: [document], maxAttempts: 2 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.attempts).toBe(2)
    expect(result.reason).toContain('JSON')
  })

  it('reports an unreachable provider instead of throwing at the caller', async () => {
    const document = await load('restaurant-brief.md')

    const result = await analyseBrief({
      client: failingClient('401 invalid api key'),
      model: 'm',
      documents: [document],
      maxAttempts: 1,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('401 invalid api key')
  })

  it('refuses to run at all with no document', async () => {
    const { client } = scriptedClient([briefJson()])

    await expect(analyseBrief({ client, model: 'm', documents: [] })).rejects.toMatchObject({
      code: 'SITE_BRIEF_GENERATION_FAILED',
    })
  })
})
