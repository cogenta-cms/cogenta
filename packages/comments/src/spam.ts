/**
 * Non-AI anti-spam (fiche 15 task 4: "à faire d'abord parce qu'il fonctionne
 * partout" — works on a site with no AI provider at all, R2). Pure and
 * deterministic: link count, a fixed word list, and submission timing. The
 * honeypot field and the minimum-fill-delay check live in the REST router
 * (`comments-router.ts`) because they need the request's own timing/fields,
 * not just the body text.
 */

const LINK_RE = /https?:\/\/|www\./giu

/** A short, boring list of the terms that show up in almost every comment-spam sample. Not a moderation policy — just enough to catch the laziest bots without a provider. */
const SPAM_WORDS = [
  'viagra',
  'cialis',
  'casino',
  'crypto airdrop',
  'make money fast',
  'weight loss pills',
  'forex signals',
  'seo services',
  'backlinks for sale',
] as const

export interface SpamCheckResult {
  readonly suspect: boolean
  readonly reasons: readonly string[]
}

export interface SpamCheckOptions {
  /** More than this many links marks the comment suspect. Defaults to 2. */
  readonly maxLinks?: number
}

export function checkSpamHeuristics(body: string, options: SpamCheckOptions = {}): SpamCheckResult {
  const maxLinks = options.maxLinks ?? 2
  const reasons: string[] = []

  const linkCount = (body.match(LINK_RE) ?? []).length
  if (linkCount > maxLinks) reasons.push(`contains ${linkCount} links`)

  const lower = body.toLowerCase()
  const matchedWords = SPAM_WORDS.filter((word) => lower.includes(word))
  if (matchedWords.length > 0) reasons.push(`matches blocked terms: ${matchedWords.join(', ')}`)

  return { suspect: reasons.length > 0, reasons }
}
