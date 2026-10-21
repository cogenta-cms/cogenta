/**
 * Whether a link would run script when followed: `javascript:`,
 * `vbscript:`, or a `data:` document (security review of 2026-10-21).
 *
 * Contract B stores a link as a URL and never said which; an editor could
 * save `javascript:fetch(...)` as a call to action and take the session of
 * the first admin who clicked it. Only those schemes are refused — a
 * relative path, a fragment, http(s), mailto, tel and any other scheme stay
 * valid, so no content that was ever legitimate stops validating. Browsers
 * ignore whitespace and control characters around a scheme, so it is read
 * without them. The renderer neutralises the same values again on output.
 */
export function isScriptUrl(value: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  const probe = value.replace(/[\u0000- \u007f]/gu, '').toLowerCase()
  return /^(?:javascript|vbscript|data):/u.test(probe)
}

export const SCRIPT_URL_MESSAGE = 'must not be a javascript:, vbscript: or data: URL'
