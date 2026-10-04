/** The menu destination policy, shared by writes and public rendering. */
export function isSafeMenuUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  // Browsers remove controls from schemes and treat backslashes as slashes.
  // Refuse these ambiguous spellings instead of trying to repair them.
  if (/[\s\p{Cc}\\]/u.test(value)) return false
  try {
    const parsed = new URL(value, 'https://menu.invalid/')
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
  } catch {
    return false
  }
}
