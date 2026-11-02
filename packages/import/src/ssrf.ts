import type { lookup } from 'node:dns/promises'
import type { PublicTarget } from '@cogenta/core'
import { CogentaError, isCogentaError, resolvePublicTarget as resolveCore } from '@cogenta/core'

/**
 * The SSRF guard of the import lives in `@cogenta/core` now (`src/http/ssrf.ts`),
 * shared with the link checker and the agent and plugin `http.fetch` tools. This
 * file keeps the import's public names and its own error code.
 */
export type { PinnedFetch, PinnedRequestInit, PublicTarget } from '@cogenta/core'
export { createPinnedFetch, isPrivateAddress } from '@cogenta/core'

function asImportError(error: unknown): unknown {
  if (!isCogentaError(error) || error.code !== 'HTTP_TARGET_UNSAFE') return error
  const url = String(error.details?.['url'] ?? '')
  const reason = String(error.details?.['reason'] ?? 'unsafe address')
  return new CogentaError({
    code: 'IMPORT_MEDIA_URL_UNSAFE',
    message: `"${url}" cannot be fetched: ${reason}.`,
    hint: 'Only public http(s) URLs are downloaded during import. Host the file publicly, or upload it directly.',
    details: { url },
  })
}

/** {@link resolveCore} with the import's error code. */
export async function resolvePublicTarget(
  url: string,
  options: { readonly lookupImpl?: typeof lookup } = {},
): Promise<PublicTarget> {
  try {
    return await resolveCore(url, options)
  } catch (error) {
    throw asImportError(error)
  }
}

/** {@link resolvePublicTarget} for callers that only need the verdict. */
export async function assertPublicUrl(
  url: string,
  options: { readonly lookupImpl?: typeof lookup } = {},
): Promise<void> {
  await resolvePublicTarget(url, options)
}
