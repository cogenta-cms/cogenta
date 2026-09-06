import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The full-page "Generate a theme" workshop — describe a theme, attach
 * files, preview one or more AI-generated candidates and activate one, or
 * customize the theme already running instead of starting over.
 *
 * Every assertion here checks a real round trip through the mocked
 * `/api/theme` surface (`generate`, `preview`, `gallery-preview`,
 * `overrides`), the same discipline `appearance.test.tsx`/`site-plan.test.tsx`
 * already follow. Strings asserted are French — this suite's default
 * locale, same as every other route test here.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

type MockFetchOptions = NonNullable<Parameters<typeof installMockFetch>[0]>

function signedIn(roles: readonly string[], theme?: MockFetchOptions['theme']): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...(theme === undefined ? {} : { theme }) })
}

async function goToWorkshop(path = '/theme-generator'): Promise<void> {
  window.history.pushState(null, '', path)
  render(<App />)
  await screen.findByRole('heading', { name: "Générer un thème avec l'IA", level: 1 })
}

/**
 * The heading above resolves the instant the route mounts — before
 * `GET /api/theme` has even returned — so a test exercising the
 * AI-available form has to wait for something that only appears once that
 * fetch has settled and `aiAvailable` is known true. The mode group is that
 * marker: it renders only inside the `theme.aiAvailable` branch.
 */
async function waitForAiReady(): Promise<void> {
  await screen.findByRole('group', { name: 'Que faire' })
}

