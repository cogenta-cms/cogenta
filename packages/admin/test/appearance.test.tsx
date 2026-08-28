import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * "Apparence" (fiche 14, gallery/personalize split fiche 48): the screen the
 * fiche names as one of the CMS's remaining blank spots. Every assertion
 * here checks a real round trip through the mocked `/api/theme` surface, the
 * same discipline `seo.test.tsx`/`settings.test.tsx` already follow — never
 * a snapshot of markup alone. Strings asserted are French: the test
 * harness's default locale, same as every other route test in this suite.
 *
 * Fiche 48 splits what used to be one continuous screen into a gallery
 * (theme metadata, switching) and a personalization screen (tokens, CSS,
 * identity, skin gallery, AI) reached through a "Personnaliser" button on
 * the active theme's card. `personalize()` below is what every test that
 * exercises the personalization controls now has to call first — those
 * controls are no longer visible on arrival.
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

/** Enters the personalization screen from the gallery, via the active card's "Personnaliser" action (fiche 48). */
async function personalize(activeLabel = 'Canonical'): Promise<void> {
  const activeCard = (await screen.findByText(activeLabel)).closest('li') as HTMLElement
  fireEvent.click(within(activeCard).getByRole('button', { name: 'Personnaliser' }))
  await screen.findByRole('heading', { name: 'Personnaliser', level: 2 })
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

  it('lands on the theme gallery first, with no personalization control visible', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()

    await screen.findByRole('heading', { name: 'Thème du site' })
    // Nothing the old single screen used to show immediately is here yet —
    // the fiche's own acceptance criterion ("la galerie ne montre plus les
    // contrôles de personnalisation").
    expect(screen.queryByDisplayValue('#1d4ed8')).toBeNull()
    expect(screen.queryByText('CSS additionnel')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('shows the file tokens and says every value comes from the file before any change', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()
    await personalize()

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
    await personalize()

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
    await personalize()

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
    await personalize()

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
    await personalize()

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
    await personalize()

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
    await personalize()

    expect(screen.queryByRole('button', { name: 'Exporter vers theme.tokens.json' })).toBeNull()
  })

  it('shows the export-to-file action under development', async () => {
    signedIn(['admin'], { exportAvailable: true })
    render(<App />)
    await goToAppearance()
    await personalize()

    expect(
      await screen.findByRole('button', { name: 'Exporter vers theme.tokens.json' }),
    ).toBeDefined()
  })
})

describe('the appearance screen — gallery/personalize navigation (fiche 48)', () => {
  it('goes from the gallery to personalization and back, preserving the edit made in between', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAppearance()
    await personalize()

    const accentInput = await screen.findByDisplayValue('#1d4ed8')
    fireEvent.change(accentInput, { target: { value: '#7c3aed' } })

    fireEvent.click(screen.getByRole('button', { name: 'Retour à la galerie' }))
    await screen.findByRole('heading', { name: 'Thème du site' })
    // Back on the gallery: the personalization controls are gone again.
    expect(screen.queryByDisplayValue('#7c3aed')).toBeNull()

    await personalize()
    // The unsaved edit survived the round trip — this is in-page navigation,
    // never a reload, so component state is untouched.
    expect(await screen.findByDisplayValue('#7c3aed')).toBeDefined()
  })

  it('shows version and author on every gallery card, from the theme manifest', async () => {
    signedIn(['admin'], {
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
    render(<App />)
    await goToAppearance()

    const canonicalCard = (await screen.findByText('Canonical')).closest('li') as HTMLElement
    expect(within(canonicalCard).getByText('Version 1.1.0')).toBeDefined()
    expect(within(canonicalCard).getByText('Par Cogenta')).toBeDefined()
  })

  it('renders a card cleanly when a theme declares no author (a third-party theme, fiche 48)', async () => {
    signedIn(['admin'], {
      availableThemes: [
        {
          name: '@cogenta/theme-canonical',
          label: 'Canonical',
          description: 'The reference theme.',
          version: '1.1.0',
          author: null,
        },
      ],
    })
    render(<App />)
    await goToAppearance()

    const canonicalCard = (await screen.findByText('Canonical')).closest('li') as HTMLElement
    expect(within(canonicalCard).getByText('Version 1.1.0')).toBeDefined()
    expect(within(canonicalCard).queryByText(/^Par /)).toBeNull()
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
    // Only the active card gets a way into personalization (fiche 48) —
    // colours apply to whichever theme is active, so there is exactly one
    // meaningful destination, never a "Personnaliser" per inactive theme.
    expect(
      within(canonicalCard as HTMLElement).getByRole('button', { name: 'Personnaliser' }),
    ).toBeDefined()
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
    // layout switch is not a colour override. The notice now lives in the
    // personalization screen (fiche 48), reached through the newly-active
    // card's "Personnaliser" action.
    await personalize('Portfolio')
    expect(
      screen.getByText(
        "Chaque valeur affichée ici vient de theme.tokens.json — rien n'a encore été surchargé.",
      ),
    ).toBeDefined()
  })
})

describe('the appearance screen — theme gallery preview (fiche L24 task 5)', () => {
  it('shows a real visual preview for every installed theme, not a placeholder', async () => {
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

    // One iframe per theme card, each fetched and rendered on its own —
    // never a shared placeholder image, never the same document twice.
    const canonicalFrame = (await screen.findByTitle(
      'Aperçu du thème Canonical',
    )) as HTMLIFrameElement
    const portfolioFrame = (await screen.findByTitle(
      'Aperçu du thème Portfolio',
    )) as HTMLIFrameElement

    await waitFor(() => {
      expect(canonicalFrame.getAttribute('srcdoc')).toContain(
        'gallery preview of @cogenta/theme-canonical',
      )
      expect(portfolioFrame.getAttribute('srcdoc')).toContain(
        'gallery preview of @cogenta/theme-portfolio',
      )
    })
    // Decorative: the picker's own "Sélectionner" button is what an admin
    // acts through, not a tab stop inside the thumbnail.
    expect(canonicalFrame.getAttribute('aria-hidden')).toBe('true')
    expect(canonicalFrame.tabIndex).toBe(-1)
  })
})
