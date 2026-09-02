import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * L22 task 7 — the in-admin browser for `docs-site/content/**`, reached from
 * the existing Documentation screen (fiche 21 task 7) rather than replacing
 * it. No API call backs this screen either: its content is bundled at build
 * time from real Markdown files (`../../src/documentation/docs-content.ts`),
 * so `installMockFetch` here is, again, only what signing in needs.
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

describe('the full documentation browser', () => {
  it('is reachable from the Documentation screen', async () => {
    signedIn()
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: 'Aide' }))
    await screen.findByRole('heading', { name: 'Documentation', level: 1 })

    fireEvent.click(screen.getByRole('link', { name: 'Ouvrir la documentation complète' }))

    await screen.findByRole('heading', { name: 'Documentation complète', level: 1 })
  })

  it('opens on the functional tree, rendering the real content of functional/index.md', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs')
    render(<App />)

    await screen.findByRole('heading', { name: 'Documentation complète', level: 1 })
    const functionalTab = screen.getByRole('tab', { name: 'Fonctionnelle' })
    expect(functionalTab.getAttribute('aria-selected')).toBe('true')

    // The page's own `# Documentation fonctionnelle` (its content, not a
    // second title this screen invented) renders as the content's heading —
    // see documentation-docs.tsx's own comment on why there is no separate
    // `<CardTitle>` repeating the same text.
    expect(
      screen.getByRole('heading', { name: 'Documentation fonctionnelle', level: 1 }),
    ).toBeDefined()
    // Real prose from `docs-site/content/functional/index.md`, not a stub.
    expect(screen.getByText(/organisée comme les guides WordPress/iu)).toBeDefined()
  })

  it('switches to the technical tree (in English, matching docs/getting-started.md) and lists its real pages in the sidebar', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs')
    render(<App />)
    await screen.findByRole('heading', { name: 'Documentation complète', level: 1 })

    fireEvent.click(screen.getByRole('tab', { name: 'Technique' }))

    await screen.findByRole('heading', { name: 'Technical documentation', level: 1 })
    const sidebar = screen.getByRole('navigation', { name: 'Pages de cette arborescence' })
    expect(within(sidebar).getByRole('link', { name: 'Architecture' })).toBeDefined()
    expect(within(sidebar).getByRole('link', { name: 'Creating a theme' })).toBeDefined()
    expect(within(sidebar).getByRole('link', { name: 'Creating a plugin' })).toBeDefined()
  })

  it('navigates to a real technical page from the sidebar and shows its content', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs/technical/index')
    render(<App />)
    await screen.findByRole('heading', { name: 'Technical documentation', level: 1 })

    // `technical/index.md`'s own body also links to "Architecture" (its
    // table of contents) — the sidebar is scoped explicitly so this click
    // exercises real cross-page navigation rather than the in-body link.
    const sidebar = screen.getByRole('navigation', { name: 'Pages de cette arborescence' })
    fireEvent.click(within(sidebar).getByRole('link', { name: 'Architecture' }))

    await screen.findByRole('heading', { name: 'Architecture', level: 1 })
    expect(screen.getByText(/Cogenta is a pnpm\/Turborepo monorepo/u)).toBeDefined()
  })

  it('renders the real plugin guide (docs/guide-plugin.md) inline, never a duplicate copy', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs/technical/creating-a-plugin')
    render(<App />)

    await screen.findByRole('heading', { name: 'Writing a Cogenta plugin', level: 1 })
    // A sentence that only exists in the real guide file.
    expect(screen.getByText(/90% of WordPress compromises go through a plugin/u)).toBeDefined()
  })

  it('shows a not-found notice for a page that does not exist, instead of crashing', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs/functional/does-not-exist')
    render(<App />)

    await screen.findByRole('heading', { name: 'Documentation complète', level: 1 })
    expect(screen.getByText('Page introuvable')).toBeDefined()
  })

  it('shows the running Cogenta version at the bottom of a page', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs')
    render(<App />)

    await screen.findByRole('heading', { name: 'Documentation complète', level: 1 })
    expect(
      screen.getByText(/^Documentation correcte pour Cogenta v\d+\.\d+\.\d+\.$/u),
    ).toBeDefined()
  })

  it('has no serious WCAG violations', async () => {
    signedIn()
    window.history.pushState(null, '', '/documentation/docs')
    render(<App />)
    await screen.findByRole('heading', { name: 'Documentation complète', level: 1 })
    await expectNoSeriousA11yViolations(document.body)
  })
})
