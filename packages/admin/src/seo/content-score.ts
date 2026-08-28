import { foldForMatch } from '../search/fold.js'

/**
 * The admin's own copy of `@cogenta/seo`'s `content-analysis.ts` (fiche 70
 * task 1) — same checks, same thresholds, same score bucketing, kept as its
 * own tiny copy rather than an import for the exact reason `search/fold.ts`
 * already states at the top of this file's only import: **the admin never
 * imports a schema/seo module, it is a browser bundle**. `@cogenta/seo`
 * itself depends on `@cogenta/schema` (a real, sizeable dependency this
 * admin has never taken and should not take just to reuse one pure
 * function), so this is the one file in the fiche that intentionally exists
 * twice — algorithm reviewed and tested once in `@cogenta/seo`'s own suite,
 * mirrored here with the same test coverage so a drift between the two would
 * fail a test on this side too.
 *
 * If either copy's thresholds change, the other must change with it — there
 * is no third place either one is derived from.
 */

const HEADING_STYLES: ReadonlySet<string> = new Set(['h2', 'h3', 'h4'])

interface AnalysisBlockNode {
  readonly _type?: unknown
  readonly style?: unknown
  readonly children?: unknown
}

interface AnalysisSpan {
  readonly text?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function condense(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/** The same letters-and-digits split `@cogenta/schema`'s `tokenize` uses, filtered to 3+ characters like `queryTokens` — short words (`de`, `en`, `un`) are noise for a title-overlap or keyword check. */
function queryTokens(value: string): string[] {
  const matches = foldForMatch(value).match(/[\p{L}\p{N}]+/gu) ?? []
  return matches.filter((token) => token.length >= 3)
}

interface ParsedTextBlock {
  readonly text: string
  readonly heading: boolean
}

interface ParsedBody {
  readonly blocks: readonly ParsedTextBlock[]
  readonly headingCount: number
}

function textOf(node: AnalysisBlockNode): string {
  const children = node.children
  if (!Array.isArray(children)) return ''
  const parts: string[] = []
  for (const child of children as readonly unknown[]) {
    if (!isRecord(child)) continue
    const span = child as AnalysisSpan
    if (typeof span.text === 'string') parts.push(span.text)
  }
  return parts.join('')
}

function parseBody(body: unknown): ParsedBody {
  if (!Array.isArray(body)) return { blocks: [], headingCount: 0 }

  const blocks: ParsedTextBlock[] = []
  let headingCount = 0

  for (const node of body as readonly unknown[]) {
    if (!isRecord(node) || node._type !== 'block') continue
    const block = node as AnalysisBlockNode
    const text = condense(textOf(block))
    if (text.length === 0) continue
    const heading = typeof block.style === 'string' && HEADING_STYLES.has(block.style)
    blocks.push({ text, heading })
    if (heading) headingCount += 1
  }

  return { blocks, headingCount }
}

const MAX_SENTENCE_WORDS = 20
const SHORT_CONTENT_WORDS = 300
const MIN_CONTENT_WORDS = 300
const MIN_KEYWORD_DENSITY = 0.5
const MAX_KEYWORD_DENSITY = 2.5

const SENTENCE_SPLIT_PATTERN = /[^.!?]+[.!?]*/gu

function sentencesOf(text: string): readonly string[] {
  return (text.match(SENTENCE_SPLIT_PATTERN) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

function wordCountOf(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/u).length
}

function firstSentenceOf(blocks: readonly ParsedTextBlock[]): string {
  const first = blocks.find((block) => !block.heading) ?? blocks[0]
  if (first === undefined) return ''
  const sentences = sentencesOf(first.text)
  return sentences[0] ?? first.text
}

function occurrencesOf(haystack: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

export type ContentCheckId =
  | 'keywordInTitle'
  | 'keywordInDescription'
  | 'keywordInFirstSentence'
  | 'keywordDensity'
  | 'sentenceLength'
  | 'subheadings'
  | 'contentLength'

export interface ContentCheck {
  readonly id: ContentCheckId
  readonly passed: boolean
  readonly detail?: number
}

export type ContentScoreLevel = 'red' | 'orange' | 'green'

export interface ContentAnalysisInput {
  readonly title: string
  readonly description?: string
  readonly focusKeyword?: string
  readonly body: unknown
}

export interface ContentAnalysisResult {
  readonly checks: readonly ContentCheck[]
  readonly score: ContentScoreLevel
  readonly passedCount: number
  readonly totalCount: number
}

function scoreFor(passedCount: number, totalCount: number): ContentScoreLevel {
  if (totalCount === 0) return 'red'
  const ratio = passedCount / totalCount
  if (ratio >= 0.8) return 'green'
  if (ratio >= 0.5) return 'orange'
  return 'red'
}

export function analyseContent(input: ContentAnalysisInput): ContentAnalysisResult {
  const { blocks, headingCount } = parseBody(input.body)
  const bodyText = condense(blocks.map((block) => block.text).join(' '))
  const wordCount = wordCountOf(bodyText)

  const checks: ContentCheck[] = []

  const focusKeyword = (input.focusKeyword ?? '').trim()
  if (focusKeyword !== '') {
    const foldedKeyword = foldForMatch(focusKeyword)
    checks.push({
      id: 'keywordInTitle',
      passed: foldForMatch(input.title).includes(foldedKeyword),
    })
    checks.push({
      id: 'keywordInDescription',
      passed:
        input.description !== undefined && foldForMatch(input.description).includes(foldedKeyword),
    })
    checks.push({
      id: 'keywordInFirstSentence',
      passed: foldForMatch(firstSentenceOf(blocks)).includes(foldedKeyword),
    })

    const foldedBody = foldForMatch(bodyText)
    const occurrences = occurrencesOf(foldedBody, foldedKeyword)
    const density = wordCount === 0 ? 0 : (occurrences / wordCount) * 100
    checks.push({
      id: 'keywordDensity',
      passed: density >= MIN_KEYWORD_DENSITY && density <= MAX_KEYWORD_DENSITY,
      detail: Math.round(density * 10) / 10,
    })
  }

  const sentenceLengths = sentencesOf(bodyText).map(wordCountOf)
  const longestSentence = sentenceLengths.length === 0 ? 0 : Math.max(...sentenceLengths)
  checks.push({
    id: 'sentenceLength',
    passed: longestSentence <= MAX_SENTENCE_WORDS,
    detail: longestSentence,
  })

  checks.push({
    id: 'subheadings',
    passed: wordCount < SHORT_CONTENT_WORDS || headingCount > 0,
    detail: headingCount,
  })

  checks.push({
    id: 'contentLength',
    passed: wordCount >= MIN_CONTENT_WORDS,
    detail: wordCount,
  })

  const passedCount = checks.filter((check) => check.passed).length
  const totalCount = checks.length

  return { checks, score: scoreFor(passedCount, totalCount), passedCount, totalCount }
}

/** Exported for the panel's own "candidate word" filtering — see `content-analysis.ts`'s matching export for why it exists. */
export { queryTokens }
