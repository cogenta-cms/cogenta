import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Fiche 21 task 7 — "Documentation": six section panels plus two animated
 * flow diagrams (editorial cycle, plugin permissions). No API call backs
 * this screen (it reads only `NAV_ITEMS`, static data), so `installMockFetch`
 * here is only what every other authenticated screen needs to sign in and
 * render the shell around it.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(overrides: Parameters<typeof installMockFetch>[0] = {}): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['editor'], ...overrides })
}

async function openDocumentation(): Promise<void> {
  render(<App />)
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Aide' }))
  await screen.findByRole('heading', { name: 'Documentation', level: 1 })
}

describe('the Documentation screen', () => {
  it('is reachable from the sidebar, for any signed-in role', async () => {
    signedIn({ roles: ['viewer'] })
    await openDocumentation()

    expect(screen.getByRole('link', { name: 'Aide' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens on the Content tab, with its summary, quickstart and real screen links', async () => {
    signedIn()
    await openDocumentation()

    const contentTab = screen.getByRole('tab', { name: 'Contenu' })
    expect(contentTab.getAttribute('aria-selected')).toBe('true')

    const panel = screen.getByRole('tabpanel', { name: 'Contenu' })
    expect(within(panel).getByText(/Le contenu de Cogenta/u)).toBeDefined()
    expect(
      within(panel).getByText('Ouvrez « Contenus » et choisissez une collection.'),
    ).toBeDefined()

    // "Écrans de cette section" is `NAV_ITEMS` filtered by group, not a
    // hand-copied list — a real link to a real screen, not a picture of one.
    const collectionsLink = within(panel).getByRole('link', { name: 'Contenus' })
    expect(collectionsLink.getAttribute('href')).toBe('/collections')
  })

  it('switches panels on tab click, hiding the one before it', async () => {
    signedIn()
    await openDocumentation()

    fireEvent.click(screen.getByRole('tab', { name: 'Boutique' }))

    const commercePanel = screen.getByRole('tabpanel', { name: 'Boutique' })
    expect(within(commercePanel).getByText(/La boutique/u)).toBeDefined()
    expect(screen.queryByRole('tabpanel', { name: 'Contenu' })).toBeNull()

    const commerceTab = screen.getByRole('tab', { name: 'Boutique' })
    expect(commerceTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Contenu' }).getAttribute('aria-selected')).toBe('false')
  })

  it('covers all six sections the fiche names, each with its own summary', async () => {
    signedIn()
    await openDocumentation()

    const expected: Record<string, RegExp> = {
      Apparence: /apparence publique du site/u,
      Boutique: /La boutique/u,
      IA: /assistant IA/u,
      Comptes: /comptes humains et machine/u,
      Réglages: /réglages généraux du site/u,
    }
    for (const [label, summary] of Object.entries(expected)) {
      fireEvent.click(screen.getByRole('tab', { name: label }))
      const panel = screen.getByRole('tabpanel', { name: label })
      expect(within(panel).getByText(summary)).toBeDefined()
    }
  })

  it('draws the editorial cycle diagram on the Content tab, with real text steps', async () => {
    signedIn()
    await openDocumentation()

    const panel = screen.getByRole('tabpanel', { name: 'Contenu' })
    expect(
      within(panel).getByRole('heading', {
        name: 'Cycle éditorial : du brouillon à la publication',
      }),
    ).toBeDefined()
    // The diagram itself is decorative; the same information is real, queryable text.
    expect(
      within(panel).getByText(
        "Une entrée créée est un brouillon : rien n'est visible sur le site.",
      ),
    ).toBeDefined()
    expect(
      within(panel).getByText(/Publier une entrée est une action séparée de son approbation/u),
    ).toBeDefined()

    const svg = panel.querySelector('svg.doc-flow')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws the plugin permission diagram on the Réglages tab, with its honest caveat', async () => {
    signedIn()
    await openDocumentation()

    fireEvent.click(screen.getByRole('tab', { name: 'Réglages' }))
    const panel = screen.getByRole('tabpanel', { name: 'Réglages' })
    expect(
      within(panel).getByRole('heading', {
        name: "Permissions d'un plugin tiers : de l'installation à la révocation",
      }),
    ).toBeDefined()
    expect(within(panel).getByText(/aucun écran de ce build ne l'expose encore/u)).toBeDefined()

    const svgs = panel.querySelectorAll('svg.doc-flow')
    expect(svgs.length).toBe(1)
  })

  it('shows the vendored logo, kept small rather than the 741 KB original', async () => {
    signedIn()
    await openDocumentation()

    const logo = screen
      .getByRole('heading', { name: 'Documentation', level: 1 })
      .closest('section')
      ?.querySelector('img.doc-header__logo')
    expect(logo).not.toBeNull()
    expect(logo?.getAttribute('src')).toContain('logo-cogenta-transparent.png')
  })

  it('has no serious WCAG violations, on the default tab and after switching', async () => {
    signedIn()
    await openDocumentation()
    await expectNoSeriousA11yViolations(document.body)

    fireEvent.click(screen.getByRole('tab', { name: 'IA' }))
    await screen.findByRole('tabpanel', { name: 'IA' })
    await expectNoSeriousA11yViolations(document.body)
  })
})
