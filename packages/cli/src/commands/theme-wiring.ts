import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createAnthropicClient,
  createGoogleClient,
  createOpenAiClient,
  type ProviderClient,
  proposeThemeCandidates,
  type ThemeCreatorTargetTheme,
} from '@cogenta/agents'
import type { ThemeRouterOptions } from '@cogenta/api'
import type { CogentaConfig, DatabaseHandle } from '@cogenta/core'
import { createSkinGallery, ensureRegistryTables } from '@cogenta/plugins'
import { mergeSkinTokens, renderSkin, validateSkin } from '@cogenta/render'
import { createThemeStore, ensureThemeTable } from '@cogenta/schema'
import { availableThemes } from './theme-registry.js'
import { joinStyles } from './theme-render.js'

/**
 * Assembles `ThemeRouterOptions` for `cogenta serve` (fiche 14).
 *
 * Mirrors `createSitePlanning`'s own shape and reasoning:
 *
 * - `store`/`skinGallery` are always present — reviewing the current theme
 *   state never needs a provider (R2).
 * - `generator` (AI candidates) is present only when an LLM provider and a
 *   model are configured — otherwise the appearance screen's AI section
 *   simply does not render (`GET /api/theme`'s `aiAvailable: false`).
 * - `fileExporter` is present only under `cogenta dev` (never `serve`) and
 *   never on a read-only instance — the same ADR-0010 gate
 *   `createSitePlanning` already applies to the schema file, applied here to
 *   `theme.tokens.json` instead. Overrides can always be *saved* to the
 *   database; only freezing them into the versioned file is dev-only.
 */

const TOKENS_FILE = 'theme.tokens.json'

export interface ThemeWiringOptions {
  readonly projectRoot: string
  readonly db: DatabaseHandle
  readonly config: CogentaConfig
  readonly development: boolean
  readonly readOnly: boolean
}

function providerClient(
  llm: NonNullable<CogentaConfig['llm']>,
  apiKey: string,
): ProviderClient | undefined {
  const config = {
    apiKey,
    model: llm.model,
    ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
  }
  if (llm.provider === 'anthropic') return createAnthropicClient(config)
  if (llm.provider === 'openai') return createOpenAiClient(config)
  if (llm.provider === 'google') return createGoogleClient(config)
  return undefined
}

