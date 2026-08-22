import { CogentaError } from '@cogenta/core'
import { mergeSkinTokens, validateSkin } from '@cogenta/render'
import { describe, expect, it } from 'vitest'
import {
  createThemeRouter,
  type SetThemeOverridesInputLike,
  type SkinGalleryEntryLike,
  type SkinGalleryLike,
  type ThemeOverridesLike,
  type ThemeStoreLike,
} from '../../src/rest/theme-router.js'
import type { Actor } from '../../src/types.js'

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ANONYMOUS: Actor = { id: null, roles: ['public'] }

const FILE_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f1f2f4',
    mutedFg: '#4b5057',
    border: '#d7dade',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '2px', md: '6px', lg: '12px' },
  motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)', md: '0 6px 20px rgba(0, 0, 0, 0.12)' },
}

function emptyOverrides(): ThemeOverridesLike {
  return {
    tokenOverrides: null,
    additionalCss: null,
    logoMediaId: null,
    logoDarkMediaId: null,
    faviconMediaId: null,
    shareImageMediaId: null,
    activeTheme: null,
    updatedAt: '2026-08-20T00:00:00.000Z',
    updatedBy: null,
  }
}

const AVAILABLE_THEMES = [
  { name: '@cogenta/theme-canonical', label: 'Canonical', description: 'The reference theme.' },
]

function memoryStore(initial: ThemeOverridesLike = emptyOverrides()): ThemeStoreLike & {
  state: ThemeOverridesLike
} {
  const box = { state: initial }
  return {
    get state() {
      return box.state
    },
    set state(value) {
      box.state = value
    },
    async get() {
      return box.state
    },
    async set(input: SetThemeOverridesInputLike) {
      box.state = {
        tokenOverrides:
          input.tokenOverrides === undefined ? box.state.tokenOverrides : input.tokenOverrides,
        additionalCss:
          input.additionalCss === undefined ? box.state.additionalCss : input.additionalCss,
        logoMediaId: input.logoMediaId === undefined ? box.state.logoMediaId : input.logoMediaId,
        logoDarkMediaId:
          input.logoDarkMediaId === undefined ? box.state.logoDarkMediaId : input.logoDarkMediaId,
        faviconMediaId:
          input.faviconMediaId === undefined ? box.state.faviconMediaId : input.faviconMediaId,
        shareImageMediaId:
          input.shareImageMediaId === undefined
            ? box.state.shareImageMediaId
            : input.shareImageMediaId,
        activeTheme: input.activeTheme === undefined ? box.state.activeTheme : input.activeTheme,
        updatedAt: '2026-08-20T01:00:00.000Z',
        updatedBy: input.updatedBy ?? null,
      }
      return box.state
    },
    async clear(updatedBy) {
      // Mirrors the real store: clearing the skin overrides never switches
      // the site back to the default theme (`theme-store.ts`'s own reasoning).
      box.state = {
        ...emptyOverrides(),
        activeTheme: box.state.activeTheme,
        updatedAt: '2026-08-20T02:00:00.000Z',
        updatedBy,
      }
      return box.state
    },
  }
}

function router(overrides: {
  readonly store?: ThemeStoreLike
  readonly fileTokens?: Record<string, unknown> | null
  readonly skinGallery?: SkinGalleryLike
  readonly generator?: Parameters<typeof createThemeRouter>[0]['generator']
  readonly fileExporter?: Parameters<typeof createThemeRouter>[0]['fileExporter']
}) {
  return createThemeRouter({
    store: overrides.store ?? memoryStore(),
    loadFileTokens: async () => overrides.fileTokens ?? FILE_TOKENS,
    validateTokens: (candidate) => validateSkin(candidate) as unknown as Record<string, unknown>,
    mergeTokens: (base, patch) =>
      mergeSkinTokens(base as never, patch as never) as unknown as Record<string, unknown>,
    availableThemes: AVAILABLE_THEMES,
    ...(overrides.skinGallery === undefined ? {} : { skinGallery: overrides.skinGallery }),
    ...(overrides.generator === undefined ? {} : { generator: overrides.generator }),
    ...(overrides.fileExporter === undefined ? {} : { fileExporter: overrides.fileExporter }),
  })
}

describe('createThemeRouter — permissions', () => {
  it('refuses every route to a non-admin', async () => {
    const r = router({})
    const asEditor = await r.handle({ method: 'GET', path: '/api/theme', query: {} }, EDITOR)
    expect(asEditor.status).toBe(403)
    const asAnon = await r.handle(
      { method: 'PUT', path: '/api/theme/overrides', query: {}, body: {} },
      ANONYMOUS,
    )
    expect(asAnon.status).toBe(403)
  })
})

