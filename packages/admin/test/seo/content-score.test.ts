import { describe, expect, it } from 'vitest'
import { analyseContent, type ContentCheckId } from '../../src/seo/content-score.js'

/**
 * The same suite as `@cogenta/seo`'s `content-analysis.test.ts`, run against
 * the admin's own duplicated copy of the algorithm (`content-score.ts`'s own
 * module comment explains why it is a duplicate rather than an import) — if
 * the two ever drift, this file is what catches it, not a code review.
 */

function paragraph(text: string, style: 'normal' | 'h2' | 'h3' | 'h4' = 'normal'): unknown {
  return {
    _key: `k-${text.slice(0, 8)}-${style}`,
    _type: 'block',
    style,
    children: [{ _key: 'span-1', _type: 'span', text, marks: [] }],
  }
}

function longGoodBody(): unknown {
  const filler = Array.from(
    { length: 28 },
    (_, index) => `Ce texte explique un point pratique pour organiser le sejour numero ${index}.`,
  ).join(' ')
  return [
    paragraph('Introduction', 'h2'),
    paragraph('Ce guide de voyage vous aide a preparer votre prochain depart.'),
    paragraph(
      `Notre guide de voyage couvre chaque etape du sejour. ${filler} Un dernier conseil de ce guide de voyage complet ici.`,
    ),
  ]
}

function checkOf(
  checks: ReturnType<typeof analyseContent>['checks'],
  id: ContentCheckId,
): ReturnType<typeof analyseContent>['checks'][number] | undefined {
  return checks.find((check) => check.id === id)
}

describe('admin analyseContent — keyword checks', () => {
  it('detects a focus keyword missing from the title', () => {
    const result = analyseContent({
      title: 'Un article sans rapport',
      description: 'Ce guide de voyage vous aide.',
      focusKeyword: 'guide de voyage',
      body: [paragraph('Ce guide de voyage est utile.')],
    })
    expect(checkOf(result.checks, 'keywordInTitle')?.passed).toBe(false)
  })

  it('passes the title check case- and accent-insensitively', () => {
    const result = analyseContent({
      title: 'Le Guide De Voyage Complet',
      focusKeyword: 'guide de voyage',
      body: [paragraph('Un guide de voyage détaillé.')],
    })
    expect(checkOf(result.checks, 'keywordInTitle')?.passed).toBe(true)
  })

  it('detects a focus keyword missing from the meta description', () => {
    const result = analyseContent({
      title: 'Guide de voyage',
      description: 'Une description qui ne mentionne rien de particulier.',
      focusKeyword: 'guide de voyage',
      body: [paragraph('Un guide de voyage détaillé.')],
    })
    expect(checkOf(result.checks, 'keywordInDescription')?.passed).toBe(false)
  })
})

describe('admin analyseContent — sentence length', () => {
  it('flags a sentence longer than the readability threshold', () => {
    const words = Array.from({ length: 30 }, (_, index) => `mot${index}`).join(' ')
    const result = analyseContent({ title: 'Titre', body: [paragraph(`${words}.`)] })
    const check = checkOf(result.checks, 'sentenceLength')
    expect(check?.passed).toBe(false)
    expect(check?.detail).toBe(30)
  })
})

describe('admin analyseContent — structure and length', () => {
  it('requires a subheading only once the article is long enough', () => {
    const short = analyseContent({
      title: 'Titre',
      body: [paragraph('Un texte court sans sous-titre.')],
    })
    expect(checkOf(short.checks, 'subheadings')?.passed).toBe(true)

    const long = analyseContent({
      title: 'Titre',
      body: [paragraph(Array.from({ length: 320 }, (_, i) => `mot${i}`).join(' '))],
    })
    expect(checkOf(long.checks, 'subheadings')?.passed).toBe(false)
  })

  it('detects a body shorter than the minimum word count', () => {
    const result = analyseContent({ title: 'Titre', body: [paragraph('Trop court.')] })
    expect(checkOf(result.checks, 'contentLength')?.passed).toBe(false)
  })
})

describe('admin analyseContent — focus keyword optionality', () => {
  it('omits the four keyword checks entirely when no focus keyword is given', () => {
    const result = analyseContent({ title: 'Titre', body: [paragraph('Un texte quelconque.')] })
    const keywordChecks: ContentCheckId[] = [
      'keywordInTitle',
      'keywordInDescription',
      'keywordInFirstSentence',
      'keywordDensity',
    ]
    for (const id of keywordChecks) expect(checkOf(result.checks, id)).toBeUndefined()
    expect(result.totalCount).toBe(3)
  })
})

describe('admin analyseContent — score', () => {
  it('reports green for a well-optimised article', () => {
    const result = analyseContent({
      title: 'Le meilleur guide de voyage pour débuter',
      description: 'Ce guide de voyage vous explique tout ce qu’il faut savoir.',
      focusKeyword: 'guide de voyage',
      body: longGoodBody(),
    })
    expect(result.score).toBe('green')
    expect(result.passedCount).toBe(result.totalCount)
  })

  it('reports red for an article missing almost everything', () => {
    const result = analyseContent({
      title: 'Sans rapport',
      focusKeyword: 'guide de voyage',
      body: [paragraph('Rien à voir ici.')],
    })
    expect(result.score).toBe('red')
  })
})