const WARM_TOKENS = {
  color: {
    bg: '#fffaf3',
    fg: '#2a1d12',
    accent: '#c2410c',
    accentFg: '#ffffff',
    muted: '#f3e9dd',
    mutedFg: '#4b3a2a',
    border: '#e0d2bd',
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
  shadow: { sm: '0 1px 2px rgba(0,0,0,.06)', md: '0 6px 20px rgba(0,0,0,.12)' },
}

describe('the theme generator workshop', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    window.history.pushState(null, '', '/theme-generator')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('explains there is no LLM provider and links to configure one, offering no form at all (R2)', async () => {
    signedIn(['admin'])
    await goToWorkshop()

    expect(
      await screen.findByText(/Générer ou personnaliser un thème avec l'IA nécessite/),
    ).toBeDefined()
    expect(screen.getByRole('link', { name: 'Configurer un fournisseur' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Générer' })).toBeNull()
    expect(screen.queryByLabelText('Description')).toBeNull()
  })

  it('defaults to "new theme" mode with the description field empty', async () => {
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop()
    await waitForAiReady()

    expect(screen.getByRole('button', { name: 'Nouveau thème' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
    expect(
      await screen.findByText(
        "L'IA propose un ou plusieurs thèmes entièrement nouveaux à partir de votre description.",
        { exact: false },
      ),
    ).toBeDefined()
    const generateButton = screen.getByRole('button', { name: 'Générer' })
    expect((generateButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens straight into "customize" mode when the URL carries ?baseline=, and names the theme', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      availableThemes: [
        {
          name: '@cogenta/theme-canonical',
          label: 'Canonical',
          description: 'The reference theme.',
          version: '1.1.0',
          author: 'Cogenta',
        },
      ],
    })
    await goToWorkshop('/theme-generator?baseline=%40cogenta%2Ftheme-canonical')
    await waitForAiReady()

    expect(screen.getByRole('button', { name: 'Personnaliser le thème actuel' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
    expect(
      await screen.findByText(/L'IA ajuste Canonical — le thème actuellement en service/),
    ).toBeDefined()
  })

  it('generates candidates, previews each live, and activates none of them automatically (R6)', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like, generous whitespace.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    const description = screen.getByLabelText('Description')
    fireEvent.change(description, { target: { value: 'warm, editorial, paper-like' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    // A longer timeout than the default 1s: this round-trips through the
    // job's own poll interval (`JOB_POLL_INTERVAL_MS` in
    // `theme-generator.tsx`), which real timers can push past 1s under a
    // fully parallel `pnpm test` run.
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })
    expect(screen.getByText('Warm, paper-like, generous whitespace.')).toBeDefined()

    // Not activated yet — the mock's own `themeOverrides.activeTheme` (read
    // through a fresh `GET /api/theme` after a real activation) would
    // change; nothing here triggers that until "Activer" is clicked.
    expect(screen.queryByText('Activé')).toBeNull()
  })

  it('shows a warning the server sent back rather than dropping it silently', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [],
      generateWarnings: ['An attached image could not be analyzed.'],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'a description' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    expect(
      await screen.findByText('An attached image could not be analyzed.', {}, { timeout: 3000 }),
    ).toBeDefined()
  })

  it('says so when no usable candidate came back', async () => {
    signedIn(['admin'], { aiAvailable: true, generateCandidates: [] })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'a description' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    expect(
      await screen.findByText(
        /Aucun candidat utilisable n'est revenu de cette description/,
        {},
        { timeout: 3000 },
      ),
    ).toBeDefined()
  })

  // Fiche feedback — "je ne sais pas si le traitement est en cours ou pas".
  // The mock keeps the job `'running'` for one poll before settling
  // (`mock-fetch.ts`'s own `mockThemeGenerateJobs`), so this actually
  // exercises the live progress list rendered while waiting, not just the
  // eventual candidates.
  it('shows live progress while candidates are being generated', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'warm, editorial' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    const progress = await screen.findByTestId('theme-generator-progress', {}, { timeout: 3000 })
    expect(progress.textContent).toBe('Mock progress.')
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })
    expect(screen.queryByTestId('theme-generator-progress')).toBeNull()
  })

  it('activates a candidate by saving its tokens wholesale, and confirms it', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'warm, editorial' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))

    await waitFor(() => {
      expect(screen.getByText('Activé.')).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'Activé' })).toBeDefined()
  })

  it('sends activeTheme when a candidate names a theme package', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      availableThemes: [
        {
          name: '@cogenta/theme-canonical',
          label: 'Canonical',
          description: 'The reference theme.',
        },
        {
          name: '@cogenta/theme-portfolio',
          label: 'Portfolio',
          description: 'An ultra-modern portfolio theme.',
        },
      ],
      generateCandidates: [
        {
          id: 'portfolio-warm',
          label: 'Portfolio, warm',
          rationale: 'Warm palette on the portfolio layout.',
          tokens: WARM_TOKENS,
          themeName: '@cogenta/theme-portfolio',
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'a warm portfolio' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Portfolio, warm', {}, { timeout: 3000 })

    // The candidate targets Portfolio while Canonical is active — proof the
    // live preview actually carried the candidate's own tokens to the
    // foreign theme's gallery-preview render, not that theme's own default
    // skin (L26 task 5's gallery-preview widening).
    await waitFor(() => {
      const frame = document.querySelector('iframe') as HTMLIFrameElement | null
      expect(frame?.srcdoc ?? '').toContain(`accent:${WARM_TOKENS.color.accent}`)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(screen.getByText('Activé.')).toBeDefined())

    // Reflected back by the mock's own `GET /api/theme` after the write —
    // proof `activeTheme` really travelled on the `PUT`, not just the tokens.
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau thème' }))
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le thème actuel' }))
    expect(
      await screen.findByText(/L'IA ajuste Portfolio — le thème actuellement en service/),
    ).toBeDefined()
  })

  it('lets an operator switch between "new theme" and "customize current" from inside the workshop', async () => {
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le thème actuel' }))
    expect(window.location.search).toContain('baseline=')
    expect(
      await screen.findByText(/L'IA ajuste Canonical — le thème actuellement en service/),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau thème' }))
    expect(window.location.search).not.toContain('baseline')
    expect(
      await screen.findByText(
        "L'IA propose un ou plusieurs thèmes entièrement nouveaux à partir de votre description.",
        { exact: false },
      ),
    ).toBeDefined()
  })
})