describe('createThemeRouter — GET /api/theme', () => {
  it('reports the file tokens, the (empty) overrides, and the merged effective tokens', async () => {
    const r = router({})
    const response = await r.handle({ method: 'GET', path: '/api/theme', query: {} }, ADMIN)
    expect(response.status).toBe(200)
    const body = response.body as { data: { fileTokens: unknown; effectiveTokens: unknown } }
    expect(body.data.fileTokens).toEqual(FILE_TOKENS)
    expect(body.data.effectiveTokens).toEqual(FILE_TOKENS)
  })

  it('says the AI section and file export are unavailable when neither is configured', async () => {
    const r = router({})
    const response = await r.handle({ method: 'GET', path: '/api/theme', query: {} }, ADMIN)
    const body = response.body as { data: { aiAvailable: boolean; exportAvailable: boolean } }
    expect(body.data.aiAvailable).toBe(false)
    expect(body.data.exportAvailable).toBe(false)
  })

  it('merges a saved override into the effective tokens', async () => {
    const store = memoryStore({
      ...emptyOverrides(),
      tokenOverrides: { color: { accent: '#ff0000' } },
    })
    const r = router({ store })
    const response = await r.handle({ method: 'GET', path: '/api/theme', query: {} }, ADMIN)
    const body = response.body as { data: { effectiveTokens: { color: { accent: string } } } }
    expect(body.data.effectiveTokens.color.accent).toBe('#ff0000')
  })
})

