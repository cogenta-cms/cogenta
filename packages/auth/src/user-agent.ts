/**
 * Just enough of a `User-Agent` parse to answer "which of my sessions is my
 * phone" — never more (fiche 18 task 2).
 *
 * A `User-Agent` string is personal data the moment it is stored whole: it
 * fingerprints a browser build, an OS patch level, sometimes a device model.
 * `sessions.ts` calls this once, at session creation, and keeps only the
 * two-word answer below — the raw header itself is never written to a row
 * and is discarded the instant this function returns. No dependency (R9): a
 * handful of substring checks is the entire "library" a session list needs.
 */
export interface ParsedUserAgent {
  readonly browser: string
  readonly device: string
}

const UNKNOWN: ParsedUserAgent = Object.freeze({ browser: 'unknown', device: 'unknown' })

function deviceOf(ua: string): string {
  if (/ipad|tablet|kindle|playbook/iu.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/iu.test(ua)) return 'mobile'
  if (/bot|crawler|spider|curl\/|wget\/|python-requests|axios\//iu.test(ua)) return 'bot'
  return 'desktop'
}

function browserOf(ua: string): string {
  // Order matters: Edge and Opera both carry "Chrome" in their UA string, and
  // Chrome itself carries "Safari" in its — the more specific token has to be
  // checked first, or every Edge or Opera user would be reported as Chrome,
  // and every Chrome user as Safari.
  if (/edg\//iu.test(ua)) return 'edge'
  if (/opr\/|opera/iu.test(ua)) return 'opera'
  if (/firefox\/|fxios\//iu.test(ua)) return 'firefox'
  if (/crios\//iu.test(ua)) return 'chrome'
  if (/chrome\//iu.test(ua) && !/chromium/iu.test(ua)) return 'chrome'
  if (/safari\//iu.test(ua)) return 'safari'
  if (/bot|crawler|spider/iu.test(ua)) return 'bot'
  return 'other'
}

/** Distils a raw `User-Agent` header into a browser family and a device type. Never keeps anything else. */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (userAgent === null || userAgent === undefined || userAgent.trim().length === 0) {
    return UNKNOWN
  }
  return { browser: browserOf(userAgent), device: deviceOf(userAgent) }
}
