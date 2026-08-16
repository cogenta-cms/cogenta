import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractDocumentText } from '../../src/documents/extract-text.js'
import { detectConstraints } from '../../src/site-plan/constraints.js'

/**
 * Read from the real corpus, not from strings invented for the assertion:
 * the point of the scanner is that it works on how people actually write,
 * and a fixture written to match the regex proves the regex matches itself.
 */
const CORPUS = join(fileURLToPath(new URL('..', import.meta.url)), 'documents', 'corpus')

async function constraintsOf(filename: string) {
  const document = extractDocumentText({
    filename,
    bytes: await readFile(join(CORPUS, filename)),
  })
  return detectConstraints({ text: document.text, source: filename })
}

describe('reading explicit constraints out of a real brief', () => {
  it('finds every exclusion a French restaurant brief states, with the sentence it came from', async () => {
    const found = await constraintsOf('restaurant-brief.md')

    const excluded = found.filter((entry) => entry.kind === 'exclusion').map((entry) => entry.topic)
    expect(excluded).toContain('blog')
    expect(excluded).toContain('ecommerce')

    const blog = found.find((entry) => entry.topic === 'blog')
    expect(blog?.quote).toContain('Pas de blog')
    expect(blog?.source).toBe('restaurant-brief.md')
  })

  it('reads "en français uniquement" as an exhaustive locale constraint', async () => {
    const found = await constraintsOf('restaurant-brief.md')

    const language = found.find((entry) => entry.kind === 'language')
    expect(language?.locales).toEqual(['fr'])
    // A single-locale statement is also an exclusion of multilingual.
    expect(found.some((e) => e.kind === 'exclusion' && e.topic === 'multilingual')).toBe(true)
  })

  it('reads a bilingual statement as two allowed locales, not as an exclusion', async () => {
    const found = await constraintsOf('photographer-brief.txt')

    const language = found.find((entry) => entry.kind === 'language')
    expect(language?.locales).toEqual(['fr', 'en'])
    expect(found.some((e) => e.kind === 'exclusion' && e.topic === 'multilingual')).toBe(false)
  })

  it('finds the exclusions of a CP-1252 plain-text brief', async () => {
    const found = await constraintsOf('photographer-brief.txt')

    const excluded = found.filter((entry) => entry.kind === 'exclusion').map((entry) => entry.topic)
    expect(excluded).toContain('ecommerce')
    expect(excluded).toContain('comments')
  })

  it('finds the exclusions written inside a real DOCX', async () => {
    const found = await constraintsOf('association-brief.docx')

    const excluded = found.filter((entry) => entry.kind === 'exclusion').map((entry) => entry.topic)
    expect(excluded).toContain('blog')
    expect(excluded).toContain('membership')
    expect(found.find((entry) => entry.kind === 'language')?.locales).toEqual(['fr'])
  })

  it('finds the exclusions written inside a real PDF', async () => {
    const found = await constraintsOf('saas-spec.pdf')

    const excluded = found.filter((entry) => entry.kind === 'exclusion').map((entry) => entry.topic)
    expect(excluded).toContain('blog')
    expect(found.find((entry) => entry.kind === 'language')?.locales).toEqual(['en'])
  })

  it('reads badly written phone notes, shouting and abbreviations included', async () => {
    const found = await constraintsOf('messy-notes.txt')

    const excluded = found.filter((entry) => entry.kind === 'exclusion').map((entry) => entry.topic)
    expect(excluded).toContain('forum')
    const required = found.filter((entry) => entry.kind === 'requirement').map((e) => e.topic)
    expect(required).toContain('events')
  })
})

describe('not inventing a constraint that is not there', () => {
  it('does not treat a mention of a feature as a constraint about it', () => {
    const found = detectConstraints({
      text: 'Nous publions un blog depuis 2019 et il marche bien. Le site aura une boutique.',
      source: 'note.txt',
    })

    expect(found).toEqual([])
  })

  it('does not let a negation reach past an adversative into the next clause', () => {
    const found = detectConstraints({
      text: 'Pas de blog, mais un agenda des événements est indispensable.',
      source: 'note.txt',
    })

    expect(found.filter((e) => e.kind === 'exclusion').map((e) => e.topic)).toEqual(['blog'])
    expect(found.some((e) => e.kind === 'exclusion' && e.topic === 'events')).toBe(false)
  })

  it('does not read a language mention as an exhaustive language constraint', () => {
    const found = detectConstraints({
      text: 'Le site sera en français. Nous ajouterons peut-être une version anglaise plus tard.',
      source: 'note.txt',
    })

    expect(found.some((entry) => entry.kind === 'language')).toBe(false)
  })

  it('does not exclude a topic named before the negation in the same sentence', () => {
    const found = detectConstraints({
      text: "L'agenda est le cœur du site ; pas de commentaires dessus.",
      source: 'note.txt',
    })

    expect(found.filter((e) => e.kind === 'exclusion').map((e) => e.topic)).toEqual(['comments'])
  })
})