export async function createThemeWiring(options: ThemeWiringOptions): Promise<ThemeRouterOptions> {
  await ensureThemeTable(options.db)
  await ensureRegistryTables(options.db)

  const tokensPath = join(options.projectRoot, TOKENS_FILE)
  const llm = options.config.llm
  const apiKey = llm?.apiKey
  const client =
    llm === undefined || apiKey === undefined || apiKey === ''
      ? undefined
      : providerClient(llm, apiKey)

  const themeStore = createThemeStore({ db: options.db })
  const loadFileTokens = async (): Promise<Record<string, unknown> | null> => {
    try {
      return JSON.parse(await readFile(tokensPath, 'utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  }

  /**
   * L26 task 5 — "the server resolves the baseline's actual tokens itself
   * from `loadFileTokens()`/current overrides, the client only signals
   * intent". Same merge-and-fall-back-to-file logic
   * `computeEffectiveStyles` below already applies for rendering a page's
   * stylesheet, reused here so a baseline candidate is generated against
   * exactly what the site currently serves, never a stale or invalid
   * overlay.
   */
  async function resolveBaselineTokens(): Promise<Record<string, unknown> | null> {
    const file = await loadFileTokens()
    if (file === null) return null
    const overrides = await themeStore.get()
    if (overrides.tokenOverrides === null) return file
    try {
      const merged = mergeSkinTokens(
        file as never,
        overrides.tokenOverrides as never,
      ) as unknown as Record<string, unknown>
      validateSkin(merged)
      return merged
    } catch {
      return file
    }
  }

  return {
    store: themeStore,
    availableThemes: await availableThemes(),
    loadFileTokens,
    validateTokens: (candidate) => validateSkin(candidate) as unknown as Record<string, unknown>,
    mergeTokens: (base, overrides) =>
      mergeSkinTokens(base as never, overrides as never) as unknown as Record<string, unknown>,
    skinGallery: createSkinGallery(options.db),
    ...(client === undefined || llm === undefined
      ? {}
      : {
          generator: {
            generate: async (input: {
              readonly description: string
              readonly attachments?: readonly {
                readonly filename: string
                readonly mimeType: string
                readonly data: Uint8Array
              }[]
              readonly baseline?: { readonly themeName: string }
            }) => {
              const baselineTokens =
                input.baseline === undefined ? null : await resolveBaselineTokens()
              const result = await proposeThemeCandidates({
                client,
                model: llm.model,
                description: input.description,
                siteName: options.config.site.name,
                availableThemes: (await availableThemes()).map(
                  (theme): ThemeCreatorTargetTheme => ({ name: theme.name, label: theme.label }),
                ),
                ...(input.attachments === undefined || input.attachments.length === 0
                  ? {}
                  : { attachments: input.attachments }),
                ...(input.baseline === undefined || baselineTokens === null
                  ? {}
                  : { baseline: { themeName: input.baseline.themeName, tokens: baselineTokens } }),
              })
              return result.ok
                ? {
                    ok: true as const,
                    candidates: result.candidates.map((candidate) => ({
                      id: candidate.id,
                      label: candidate.label,
                      rationale: candidate.rationale,
                      tokens: candidate.tokens,
                      themeName: candidate.themeName,
                      ...(candidate.chromeInput === undefined
                        ? {}
                        : { chromeInput: { ...candidate.chromeInput } }),
                    })),
                    warnings: [...result.warnings],
                  }
                : { ok: false as const, reason: result.reason }
            },
          },
        }),
    ...(options.development && !options.readOnly
      ? {
          fileExporter: async (tokens: Record<string, unknown>) => {
            await writeFile(tokensPath, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8')
          },
        }
      : {}),
  }
}

/**
 * The ingredients `theme.propose_theme` (`@cogenta/agents-builtin`) needs at
 * wiring time — `client`/`model`/`availableThemes`, the same shape
 * `createThemeWiring`'s own `generator` above resolves, exposed separately
 * so `agent-runtime.ts` can register the tool without rebuilding a second
 * `ProviderClient` from `options.config.llm` on its own. `undefined` when no
 * LLM provider is configured (R2) — the tool is then simply not registered,
 * exactly like `createThemeWiring`'s own `generator` field.
 */
export async function createThemeCreatorToolWiring(options: ThemeWiringOptions): Promise<
  | {
      readonly client: ProviderClient
      readonly model: string
      readonly availableThemes: readonly ThemeCreatorTargetTheme[]
    }
  | undefined
> {
  const llm = options.config.llm
  const apiKey = llm?.apiKey
  const client =
    llm === undefined || apiKey === undefined || apiKey === ''
      ? undefined
      : providerClient(llm, apiKey)
  if (client === undefined || llm === undefined) return undefined

  return {
    client,
    model: llm.model,
    availableThemes: (await availableThemes()).map(
      (theme): ThemeCreatorTargetTheme => ({ name: theme.name, label: theme.label }),
    ),
  }
}

/**
 * The live stylesheet a page or the `/_cogenta/styles.css` route serves:
 * `theme.tokens.json` overlaid with whatever an `admin` saved from the
 * appearance screen, plus that screen's additional CSS appended after —
 * recomputed on every call, never cached across requests, which is what
 * makes a saved change visible on the very next page view rather than only
 * after a restart (the "hot swap" contract D already promises for the file
 * alone).
 *
 * An override that no longer validates against the *current* file — the
 * file changed under it, most likely, since `set()` only ever stores an
 * overlay that validated at write time — is dropped rather than allowed to
 * break the live site: served tokens fall back to the file alone. This can
 * only happen from an external edit to `theme.tokens.json`; a request
 * through this router's own `PUT` can never write an override that fails
 * this same check.
 */
export async function computeEffectiveStyles(
  wiring: Pick<ThemeRouterOptions, 'store' | 'loadFileTokens' | 'mergeTokens' | 'validateTokens'>,
  themeCss: string | null,
): Promise<string | null> {
  const file = await wiring.loadFileTokens()
  if (file === null) return joinStyles(null, themeCss)

  const overrides = await wiring.store.get()
  let tokens = file
  if (overrides.tokenOverrides !== null) {
    const merged = wiring.mergeTokens(file, overrides.tokenOverrides)
    try {
      wiring.validateTokens(merged)
      tokens = merged
    } catch {
      tokens = file
    }
  }

  const skinCss = renderSkin(tokens as never).css
  const combined =
    overrides.additionalCss === null || overrides.additionalCss === ''
      ? skinCss
      : `${skinCss}\n${overrides.additionalCss}`
  return joinStyles(combined, themeCss)
}

/**
 * The appearance screen's live preview (fiche 14 task 2): the same iframe-
 * on-the-real-server-render decision L16 made for the page builder, applied
 * to a token *overlay* nobody has saved yet instead of an unsaved block
 * list. Never reads or writes the database — the candidate overlay is
 * exactly what the client is currently editing, sent whole on every
 * keystroke's debounced request, the same way the builder's preview sends
 * the whole block list rather than a diff.
 *
 * Throws the real `validateSkin` refusal (a `CogentaError`) when the
 * candidate breaks contract D — the caller (`serve.ts`) turns that into the
 * same 422 `PUT /api/theme/overrides` would give the same input, so a
 * preview can never show a state a save would actually accept differently.
 */
export async function computePreviewStyles(
  wiring: Pick<ThemeRouterOptions, 'loadFileTokens' | 'mergeTokens' | 'validateTokens'>,
  themeCss: string | null,
  candidate: { readonly tokens?: Record<string, unknown>; readonly additionalCss?: string },
): Promise<string | null> {
  const file = await wiring.loadFileTokens()
  if (file === null) return joinStyles(null, themeCss)

  let tokens: Record<string, unknown> = file
  if (candidate.tokens !== undefined) {
    tokens = wiring.mergeTokens(file, candidate.tokens)
    wiring.validateTokens(tokens)
  }

  const skinCss = renderSkin(tokens as never).css
  const combined =
    candidate.additionalCss === undefined || candidate.additionalCss === ''
      ? skinCss
      : `${skinCss}\n${candidate.additionalCss}`
  return joinStyles(combined, themeCss)
}
