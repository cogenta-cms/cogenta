import { CogentaError } from '@cogenta/core'

/**
 * The web application manifest, and the installability check that goes with it.
 *
 * Installability is not a property of the manifest alone — the browser also
 * requires a registered service worker that answers navigations offline, which
 * is what the document route and the precached offline page provide. What this
 * module can check is the half that is data, and it checks it *before* the
 * build ships rather than leaving the author to discover in a Lighthouse report
 * that the install button never appeared.
 */

export type DisplayMode = 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser'

export interface ManifestIcon {
  readonly src: string
  /** `"192x192"`, or `"any"` for a vector. */
  readonly sizes: string
  readonly type: string
  /**
   * `any` is drawn as-is; `maskable` fills a platform-defined shape. A single
   * icon may declare both, but then it must survive being cropped to a circle.
   */
  readonly purpose?: 'any' | 'maskable' | 'any maskable'
}

export interface WebAppManifest {
  /** Stable identity of the application. Changing it installs a *new* app. */
  readonly id: string
  readonly name: string
  readonly short_name: string
  readonly description?: string
  readonly start_url: string
  readonly scope: string
  readonly display: DisplayMode
  readonly background_color: string
  readonly theme_color: string
  readonly lang: string
  readonly dir: 'ltr' | 'rtl' | 'auto'
  readonly icons: readonly ManifestIcon[]
}

export interface ManifestInput {
  readonly name: string
  readonly shortName?: string
  readonly description?: string
  /** Absolute path within the origin. Where the installed app opens. */
  readonly startUrl?: string
  readonly scope?: string
  readonly display?: DisplayMode
  readonly backgroundColor: string
  readonly themeColor: string
  readonly lang: string
  readonly dir?: 'ltr' | 'rtl' | 'auto'
  readonly icons: readonly ManifestIcon[]
}

/**
 * Android home-screen labels are truncated around twelve characters, so a long
 * `short_name` is silently mangled rather than rejected.
 */
const SHORT_NAME_MAX = 12

export function buildManifest(input: ManifestInput): WebAppManifest {
  const scope = input.scope ?? '/'
  const shortName = input.shortName ?? input.name.slice(0, SHORT_NAME_MAX)
  const manifest: WebAppManifest = {
    // `id` defaults to `start_url` in browsers, which means changing the start
    // URL orphans the installed app. Pinning it to the scope makes the identity
    // survive a routing change.
    id: scope,
    name: input.name,
    short_name: shortName,
    start_url: input.startUrl ?? scope,
    scope,
    display: input.display ?? 'standalone',
    background_color: input.backgroundColor,
    theme_color: input.themeColor,
    lang: input.lang,
    dir: input.dir ?? 'ltr',
    icons: input.icons,
  }
  return input.description === undefined
    ? manifest
    : { ...manifest, description: input.description }
}

export interface InstallabilityProblem {
  readonly field: string
  readonly problem: string
  readonly fix: string
}

function hasSquareIcon(icons: readonly ManifestIcon[], edge: number): boolean {
  return icons.some((icon) =>
    icon.sizes.split(/\s+/).some((size) => size.toLowerCase() === `${edge}x${edge}`),
  )
}

/**
 * Reports everything that would stop a browser offering installation, in one
 * pass. Reporting one problem per run is the loop that makes an author give up
 * on the third iteration.
 */
export function checkInstallability(manifest: WebAppManifest): InstallabilityProblem[] {
  const problems: InstallabilityProblem[] = []

  if (manifest.name.trim() === '') {
    problems.push({
      field: 'name',
      problem: 'the manifest has no name',
      fix: 'Set the site name: it is the label of the install prompt.',
    })
  }

  if (manifest.short_name.length > SHORT_NAME_MAX) {
    problems.push({
      field: 'short_name',
      problem: `short_name is ${manifest.short_name.length} characters`,
      fix: `Keep it to ${SHORT_NAME_MAX} characters or fewer, or the home screen truncates it.`,
    })
  }

  if (manifest.display === 'browser') {
    problems.push({
      field: 'display',
      problem: 'display is "browser", which no browser treats as installable',
      fix: 'Use "standalone", "minimal-ui" or "fullscreen".',
    })
  }

  if (!manifest.start_url.startsWith(manifest.scope)) {
    problems.push({
      field: 'start_url',
      problem: `start_url "${manifest.start_url}" is outside scope "${manifest.scope}"`,
      fix: 'The start URL must be inside the scope, or the installed app opens outside itself.',
    })
  }

  if (!hasSquareIcon(manifest.icons, 192)) {
    problems.push({
      field: 'icons',
      problem: 'no 192x192 icon',
      fix: 'Add a 192x192 PNG: it is the minimum Android requires for the install prompt.',
    })
  }

  if (!hasSquareIcon(manifest.icons, 512)) {
    problems.push({
      field: 'icons',
      problem: 'no 512x512 icon',
      fix: 'Add a 512x512 PNG: it is used for the splash screen.',
    })
  }

  if (!manifest.icons.some((icon) => icon.purpose?.includes('maskable') === true)) {
    problems.push({
      field: 'icons',
      problem: 'no maskable icon',
      fix: 'Add an icon with purpose "maskable" and 20% safe padding, or Android draws your square icon inside a white circle.',
    })
  }

  return problems
}

/** Throws a message an author can act on, listing every problem at once. */
export function assertInstallable(manifest: WebAppManifest): void {
  const problems = checkInstallability(manifest)
  if (problems.length === 0) return
  throw new CogentaError({
    code: 'CONFIG_INVALID',
    message: `The web app manifest is not installable (${problems.length} problem${
      problems.length === 1 ? '' : 's'
    }):\n${problems.map((p) => `  ${p.field}: ${p.problem} — ${p.fix}`).join('\n')}`,
    hint: 'A browser offers installation only when the manifest is complete, the display mode is not "browser", and a service worker answers navigations offline.',
    details: { problems },
  })
}

/** Serialised manifest, ready to write to `manifest.webmanifest`. */
export function renderManifest(manifest: WebAppManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export const MANIFEST_CONTENT_TYPE = 'application/manifest+json'
