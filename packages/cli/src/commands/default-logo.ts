/**
 * The default Cogenta logo served on the public site (fiche L21 task 8).
 *
 * Embedded as base64 rather than shipped as a loose file: `@cogenta/cli`'s
 * `package.json` `"files"` is `["dist"]` only, and a binary asset would need
 * its own build-time copy step to reach a published tarball (the way
 * `dist/admin-assets` gets one) — a single small PNG is cheap enough to
 * embed directly instead. Resized down from the vendored 500×500 transparent
 * source (`packages/admin/public/branding/logo-cogenta-transparent.png`,
 * also under `docs/logo/`) to 64×64 with `@cogenta/render`'s own WASM image
 * driver — zero new dependency (R9/R10), the same degraded-tier codec
 * `/_image` already relies on — the size a footer credit actually needs,
 * not the size a print asset does.
 *
 * Served at `DEFAULT_LOGO_PATH`, exactly like `STYLESHEET_PATH`
 * (`theme-render.ts`): one URL, one long `Cache-Control: immutable`, since
 * the bytes only ever change with a new `@cogenta/cli` release.
 */

const DEFAULT_LOGO_BASE64 =
  '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'

/** Mount point on the public site — under `/_cogenta/`, the same reserved namespace `STYLESHEET_PATH` uses, so no collection route can ever claim it. */
export const DEFAULT_LOGO_PATH = '/_cogenta/logo-cogenta.png'

export const DEFAULT_LOGO_CONTENT_TYPE = 'image/png'

export function defaultLogoBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(DEFAULT_LOGO_BASE64, 'base64'))
}
