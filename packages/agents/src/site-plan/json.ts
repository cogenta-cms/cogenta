import { CogentaError } from '@cogenta/core'

/**
 * "The model was asked for JSON and returned something else" is the single
 * most common failure of every generation loop in this package, and each of
 * L19's three of them corrects it the same way. Shared here rather than
 * copied three times — `generateSkin` keeps its own, older copy, which
 * predates this and has its own passing tests.
 */
export function extractJsonObject(content: string | null): unknown {
  const fail = (reason: string): CogentaError =>
    new CogentaError({
      code: 'SITE_BRIEF_RESPONSE_INVALID',
      message: `The model's response was not a single JSON object: ${reason}.`,
      hint: 'Reply with ONLY a JSON object matching the requested shape — no prose, no markdown fence.',
    })

  if (content === null) throw fail('the response was empty')
  const trimmed = content.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw fail('no JSON object was found')
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch (error) {
    throw fail(error instanceof Error ? error.message : String(error))
  }
}