describe('createThemeRouter — PUT /api/theme/overrides', () => {
  it('saves a valid partial token override', async () => {
    const store = memoryStore()
    const r = router({ store })
    const response = await r.handle(
      {
        method: 'PUT',
        path: '/api/theme/overrides',
        query: {},
        body: { tokenOverrides: { color: { accent: '#0a7d3c' } } },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(store.state.tokenOverrides).toEqual({ color: { accent: '#0a7d3c' } })
    expect(store.state.updatedBy).toBe('user-admin')
  })

  it('refuses an override that would break contract D contrast, and does not persist it', async () => {
    const store = memoryStore()
    const r = router({ store })
    const response = await r.handle(
      {
        method: 'PUT',
        path: '/api/theme/overrides',
        query: {},
        body: { tokenOverrides: { color: { fg: '#fefefe' } } },
      },
      ADMIN,
    )
    expect(response.status).toBe(422)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('SKIN_CONTRAST_INSUFFICIENT')
    expect(store.state.tokenOverrides).toBeNull()
  })

  it('refuses additional CSS over the size limit', async () => {
    const r = router({})
    const response = await r.handle(
      {
        method: 'PUT',
        path: '/api/theme/overrides',
        query: {},
        body: { additionalCss: 'a'.repeat(200_000) },
      },
      ADMIN,
    )
    expect(response.status).toBe(422)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('THEME_OVERRIDE_INVALID')
  })

  it('accepts identity media references and additional CSS together', async () => {
    const store = memoryStore()
    const r = router({ store })
    const response = await r.handle(
      {
        method: 'PUT',
        path: '/api/theme/overrides',
        query: {},
        body: { logoMediaId: 'media-1', additionalCss: '.a { color: red; }' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(store.state.logoMediaId).toBe('media-1')
    expect(store.state.additionalCss).toBe('.a { color: red; }')
  })

  it('DELETE clears every override', async () => {
    const store = memoryStore({
      ...emptyOverrides(),
      tokenOverrides: { color: { accent: '#ff0000' } },
      additionalCss: '.a{}',
    })
    const r = router({ store })
    const response = await r.handle(
      { method: 'DELETE', path: '/api/theme/overrides', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(store.state.tokenOverrides).toBeNull()
    expect(store.state.additionalCss).toBeNull()
  })

  it('GET echoes the available themes for the picker', async () => {
    const r = router({})
    const response = await r.handle({ method: 'GET', path: '/api/theme', query: {} }, ADMIN)
    expect(response.status).toBe(200)
    const body = response.body as { data: { availableThemes: unknown } }
    expect(body.data.availableThemes).toEqual(AVAILABLE_THEMES)
  })

  it('saves a valid activeTheme switch (fiche L23)', async () => {
    const store = memoryStore()
    const r = router({ store })
    const response = await r.handle(
      {
        method: 'PUT',
        path: '/api/theme/overrides',
        query: {},
        body: { activeTheme: '@cogenta/theme-canonical' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(store.state.activeTheme).toBe('@cogenta/theme-canonical')
  })

  it('refuses an activeTheme this instance does not have installed', async () => {
    const store = memoryStore()
    const r = router({ store })
    const response = await r.handle(
      {
        method: 'PUT',
        path: '/api/theme/overrides',
        query: {},
        body: { activeTheme: '@cogenta/theme-does-not-exist' },
      },
      ADMIN,
    )
    expect(response.status).toBe(404)
    // Never partially applied: a refused switch must not have written anything.
    expect(store.state.activeTheme).toBeNull()
  })
})

describe('createThemeRouter — skin gallery', () => {
  function gallery(entries: readonly SkinGalleryEntryLike[]): SkinGalleryLike {
    return {
      async listAccepted() {
        return entries
      },
      async get(id) {
        return entries.find((entry) => entry.id === id) ?? null
      },
    }
  }

  it('lists accepted skins from the gallery', async () => {
    const entries: readonly SkinGalleryEntryLike[] = [
      {
        id: 'skin-1',
        displayName: 'Warm editorial',
        description: null,
        submittedAt: '2026-08-01T00:00:00.000Z',
        tokens: FILE_TOKENS,
      },
    ]
    const r = router({ skinGallery: gallery(entries) })
    const response = await r.handle({ method: 'GET', path: '/api/theme/skins', query: {} }, ADMIN)
    expect(response.status).toBe(200)
    const body = response.body as { data: readonly { id: string }[] }
    expect(body.data.map((entry) => entry.id)).toEqual(['skin-1'])
  })

  it('applies a gallery skin as an override overlay', async () => {
    const store = memoryStore()
    const entries: readonly SkinGalleryEntryLike[] = [
      {
        id: 'skin-1',
        displayName: 'Warm editorial',
        description: null,
        submittedAt: '2026-08-01T00:00:00.000Z',
        tokens: { ...FILE_TOKENS, color: { ...FILE_TOKENS.color, accent: '#c2410c' } },
      },
    ]
    const r = router({ store, skinGallery: gallery(entries) })
    const response = await r.handle(
      { method: 'POST', path: '/api/theme/skins/skin-1/apply', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(store.state.tokenOverrides).toEqual({ color: { accent: '#c2410c' } })
  })

  it('404s applying an unknown skin id', async () => {
    const r = router({ skinGallery: gallery([]) })
    const response = await r.handle(
      { method: 'POST', path: '/api/theme/skins/nope/apply', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('THEME_SKIN_NOT_FOUND')
  })
})

describe('createThemeRouter — AI generation (R2/R6)', () => {
  it('answers THEME_NO_PROVIDER when no generator is configured', async () => {
    const r = router({})
    const response = await r.handle(
      { method: 'POST', path: '/api/theme/generate', query: {}, body: { description: 'warm' } },
      ADMIN,
    )
    expect(response.status).toBe(501)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('THEME_NO_PROVIDER')
  })

  it('returns candidates without applying any of them (R6)', async () => {
    const store = memoryStore()
    const r = router({
      store,
      generator: {
        async generate() {
          return {
            ok: true,
            candidates: [
              { id: 'editorial', label: 'Warm editorial', rationale: 'warm', tokens: FILE_TOKENS },
              { id: 'bold', label: 'Bold', rationale: 'bold', tokens: FILE_TOKENS },
            ],
          }
        },
      },
    })
    const response = await r.handle(
      {
        method: 'POST',
        path: '/api/theme/generate',
        query: {},
        body: { description: 'sober, warm, paper-like' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { candidates: readonly { id: string }[] } }
    expect(body.data.candidates).toHaveLength(2)
    // Nothing was written — generating is never applying.
    expect(store.state.tokenOverrides).toBeNull()
  })

  it('rejects an empty description before calling the generator', async () => {
    let called = false
    const r = router({
      generator: {
        async generate() {
          called = true
          return { ok: true, candidates: [] }
        },
      },
    })
    const response = await r.handle(
      { method: 'POST', path: '/api/theme/generate', query: {}, body: { description: '' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })
})

describe('createThemeRouter — export (development only)', () => {
  it('answers THEME_EXPORT_NOT_ALLOWED when no exporter is configured', async () => {
    const r = router({})
    const response = await r.handle({ method: 'POST', path: '/api/theme/export', query: {} }, ADMIN)
    expect(response.status).toBe(409)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('THEME_EXPORT_NOT_ALLOWED')
  })

  it('writes the effective (merged) tokens through the injected exporter', async () => {
    const store = memoryStore({
      ...emptyOverrides(),
      tokenOverrides: { color: { accent: '#0a7d3c' } },
    })
    let exported: unknown = null
    const r = router({
      store,
      fileExporter: async (tokens) => {
        exported = tokens
      },
    })
    const response = await r.handle({ method: 'POST', path: '/api/theme/export', query: {} }, ADMIN)
    expect(response.status).toBe(200)
    expect((exported as { color: { accent: string } }).color.accent).toBe('#0a7d3c')
  })
})

describe('createThemeRouter — unknown routes', () => {
  it('404s a path this router does not own', async () => {
    const r = router({})
    const response = await r.handle({ method: 'GET', path: '/api/theme/nope', query: {} }, ADMIN)
    expect(response.status).toBe(404)
  })

  it('surfaces a CogentaError raised anywhere as a real error response', () => {
    expect(new CogentaError({ code: 'THEME_NO_PROVIDER', message: 'x' }).code).toBe(
      'THEME_NO_PROVIDER',
    )
  })
})
