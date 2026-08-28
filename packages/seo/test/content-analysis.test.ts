import { describe, expect, it } from 'vitest'
import { analyseContent, type ContentCheckId } from '../src/content-analysis.js'

/** A single normal-style block with one plain-text span — the minimal contract-A rich text shape this file reads. */
function paragraph(text: string, style: 'normal' | 'h2' | 'h3' | 'h4' = 'normal'): unknown {
  return {
    _key: `k-${text.slice(0, 8)}-${style}`,
    _type: 'block',
    style,
    children: [{ _key: 'span-1', _type: 'span', text, marks: [] }],
  }
}

/**
 * A body long enough (>= 300 words) to trigger `contentLength`/`subheadings`,
 * every sentence short, and the keyword phrase repeated exactly three times
 * (once in the first sentence) — chosen so density lands well inside the
 * 0.5%-2.5% band regardless of small word-count rounding, rather than once
 * per filler sentence, which would read as keyword stuffing and correctly
 * fail `keywordDensity`.
 */
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

describe('analyseContent — keyword checks', () => {
  it('detects a focus keyword missing from the title', () => {
    const result = analyseContent({
      title: 'Un article sans rapport',
      description: 'Ce guide de voyage vous aide.',
      focusKeyword: 'guide de voyage',
      body: [paragraph('Ce guide de voyage est utile.')],
    })

    expect(checkOf(result.checks, 'keywordInTitle')?.passed).toBe(false)
  })

  it('passes the title check when the keyword appears, case- and accent-insensitively', () => {
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

  it('fails the description check when no description was given at all', () => {
    const result = analyseContent({
      title: 'Guide de voyage',
      focusKeyword: 'guide de voyage',
      body: [paragraph('Un guide de voyage détaillé.')],
    })

    expect(checkOf(result.checks, 'keywordInDescription')?.passed).toBe(false)
  })

  it('detects a focus keyword absent from the first sentence', () => {
    const result = analyseContent({
      title: 'Guide de voyage',
      focusKeyword: 'guide de voyage',
      body: [
        paragraph('Cette phrase ne parle de rien en particulier. Le guide de voyage vient après.'),
      ],
    })

    expect(checkOf(result.checks, 'keywordInFirstSentence')?.passed).toBe(false)
  })
})

describe('analyseContent — sentence length', () => {
  it('flags a sentence longer than the readability threshold', () => {
    const words = Array.from({ length: 30 }, (_, index) => `mot${index}`).join(' ')
    const result = analyseContent({
      title: 'Titre',
      body: [paragraph(`${words}.`)],
    })

    const check = checkOf(result.checks, 'sentenceLength')
    expect(check?.passed).toBe(false)
    expect(check?.detail).toBe(30)
  })

  it('passes when every sentence stays under the threshold', () => {
    const result = analyseContent({
      title: 'Titre',
      body: [paragraph('Une phrase courte. Une autre phrase courte aussi.')],
    })

    expect(checkOf(result.checks, 'sentenceLength')?.passed).toBe(true)
  })
})

describe('analyseContent — structure and length', () => {
  it('requires a subheading only once the article is long enough', () => {
    const shortBody = [paragraph('Un texte court sans sous-titre.')]
    const short = analyseContent({ title: 'Titre', body: shortBody })
    expect(checkOf(short.checks, 'subheadings')?.passed).toBe(true)

    const longWithoutHeading = [
      paragraph(Array.from({ length: 320 }, (_, i) => `mot${i}`).join(' ')),
    ]
    const long = analyseContent({ title: 'Titre', body: longWithoutHeading })
    expect(checkOf(long.checks, 'subheadings')?.passed).toBe(false)
  })

  it('detects a body shorter than the minimum word count', () => {
    const result = analyseContent({ title: 'Titre', body: [paragraph('Trop court.')] })
    expect(checkOf(result.checks, 'contentLength')?.passed).toBe(false)
  })

  it('passes content length once the body reaches the floor', () => {
    const result = analyseContent({ title: 'Titre', body: longGoodBody() })
    expect(checkOf(result.checks, 'contentLength')?.passed).toBe(true)
  })
})

describe('analyseContent — focus keyword optionality', () => {
  it('omits the four keyword checks entirely when no focus keyword is given', () => {
    const result = analyseContent({ title: 'Titre', body: [paragraph('Un texte quelconque.')] })

    const keywordChecks: ContentCheckId[] = [
      'keywordInTitle',
      'keywordInDescription',
      'keywordInFirstSentence',
      'keywordDensity',
    ]
    for (const id of keywordChecks) {
      expect(checkOf(result.checks, id)).toBeUndefined()
    }
    expect(result.totalCount).toBe(3)
  })

  it('also omits them for a keyword that is only whitespace', () => {
    const result = analyseContent({
      title: 'Titre',
      focusKeyword: '   ',
      body: [paragraph('Un texte quelconque.')],
    })
    expect(checkOf(result.checks, 'keywordInTitle')).toBeUndefined()
  })
})

describe('analyseContent — score', () => {
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

  it('never exposes a numeric score, only the closed red/orange/green union', () => {
    const result = analyseContent({ title: 'Titre', body: [paragraph('Un texte.')] })
    expect(['red', 'orange', 'green']).toContain(result.score)
  })
})
