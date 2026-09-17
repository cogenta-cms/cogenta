/**
 * What is wrong with a page a visitor really receives (L5 task 10).
 *
 * It reads the served HTML, not the CMS's idea of it: a theme is correct
 * until an editor puts an image with no alt in it, and only the output shows
 * that. Zero new dependency (R9) — the checks below are string work on markup
 * the host already fetched, and the contrast one is the WCAG formula, which
 * is twenty lines of arithmetic.
 *
 * It is deliberately a *subset* of WCAG: what a machine can decide alone.
 * The agent's identity says so, and the report repeats it.
 */

export type AccessibilityIssue =
  | 'missing-lang'
  | 'image-without-alt'
  | 'heading-skip'
  | 'generic-link-text'
  | 'input-without-label'
  | 'low-contrast'

export interface AccessibilityFinding {
  readonly issue: AccessibilityIssue
  readonly detail: string
  /** The offending markup, trimmed — so a human can find it without guessing. */
  readonly excerpt?: string
}

const GENERIC_LINK_TEXTS = new Set([
  'click here',
  'cliquez ici',
  'here',
  'ici',
  'read more',
  'lire la suite',
  'en savoir plus',
  'learn more',
  'link',
  'lien',
])

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'iu').exec(tag)
  return match?.[2] ?? match?.[3]
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function auditAccessibility(html: string): readonly AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = []

  const htmlTag = /<html\b[^>]*>/iu.exec(html)?.[0]
  if (htmlTag === undefined || (attribute(htmlTag, 'lang') ?? '').trim() === '') {
    findings.push({
      issue: 'missing-lang',
      detail:
        'The page does not say what language it is in, so a screen reader guesses its pronunciation.',
    })
  }

  for (const tag of html.match(/<img\b[^>]*>/giu) ?? []) {
    const alt = attribute(tag, 'alt')
    const role = attribute(tag, 'role')
    // `alt=""` with `role="presentation"` (or on its own) is the correct way
    // to mark a decorative image: flagging it would be the false positive.
    if (alt === undefined && role !== 'presentation') {
      findings.push({
        issue: 'image-without-alt',
        detail: 'An image carries no alt attribute at all: a screen reader reads its file name.',
        excerpt: tag.slice(0, 120),
      })
    }
  }

  let previous = 0
  for (const tag of html.match(/<h[1-6]\b[^>]*>/giu) ?? []) {
    const level = Number(tag[2])
    if (previous !== 0 && level > previous + 1) {
      findings.push({
        issue: 'heading-skip',
        detail: `A level ${level} heading follows a level ${previous} one: the outline skips a level.`,
        excerpt: tag,
      })
    }
    previous = level
  }

  for (const anchor of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/giu) ?? []) {
    const label = textOf(anchor).toLowerCase()
    if (label !== '' && GENERIC_LINK_TEXTS.has(label)) {
      findings.push({
        issue: 'generic-link-text',
        detail: `A link reads "${label}": out of context, it says nothing about where it goes.`,
        excerpt: anchor.slice(0, 120),
      })
    }
  }

  for (const input of html.match(/<input\b[^>]*>/giu) ?? []) {
    const type = (attribute(input, 'type') ?? 'text').toLowerCase()
    if (type === 'hidden' || type === 'submit' || type === 'button') continue
    const id = attribute(input, 'id')
    const labelled =
      (attribute(input, 'aria-label') ?? '').trim() !== '' ||
      (attribute(input, 'aria-labelledby') ?? '').trim() !== '' ||
      (id !== undefined &&
        new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${id}["']`, 'iu').test(html))
    if (!labelled) {
      findings.push({
        issue: 'input-without-label',
        detail: 'A form field has no label a screen reader can announce.',
        excerpt: input.slice(0, 120),
      })
    }
  }

  return findings
}

/** Relative luminance of an `#rrggbb` colour, WCAG 2.1 §1.4.3. */
export function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/iu.exec(hex.trim())
  if (match === null) return null
  const value = match[1] as string
  const channel = (offset: number): number => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** The contrast ratio between two colours, or `null` when either is not a plain hex colour. */
export function contrastRatio(foreground: string, background: string): number | null {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  if (first === null || second === null) return null
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The theme's own colour pairs, checked against WCAG AA (4.5:1 for body text,
 * 3:1 for large text). A pair this cannot parse — a gradient, a colour
 * function, a variable — is skipped rather than guessed at.
 */
export function auditContrast(
  pairs: readonly {
    readonly name: string
    readonly foreground: string
    readonly background: string
    readonly large?: boolean
  }[],
): readonly AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = []
  for (const pair of pairs) {
    const ratio = contrastRatio(pair.foreground, pair.background)
    if (ratio === null) continue
    const required = pair.large === true ? 3 : 4.5
    if (ratio < required) {
      findings.push({
        issue: 'low-contrast',
        detail: `${pair.name}: ${ratio.toFixed(2)}:1, below the ${required}:1 WCAG AA asks for.`,
      })
    }
  }
  return findings
}
