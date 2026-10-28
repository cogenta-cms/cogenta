/**
 * Whether a request path, once percent-decoded, carries a control character
 * (NUL included): no route of this server names such a thing, and Postgres
 * rejects a NUL byte in a text parameter, so a lookup that received one was a
 * 500 from an anonymous URL. A path that cannot be decoded is left to the
 * existing bad-escape handling (a 400).
 */
export function pathHasControlCharacter(pathname: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return false
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  return /[\u0000-\u001f\u007f]/u.test(decoded)
}

/** Whether a single decoded value (a query parameter such as an image id) carries one. */
export function hasControlCharacter(value: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  return /[\u0000-\u001f\u007f]/u.test(value)
}
