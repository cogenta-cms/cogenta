import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * "Apparence" (fiche 14): the screen the fiche names as one of the CMS's
 * remaining blank spots. Every assertion here checks a real round trip
 * through the mocked `/api/theme` surface, the same discipline
 * `seo.test.tsx`/`settings.test.tsx` already follow — never a snapshot of
 * markup alone. Strings asserted are French: the test harness's default
 * locale, same as every other route test in this suite.
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

async function goToAppearance(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Apparence' }))
  await screen.findByRole('heading', { name: 'Apparence', level: 1 })
}

const CLINICAL_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#047857',
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
  shadow: { sm: '0 1px 2px rgba(0,0,0,.06)', md: '0 6px 20px rgba(0,0,0,.12)' },
}

describe('the appearance screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    window.history.pushState(null, '', '/appearance')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('shows the file tokens and says every value comes from the file before any change', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    expect(
      await screen.findByText(
        "Chaque valeur affichée ici vient de theme.tokens.json — rien n'a encore été surchargé.",
      ),
    ).toBeDefined()
    expect(screen.getByDisplayValue('#1d4ed8')).toBeDefined()
  })

  it('says the AI section is unavailable without a provider, and hides it entirely', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    expect(screen.queryByText('Générer un thème')).toBeNull()
  })

  it('shows the AI section, generates candidates, and applies none of them automatically (R6)', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'editorial',
          label: 'Warm editorial',
          rationale: 'warm, paper-like',
          tokens: { ...CLINICAL_TOKENS, color: { ...CLINICAL_TOKENS.color, accent: '#c2410c' } },
        },
      ],
    })
    render(<App />)
    await goToAppearance()

    const description = await screen.findByPlaceholderText('Sobre, chaleureux, plutôt papier')
    fireEvent.change(description, { target: { value: 'warm, editorial, paper-like' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    await screen.findByText('Warm editorial')
    // Not applied yet — the file's original accent is still what is shown.
    expect(screen.getByDisplayValue('#1d4ed8')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    await waitFor(() => expect(screen.getByDisplayValue('#c2410c')).toBeDefined())
    // Still not saved — the "Enregistrer" click below is still required.
  })

  it('saves a token change and reflects the "overridden" provenance afterwards', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    const accentInput = await screen.findByDisplayValue('#1d4ed8')
    fireEvent.change(accentInput, { target: { value: '#7c3aed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText(
      'Certaines valeurs ci-dessous sont des surcharges enregistrées en base, par-dessus theme.tokens.json.',
    )
  })

  it('warns about insufficient contrast without blocking the editor from continuing to type', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    const fgInput = await screen.findByDisplayValue('#16181d')
    fireEvent.change(fgInput, { target: { value: '#fefefe' } })

    expect(
      await screen.findByText(/Certaines combinaisons de couleurs échouent le contraste AA/),
    ).toBeDefined()
  })

  it('lists gallery skins and applies one on click', async () => {
    signedIn(['admin'], {
      skins: [
        {
          id: 'skin-1',
          displayName: 'Clean and clinical',
          description: null,
          submittedAt: '2026-01-01T00:00:00.000Z',
          tokens: CLINICAL_TOKENS,
        },
      ],
    })
    render(<App />)
    await goToAppearance()

    await screen.findByText('Clean and clinical')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))

    await waitFor(() =>
      expect(
        screen.getByText(
          'Certaines valeurs ci-dessous sont des surcharges enregistrées en base, par-dessus theme.tokens.json.',
        ),
      ).toBeDefined(),
    )
  })

  it('hides the export-to-file action when this instance is not development', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    expect(screen.queryByRole('button', { name: 'Exporter vers theme.tokens.json' })).toBeNull()
  })

  it('shows the export-to-file action under development', async () => {
    signedIn(['admin'], { exportAvailable: true })
    render(<App />)
    await goToAppearance()

    expect(
      await screen.findByRole('button', { name: 'Exporter vers theme.tokens.json' }),
    ).toBeDefined()
  })
})

describe('the appearance screen — theme picker (fiche L23)', () => {
  it('renders without crashing when the server predates availableThemes (version-mismatch)', async () => {
    // Caught live: a rebuilt admin bundle talking to a `cogenta serve`
    // process still running the pre-L23 `theme-router.js` it loaded at
    // startup answers GET /api/theme with no `availableThemes` key at all —
    // `undefined.map()` crashed the whole screen. The picker must degrade to
    // an empty list instead, same R1/R2 spirit as every other optional
    // section on this screen (the AI panel, the skin gallery).
    signedIn(['admin'], { omitAvailableThemesField: true })
    render(<App />)
    await goToAppearance()

    expect(await screen.findByRole('heading', { name: 'Thème du site' })).toBeDefined()
    expect(screen.queryByText('Canonical')).toBeNull()
  })

  it('marks the built-in default active when no theme was ever chosen', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    const canonicalCard = (await screen.findByText('Canonical')).closest('li')
    expect(canonicalCard).not.toBeNull()
    expect(canonicalCard?.textContent).toContain('Actif')
    // The active theme's own action is disabled — visible, never hidden, so
    // the card's shape stays identical across every theme in the list.
    const selectButton = within(canonicalCard as HTMLElement).getByRole('button', {
      name: 'Sélectionner',
    })
    expect((selectButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists every installed theme and switches to the one an admin picks', async () => {
    signedIn(['admin'], {
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
    })
    render(<App />)
    await goToAppearance()

    await screen.findByText('Portfolio')
    const portfolioCard = screen.getByText('Portfolio').closest('li') as HTMLElement
    fireEvent.click(within(portfolioCard).getByRole('button', { name: 'Sélectionner' }))

    await waitFor(() => {
      const refreshedCard = screen.getByText('Portfolio').closest('li') as HTMLElement
      expect(within(refreshedCard).queryByText('Actif')).not.toBeNull()
    })
    // Switching theme never touches the skin's own provenance notice — a
    // layout switch is not a colour override.
    expect(
      screen.getByText(
        "Chaque valeur affichée ici vient de theme.tokens.json — rien n'a encore été surchargé.",
      ),
    ).toBeDefined()
  })
})
