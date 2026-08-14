import type { PiiKind, PiiMatch, RedactionResult } from './types.js'

interface PatternDef {
  readonly kind: PiiKind
  readonly regex: RegExp
}

/**
 * Order matters: a credit card number's digit groups must be checked before
 * the looser phone pattern would otherwise swallow it. Pattern-based, not
 * ML-based — deterministic and dependency-free (R9), matching "liste
 * explicite des champs" in spirit: an explicit, auditable set of shapes,
 * not a black box.
 */
const PATTERNS: readonly PatternDef[] = [
  { kind: 'credit_card', regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}\b/g },
  { kind: 'email', regex: /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g },
  { kind: 'ip_address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: 'phone', regex: /\+?\d[\d\s().-]{7,}\d/g },
]

/** Replaces every recognised PII shape with `[REDACTED:kind]`, in one pass per pattern kind, and reports what it found. */
export function redactText(text: string): RedactionResult {
  let result = text
  const matches: PiiMatch[] = []

  for (const { kind, regex } of PATTERNS) {
    result = result.replace(regex, (match: string, offset: number) => {
      matches.push({ kind, value: match, index: offset })
      return `[REDACTED:${kind}]`
    })
  }

  return { text: result, matches }
}
