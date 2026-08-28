import { condense, foldText, queryTokens } from '@cogenta/schema'

/**
 * Real-time content scoring (fiche 70, task 1) — the one AIOSEO/TruSEO-style
 * feature Cogenta never had: a live checklist rendered while an editor is
 * still typing, not a report fetched after publishing.
 *
 * **Pure and synchronous, on purpose.** The panel that renders this
 * (`packages/admin/src/seo/seo-panel.tsx`) calls it on every keystroke, and
 * the fiche's own acceptance criterion is "le score de contenu change en
 * direct pendant la frappe, sans appel réseau bloquant" — a function that
 * awaited anything, even a local promise, would violate that. Zero
 * dependency beyond `@cogenta/schema`'s already-shared text utilities
 * (`condense`/`foldText`/`queryTokens` — the same folding full-text search
 * already uses, so "does the keyword match" answers the same question here
 * as it does in a search box) — R9.
 *
 * **The body is the portable-text document itself (contract A's rich text,
 * ADR-0013), not a flattened string.** Two of the seven checks need real
 * structure that a flattened string throws away: "présence de sous-titres"
 * needs to see which blocks are headings, and "phrase la plus longue" reads
 * better off paragraph boundaries than off one run-on blob. `@cogenta/schema`
 * already has `extractRichText` for the flattened case (full-text indexing);
 * this file does its own light walk instead, because it needs the blocks
 * `extractRichText` deliberately throws away.
 *
 * **A missing focus keyword skips the four keyword checks rather than
 * failing them.** An editor who has not typed one yet is not shown four red
 * crosses for a thing they never asked to be checked — `totalCount` reflects
 * only the checks actually evaluated, which is also what keeps the score
 * itself honest (see `content-analysis.test.ts`'s own "no focus keyword"
 * case).
 *
 * **The piège this file exists to avoid**: a false sense of precision. The
 * fiche says it by name — "un faux sentiment de précision est pire qu'une
 * absence de score" — which is why `ContentAnalysisResult.score` is a closed
 * three-value union, never a number, and every threshold below is a rounded,
 * documented judgement call, not a claim to a scientific optimum. No public
 * SEO tool publishes the exact formula behind its own "green" light either;
 * this one at least says what it checks.
 */

/** A block-shaped node this file actually reads. Anything else (a `media` node, an unrecognised `_type`) is skipped rather than guessed at. */
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

/** Contract A's `RICH_TEXT_STYLES` minus `'normal'`/`'blockquote'` — the two that read as a subheading in an outline. Duplicated rather than imported from `@cogenta/schema`'s `rich-text.ts` (`RICH_TEXT_STYLES`): importing three literals is not worth a dependency edge this file does not otherwise need, the same call `seo.tsx`'s own `ROBOTS_DISALLOW_ALL_PATTERN` comment makes for a one-regex duplication. */
const HEADING_STYLES: ReadonlySet<string> = new Set(['h2', 'h3', 'h4'])

interface ParsedTextBlock {
  readonly text: string
  readonly heading: boolean
}

interface ParsedBody {
  /** One entry per text block (heading or paragraph), in document order. */
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

/** Defensively `unknown`, like `extractRichText` — an entry mid-edit in the admin can hold anything the editor has not saved yet. */
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

/** Words per sentence beyond which a sentence is flagged — Yoast's own published readability threshold (20 words), the closest thing this space has to an industry convention. */
const MAX_SENTENCE_WORDS = 20
/** Below this, an article is short enough that going without a subheading is not itself a problem — `subheadings` is skipped rather than failed. */
const SHORT_CONTENT_WORDS = 300
/** The minimum word count `contentLength` asks for — the same 300-word floor most of these tools converge on for "a real article", not a Cogenta invention. */
const MIN_CONTENT_WORDS = 300
/** Keyword density band `keywordDensity` passes within, expressed as a percentage of total words — TruSEO's own published target range. Below it reads as "barely used"; above it reads as stuffing. */
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

/** First sentence of the first *prose* block — a heading is not a sentence, so it is skipped in favour of the first `'normal'`/`'blockquote'` block, falling back to the very first block at all when the body is nothing but headings. */
function firstSentenceOf(blocks: readonly ParsedTextBlock[]): string {
  const first = blocks.find((block) => !block.heading) ?? blocks[0]
  if (first === undefined) return ''
  const sentences = sentencesOf(first.text)
  return sentences[0] ?? first.text
}

/** How many times `needle` occurs in `haystack`, both already folded — a plain substring count, not a word-boundary regex, so a multi-word keyword phrase ("guide de voyage") is counted as one unit exactly as `foldText`/`queryTokens` already treat phrases in `@cogenta/schema`'s own search layer. */
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
  /**
   * A number a caller may want to render next to the check
   * (`keywordDensity`'s percentage, `sentenceLength`'s longest sentence word
   * count, `contentLength`'s word count) — never itself the score, and never
   * shown with false precision by this file (a caller renders it as an
   * integer, not a decimal).
   */
  readonly detail?: number
}

export type ContentScoreLevel = 'red' | 'orange' | 'green'

export interface ContentAnalysisInput {
  readonly title: string
  readonly description?: string
  /** Empty/absent skips the four keyword-dependent checks — see this file's own module comment. */
  readonly focusKeyword?: string
  /** A contract-A rich text document (`RichTextDocument`-shaped), or anything else — parsed defensively, like `extractRichText`. */
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
    const foldedKeyword = foldText(focusKeyword)
    checks.push({
      id: 'keywordInTitle',
      passed: foldText(input.title).includes(foldedKeyword),
    })
    checks.push({
      id: 'keywordInDescription',
      passed:
        input.description !== undefined && foldText(input.description).includes(foldedKeyword),
    })
    checks.push({
      id: 'keywordInFirstSentence',
      passed: foldText(firstSentenceOf(blocks)).includes(foldedKeyword),
    })

    const foldedBody = foldText(bodyText)
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

/** `queryTokens` re-exported for callers that want the same word-matching Cogenta's search already uses on top of a raw analysis result — not used internally by `analyseContent` itself, kept here only so a consumer never has to add its own `@cogenta/schema` dependency just to tokenize a suggestion. */
export { queryTokens }
