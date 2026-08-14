import { countWords, fleschReadingEase } from './readability.js'
import type { SeoAuditResult, SeoFinding, SeoPageInput } from './types.js'

const TITLE_MIN_CHARS = 15
const TITLE_MAX_CHARS = 60
const META_MIN_CHARS = 50
const META_MAX_CHARS = 160
const MIN_WORD_COUNT = 300
const MIN_READABILITY = 30

function checkTitle(page: SeoPageInput): readonly SeoFinding[] {
  const title = page.title.trim()
  if (title === '') {
    return [{ check: 'title', severity: 'error', message: 'The page has no title.' }]
  }
  if (title.length < TITLE_MIN_CHARS) {
    return [
      {
        check: 'title',
        severity: 'warning',
        message: `Title is short (${title.length} characters) — likely too vague for search results.`,
      },
    ]
  }
  if (title.length > TITLE_MAX_CHARS) {
    return [
      {
        check: 'title',
        severity: 'warning',
        message: `Title is long (${title.length} characters) — may be truncated in search results.`,
      },
    ]
  }
  return []
}

function checkMetaDescription(page: SeoPageInput): readonly SeoFinding[] {
  const description = page.metaDescription?.trim()
  if (description === undefined || description === '') {
    return [
      {
        check: 'meta_description',
        severity: 'warning',
        message:
          'No meta description — search engines will generate one, less control over the snippet.',
      },
    ]
  }
  if (description.length < META_MIN_CHARS) {
    return [
      {
        check: 'meta_description',
        severity: 'info',
        message: `Meta description is short (${description.length} characters).`,
      },
    ]
  }
  if (description.length > META_MAX_CHARS) {
    return [
      {
        check: 'meta_description',
        severity: 'warning',
        message: `Meta description is long (${description.length} characters) — likely truncated in search results.`,
      },
    ]
  }
  return []
}

function checkHeadingStructure(page: SeoPageInput): readonly SeoFinding[] {
  const findings: SeoFinding[] = []
  const h1Count = page.headings.filter((heading) => heading.level === 1).length

  if (h1Count === 0) {
    findings.push({
      check: 'heading_structure',
      severity: 'error',
      message: 'No H1 heading found.',
    })
  } else if (h1Count > 1) {
    findings.push({
      check: 'heading_structure',
      severity: 'warning',
      message: `${h1Count} H1 headings found — a page should have exactly one.`,
    })
  }

  let previousLevel = 0
  for (const heading of page.headings) {
    if (previousLevel > 0 && heading.level > previousLevel + 1) {
      findings.push({
        check: 'heading_structure',
        severity: 'warning',
        message: `Heading level skips from H${previousLevel} to H${heading.level} ("${heading.text}") — do not skip levels.`,
      })
    }
    previousLevel = heading.level
  }

  return findings
}

function checkAltText(page: SeoPageInput): readonly SeoFinding[] {
  const missing = page.images.filter(
    (image) => image.decorative !== true && (image.alt === null || image.alt.trim() === ''),
  )
  if (missing.length === 0) return []
  return [
    {
      check: 'alt_text',
      severity: 'error',
      message: `${missing.length} image(s) missing alt text.`,
    },
  ]
}

function checkInternalLinking(page: SeoPageInput): readonly SeoFinding[] {
  if (page.internalLinks.length === 0) {
    return [
      {
        check: 'internal_linking',
        severity: 'warning',
        message: 'No internal links — this page risks being an orphan.',
      },
    ]
  }
  return []
}

function checkCanonical(page: SeoPageInput): readonly SeoFinding[] {
  if (page.canonicalUrl === undefined || page.canonicalUrl.trim() === '') {
    return [{ check: 'canonical', severity: 'warning', message: 'No canonical URL declared.' }]
  }
  return []
}

function checkLength(page: SeoPageInput): readonly SeoFinding[] {
  const wordCount = countWords(page.bodyText)
  if (wordCount < MIN_WORD_COUNT) {
    return [
      {
        check: 'length',
        severity: 'warning',
        message: `Body is thin (${wordCount} words, under ${MIN_WORD_COUNT}).`,
      },
    ]
  }
  return []
}

function checkReadability(page: SeoPageInput): readonly SeoFinding[] {
  if (page.bodyText.trim() === '') return []
  const score = fleschReadingEase(page.bodyText)
  if (score < MIN_READABILITY) {
    return [
      {
        check: 'readability',
        severity: 'info',
        message: `Text may be hard to read (Flesch score ${score.toFixed(1)}).`,
      },
    ]
  }
  return []
}

/**
 * "Audit à la publication : titres, méta, structure de titres, alt,
 * maillage interne, canoniques, longueur, lisibilité." Deterministic
 * checks, not a model's judgement call — the acceptance criterion is a
 * measured false-positive rate, which a prompt alone cannot guarantee.
 * JSON-LD, internal-link proposals, cannibalisation and AEO/GEO are task
 * 6's job, not this one's.
 *
 * Deliberately not exposed as a callable tool: the SEO agent's declared
 * tools are only `content.read`/`content.write_draft`/`http.fetch`/
 * `channel.send` (per the lot's own agent spec) — this runs as a
 * deterministic pre-processing step feeding the agent's context, the
 * model never invokes it directly.
 */
export function auditSeoPage(page: SeoPageInput): SeoAuditResult {
  const findings = [
    ...checkTitle(page),
    ...checkMetaDescription(page),
    ...checkHeadingStructure(page),
    ...checkAltText(page),
    ...checkInternalLinking(page),
    ...checkCanonical(page),
    ...checkLength(page),
    ...checkReadability(page),
  ]
  return { url: page.url, findings }
}
