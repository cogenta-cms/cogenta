/**
 * Contract D — Thème, `theme@1.0`/`1.1`.
 *
 * Re-exported from `@cogenta/theme-kit`, which now holds the one real copy of
 * this contract every theme package (this one included) implements against —
 * see that package's own `contract.ts` for why. This file stays only because
 * `@cogenta/theme-canonical`'s own public surface (`index.ts`'s
 * `export * from './theme-contract.js'`) has always named these symbols, and
 * a theme installed from this package before today must keep resolving them
 * from the same place.
 */

export {
  type ContentClient,
  type ContentEntry,
  defineTheme,
  type ImageOptions,
  type ImageSource,
  type LinkTargetInput,
  type MediaReference,
  type Page,
  type QueryRequest,
  type RenderContext,
  type SkinTokens,
  type ThemeManifest,
  type ThemeRuntime,
} from '@cogenta/theme-kit'
