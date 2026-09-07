import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type AgentDeclarationStore,
  createAnthropicClient,
  createGoogleClient,
  createOpenAiClient,
  createProgressJobStore,
  createProviderRegistry,
  type ProviderClient,
  type ProviderConfigStore,
  type ProviderTuningDefaults,
  proposeThemeCandidates,
  resolveProviderRegistryConfig,
  resolveProviderTuningDefaults,
  THEME_CREATOR_AGENT_NAME,
  type ThemeCreatorTargetTheme,
} from '@cogenta/agents'
import type { ThemeRouterOptions } from '@cogenta/api'
import type { CogentaConfig, DatabaseHandle, Logger } from '@cogenta/core'
import { createSkinGallery, ensureRegistryTables } from '@cogenta/plugins'
import { mergeSkinTokens, renderSkin, validateSkin } from '@cogenta/render'
import {
  createSiteSettingsStore,
  createThemeStore,
  ensureSiteSettingsTables,
  ensureThemeTable,
} from '@cogenta/schema'
import { availableThemes } from './theme-registry.js'
import { joinStyles } from './theme-render.js'
import { deleteSandboxFile, writeSandboxFile } from './theme-sandbox.js'

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
  /**
   * The same dynamic, admin-configurable provider store every other agent's
   * client is resolved from (`/admin/providers` → `ProviderConfigStore`,
   * encrypted at rest, refreshed live on every save — see
   * `agent-runtime.ts`'s `createLiveProviderRegistry`). Preferred over
   * `config.llm` below whenever present: a site whose admin configured a
   * provider through the UI, rather than by hand-editing
   * `cogenta.config.mjs`, must see the same "AI available" answer here as
   * everywhere else in the app. Absent only when `runServe` was given no
   * `agentsRuntimeConfig` at all (a bare `Site` built by hand, tests
   * included) — `config.llm` is the sole fallback then, same as before this
   * field existed.
   */
  readonly providerStore?: ProviderConfigStore
  /**
   * The same `AgentDeclarationStore` `buildAgentRuntime` reads the "Cogenta
   * Theme Creator" agent's declaration from (a second, independent instance
   * pointed at the same directory — the same "two readers of the same
   * files" pattern `providerStore` above already uses). Read *fresh on every
   * call* (see `resolveThemeProvider`) so an admin editing that agent's
   * "Modèle" field — "Préféré : google — repli : openai", say — from
   * `/admin/agents/Cogenta Theme Creator` takes effect on the theme
   * generator's very next request, exactly like a provider key saved from
   * `/admin/providers` already does. Absent only alongside `providerStore`
   * (a bare `Site` built by hand, tests included) — `THEME_PROVIDER_PREFERENCE`
   * is the sole fallback then.
   */
  readonly agentStore?: AgentDeclarationStore
  /** Fed to `createProgressJobStore` so a failed generation job is logged server-side, not only visible to whoever was polling it live. */
  readonly logger?: Logger
}

function providerClient(
  llm: NonNullable<CogentaConfig['llm']>,
  apiKey: string,
  defaults: ProviderTuningDefaults,
): ProviderClient | undefined {
  const config = {
    apiKey,
    model: llm.model,
    ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
    defaults,
  }
  if (llm.provider === 'anthropic') return createAnthropicClient(config)
  if (llm.provider === 'openai') return createOpenAiClient(config)
  if (llm.provider === 'google') return createGoogleClient(config)
  return undefined
}

/**
 * The seed default from `THEME_CREATOR_AGENT_NAME`'s own builtin declaration
 * (`packages/agents/src/agents/builtins.ts`'s `DEFAULT_MODEL`) — used only
 * when `agentStore` is absent, or the agent's own record can't be read for
 * some reason. Whenever the agent's declaration *is* readable,
 * `resolveThemeProvider` reads its live `model.preferred`/`model.fallback`
 * instead: an admin who repoints that agent at a different provider from its
 * own settings screen must see the theme generator follow, not silently
 * ignore that choice and keep trying this hardcoded pair forever.
 */
const THEME_PROVIDER_PREFERENCE: {
  readonly preferred: string
  readonly fallback?: string
  readonly model?: string
} = {
  preferred: 'anthropic',
  fallback: 'openai',
}

/**
 * The one place either theme-AI entry point (the plain skin generator and
 * `theme.propose_theme`) resolves a `ProviderClient` from — tries the live,
 * admin-configurable store first (same "preferred, then fallback" policy
 * `agents/orchestrator.ts`'s own `resolveProvider` uses for every other
 * agent), falls back to `config.llm` only when that store was never given
 * at all. Never throws: `undefined` is the R2 "no provider" answer both
 * `createThemeWiring`'s `generator` and `createThemeCreatorToolWiring`
 * already turn into "this feature simply isn't offered".
 */
/** Whether this instance has *any* avenue to a provider at all — see `resolveThemeProvider`'s own comment on the distinction from "one is currently resolvable". */
function hasThemeProviderAvenue(options: ThemeWiringOptions): boolean {
  return options.providerStore !== undefined || options.config.llm !== undefined
}

