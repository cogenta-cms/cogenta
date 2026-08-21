import { CogentaError } from '@cogenta/core'

/**
 * The one piece of real network access `cogenta update` needs: "what is the
 * newest published version of this package, and where is its tarball" — the
 * npm registry's own abbreviated packument
 * (`Accept: application/vnd.npm.install-v1+json`), which is a small fraction
 * of the full packument (no per-version readme, no full dependency graph)
 * but still carries `dist-tags.latest` and, per version, `dist.tarball` —
 * exactly what `contract-risk.ts` needs to fetch one tarball and read its
 * `CHANGELOG.md`.
 *
 * `registry.npmjs.org` only — never a CDN mirror (unpkg, jsdelivr…), which
 * would be a second external host this optional feature depends on for no
 * real gain. Every caller degrades to "could not check" on failure (R1's
 * spirit: checking for an update is optional infrastructure, never something
 * the rest of the CMS needs to run).
 */

const REGISTRY_BASE = 'https://registry.npmjs.org'
const FETCH_TIMEOUT_MS = 10_000

export interface NpmPackageSummary {
  readonly name: string
  /** `dist-tags.latest` — the version `npm install <name>` would resolve to today. */
  readonly latest: string
  /** Every version the registry lists, in whatever order it returned them (usually publish order). */
  readonly versions: readonly string[]
  /** `dist.tarball` per version — only present for a version this response actually described. */
  readonly tarballUrl: Readonly<Record<string, string>>
}

function registryUrl(packageName: string): string {
  // A scoped name (`@cogenta/core`) needs the whole name percent-encoded as
  // one segment — `encodeURIComponent` turns `/` into `%2F`, which is what
  // the registry expects for a scoped package's single-segment route.
  return `${REGISTRY_BASE}/${encodeURIComponent(packageName)}`
}

function checkFailed(packageName: string, reason: string, cause?: unknown): CogentaError {
  const npmPage = `https://www.npmjs.com/package/${packageName}`
  return new CogentaError({
    code: 'UPDATE_CHECK_FAILED',
    message: `Could not check npm for the latest version of "${packageName}": ${reason}`,
    hint: `This needs outbound network access to registry.npmjs.org. Everything else in this admin works without it (R1) — try again later, or check manually at ${npmPage}.`,
    cause,
    details: { packageName },
  })
}

export async function fetchNpmPackageSummary(
  packageName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NpmPackageSummary> {
  let response: Response
  try {
    response = await fetchImpl(registryUrl(packageName), {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    throw checkFailed(packageName, 'the request failed', error)
  }

  if (response.status === 404) {
    throw checkFailed(packageName, 'npm has no package by this name')
  }
  if (!response.ok) {
    throw checkFailed(packageName, `npm responded with HTTP ${response.status}`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw checkFailed(packageName, 'the response was not valid JSON', error)
  }

  const record = body as {
    'dist-tags'?: { latest?: unknown }
    versions?: Record<string, { version?: unknown; dist?: { tarball?: unknown } }>
  }
  const latest = record['dist-tags']?.latest
  if (typeof latest !== 'string' || latest === '') {
    throw checkFailed(packageName, 'the response carried no "dist-tags.latest"')
  }

  const versions = record.versions ?? {}
  const tarballUrl: Record<string, string> = {}
  for (const [version, meta] of Object.entries(versions)) {
    const tarball = meta.dist?.tarball
    if (typeof tarball === 'string' && tarball !== '') tarballUrl[version] = tarball
  }

  return { name: packageName, latest, versions: Object.keys(versions), tarballUrl }
}
