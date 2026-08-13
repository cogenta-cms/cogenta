import { CogentaError } from '../errors/index.js'

const SEGMENT = /^[a-zA-Z0-9._-]+$/

/**
 * Validates an object key and returns its segments.
 *
 * Keys reach this function from uploads, imports and plugins, and the local
 * driver turns them into filesystem paths. `../` in a key would let a caller
 * write anywhere the process can write, so the check is a whitelist of what a
 * segment may contain rather than a blacklist of what it may not — a blacklist
 * loses to URL encoding, Unicode look-alikes and backslashes.
 */
export function parseKey(key: string): string[] {
  const invalid = (why: string): CogentaError =>
    new CogentaError({
      code: 'STORAGE_FAILED',
      message: `Invalid storage key "${key}": ${why}.`,
      hint: 'Use segments of letters, digits, dot, dash and underscore, separated by "/", for example "media/2026/08/cover.webp".',
      details: { key },
    })

  if (key.length === 0) throw invalid('it is empty')
  if (key.length > 1024) throw invalid('it is longer than 1024 characters')
  if (key.startsWith('/')) throw invalid('it must be relative')
  if (key.includes('\\')) throw invalid('backslashes are not allowed')
  if (key.includes('\0')) throw invalid('it contains a null byte')

  const segments = key.split('/')
  for (const segment of segments) {
    if (segment === '') throw invalid('it has an empty segment')
    if (segment === '.' || segment === '..') throw invalid('relative segments are not allowed')
    if (!SEGMENT.test(segment)) throw invalid(`the segment "${segment}" has forbidden characters`)
  }
  return segments
}

export function assertKey(key: string): void {
  parseKey(key)
}