async function resolveThemeProvider(
  options: ThemeWiringOptions,
): Promise<{ readonly client: ProviderClient; readonly model: string } | undefined> {
  // Same `assistant.default*` site settings every other resolved client
  // falls back to (`resolveProviderTuningDefaults`) — read fresh on every
  // call, matching this function's own "no restart needed" reasoning for
  // `providerStore`/`agentStore` above.
  const defaults = await resolveProviderTuningDefaults(createSiteSettingsStore({ db: options.db }))

  if (options.providerStore !== undefined) {
    const registry = createProviderRegistry(
      await resolveProviderRegistryConfig(options.providerStore),
      defaults,
    )
    const declared = await options.agentStore?.get(THEME_CREATOR_AGENT_NAME)
    const preference = declared?.model ?? THEME_PROVIDER_PREFERENCE
    const name = registry.has(preference.preferred)
      ? preference.preferred
      : preference.fallback !== undefined && registry.has(preference.fallback)
        ? preference.fallback
        : undefined
    if (name !== undefined) {
      const client = registry.get(name)
      const modelOverride = preference.model?.trim()
      return {
        client,
        model: modelOverride === undefined || modelOverride === '' ? client.model : modelOverride,
      }
    }
  }
  const llm = options.config.llm
  const apiKey = llm?.apiKey
  if (llm === undefined || apiKey === undefined || apiKey === '') return undefined
  const client = providerClient(llm, apiKey, defaults)
  return client === undefined ? undefined : { client, model: llm.model }
}

export async function createThemeWiring(options: ThemeWiringOptions): Promise<ThemeRouterOptions> {
  await ensureThemeTable(options.db)
  await ensureRegistryTables(options.db)
  await ensureSiteSettingsTables(options.db)

  const tokensPath = join(options.projectRoot, TOKENS_FILE)
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
    ...(!hasThemeProviderAvenue(options)
      ? {}
      : {
          generator: {
            isAvailable: async () => (await resolveThemeProvider(options)) !== undefined,
            generate: async (
              input: {
                readonly description: string
                readonly attachments?: readonly {
                  readonly filename: string
                  readonly mimeType: string
                  readonly data: Uint8Array
                }[]
                readonly baseline?: { readonly themeName: string }
              },
              onProgress?: { report(message: string): void },
            ) => {
              const resolved = await resolveThemeProvider(options)
              if (resolved === undefined) {
                return { ok: false as const, reason: 'No LLM provider is configured.' }
              }
              const { client, model } = resolved
              const baselineTokens =
                input.baseline === undefined ? null : await resolveBaselineTokens()
              const result = await proposeThemeCandidates({
                client,
                model,
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
                ...(onProgress === undefined ? {} : { onProgress }),
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
          // Fiche feedback — "je ne sais pas si le traitement est en cours
          // ou pas". Own store per `createThemeWiring` call (one per
          // `cogenta serve` boot), same lifetime as `generator` itself.
          progressJobs: createProgressJobStore({
            ...(options.logger === undefined ? {} : { logger: options.logger }),
          }),
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
 * wiring time — a live `resolveProvider()` (never a `client`/`model`
 * resolved once and captured, the exact bug this was rewritten to fix: a
 * provider saved through `/admin/providers` after `cogenta serve` boot used
 * to stay invisible to this tool for the rest of the process's life) plus
 * `availableThemes`. `undefined` only when this instance has no avenue to a
 * provider at all (R2) — the tool is then simply not registered, exactly
 * like `createThemeWiring`'s own `generator` field; once registered, a call
 * with no provider *currently* configured resolves to `{ ok: false }`
 * rather than the tool vanishing again.
 */
export async function createThemeCreatorToolWiring(options: ThemeWiringOptions): Promise<
  | {
      readonly resolveProvider: () => Promise<
        { readonly client: ProviderClient; readonly model: string } | undefined
      >
      readonly availableThemes: readonly ThemeCreatorTargetTheme[]
    }
  | undefined
> {
  if (!hasThemeProviderAvenue(options)) return undefined
  await ensureSiteSettingsTables(options.db)

  return {
    resolveProvider: () => resolveThemeProvider(options),
    availableThemes: (await availableThemes()).map(
      (theme): ThemeCreatorTargetTheme => ({ name: theme.name, label: theme.label }),
    ),
  }
}

/**
 * The ingredients `theme.write_sandbox_file` (`@cogenta/agents-builtin`,
 * fiche 73 task 7) needs — unlike `createThemeCreatorToolWiring` above, this
 * needs no `ProviderClient` at all (writing a file is not a model call), so
 * it is never gated on R2's "no provider configured" check and is always
 * returned: `runServe` always knows its own `projectRoot`. The two functions
 * this closes over (`writeSandboxFile`/`deleteSandboxFile`, `theme-sandbox
 * .ts`) already carry the real path-escape guard (piège n°3-adjacent, see
 * their own doc comments) — this wiring adds nothing on top of them, it only
 * binds `projectRoot`.
 */
export function createThemeSandboxToolWiring(projectRoot: string): {
  readonly writeFile: (input: {
    readonly sandboxId: string
    readonly path: string
    readonly content: string
  }) => Promise<{ readonly path: string }>
  readonly deleteFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<void>
} {
  return {
    writeFile: (input) => writeSandboxFile(projectRoot, input.sandboxId, input.path, input.content),
    deleteFile: (input) => deleteSandboxFile(projectRoot, input.sandboxId, input.path),
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

/**
 * The theme gallery's preview of a Theme Creator candidate (L26 task 5) —
 * deliberately **not** `computePreviewStyles` above, despite the similar
 * shape: that function previews an *edit relative to the site's own saved
 * file*, and short-circuits to the file-free default the moment no file
 * exists yet, which is exactly wrong here — a candidate from
 * `theme.propose_theme` is always a complete, self-sufficient skin (the
 * same guarantee `generateSkinCandidates` already gives every caller), with
 * no file to merge onto and no site-specific baseline to fall back to. It is
 * validated and rendered on its own, the same way a *saved* skin already is.
 */
export function computeCandidateGalleryStyles(
  wiring: Pick<ThemeRouterOptions, 'validateTokens'>,
  themeCss: string | null,
  tokens: Record<string, unknown>,
): string | null {
  const validated = wiring.validateTokens(tokens)
  return joinStyles(renderSkin(validated as never).css, themeCss)
}
