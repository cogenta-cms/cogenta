import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, USER, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App, signed in', () => {
  it('renders the dashboard by default, with the skip link and the Content group open', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Aller au contenu principal' }).getAttribute('href'),
    ).toBe('#main-content')

    // The Content group is open by default (fiche 35 §8) and every one of
    // its entries is open to an `editor` — the default role this whole file
    // signs in as.
    for (const label of ['Tableau de bord', 'Contenus', 'Médiathèque']) {
      expect(screen.getByRole('link', { name: label })).toBeDefined()
    }
  })

  it('hides an admin-only entry from an editor, and shows it to an admin (fiche 35 task 1)', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    expect(screen.queryByRole('link', { name: "Journal d'audit" })).toBeNull()

    installMockFetch({ roles: ['admin'] })
    render(<App />)
    await screen.findAllByRole('heading', { name: 'Tableau de bord' })
    expect(screen.getByRole('link', { name: "Journal d'audit" })).toBeDefined()
  })

  it('marks the current section as the active link', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const dashboardLink = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(dashboardLink.getAttribute('aria-current')).toBe('page')

    const mediaLink = screen.getByRole('link', { name: 'Médiathèque' })
    expect(mediaLink.getAttribute('aria-current')).toBeNull()
  })

  it('navigates to another section without a full page reload', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))

    expect(await screen.findByRole('heading', { name: 'Médiathèque' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })

  it('gives the routed content a landmark the skip link can reach', async () => {
    render(<App />)
    const main = await screen.findByRole('main')
    expect(main.id).toBe('main-content')
  })

  it('shows the signed-in user and lets them sign out', async () => {
    render(<App />)
    expect(await screen.findByText(USER.email)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})

describe('App, branding in the topbar (fiche L21 task 8)', () => {
  it('shows the real Cogenta logo by default, name conveyed via alt text since the wordmark is baked into the asset', async () => {
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const brand = container.querySelector('.app-shell__brand')
    expect(brand).not.toBeNull()
    const logo = brand?.querySelector('img.app-shell__brand-logo')
    // jsdom has no `matchMedia` in this test environment, so `useTheme()`
    // resolves to its own documented fallback, "light" — the light-theme
    // asset is the one actually asserted here.
    expect(logo?.getAttribute('src')).toContain('branding/logo-cogenta-light.png')
    expect(logo?.getAttribute('alt')).toBe('Cogenta')
  })

  it('hides Cogenta once branding is turned off, with no replacement uploaded', async () => {
    installMockFetch({ siteSettings: { 'branding.showCogentaBranding': false } })
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await waitFor(() => {
      expect(container.querySelector('.app-shell__brand img')).toBeNull()
    })
    expect(container.querySelector('.app-shell__brand')?.textContent).not.toContain('Cogenta')
  })

  it('shows the white-label logo instead, with no "Cogenta" text next to it', async () => {
    // `installMockFetch`'s media store starts empty and is filled the same
    // way a real upload would fill it — `media-1` is the first upload's
    // deterministic id, matched here against the setting rather than
    // invented, so this exercises the real `/api/media/{id}/file` route
    // `fetchMediaBlobUrl` calls, not a shortcut around it.
    installMockFetch({
      siteSettings: {
        'branding.showCogentaBranding': false,
        'branding.customLogoMediaId': 'media-1',
      },
    })
    await fetch('/api/media', {
      method: 'POST',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      body: JSON.stringify({
        kind: 'image',
        filename: 'client-logo.png',
        mimeType: 'image/png',
        alt: 'Client logo',
      }),
    })

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-white-label-logo')
    URL.revokeObjectURL = vi.fn()
    try {
      const { container } = render(<App />)
      await screen.findByRole('heading', { name: 'Tableau de bord' })

      const brand = await waitFor(() => {
        const found = container.querySelector('.app-shell__brand img')
        if (found === null) throw new Error('white-label logo not resolved yet')
        return found
      })
      expect(brand.getAttribute('src')).toBe('blob:mock-white-label-logo')
      expect(container.querySelector('.app-shell__brand')?.textContent).not.toContain('Cogenta')
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })
})

describe('App, sidebar layout overrides (fiche 22 tâche 8, part 3)', () => {
  it('hides a whole section for everyone once an admin turns it off, site-wide', async () => {
    installMockFetch({
      roles: ['admin'],
      siteSettings: { 'navigation.hiddenSections': 'commerce' },
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.queryByText('Commerce')).toBeNull()
  })

  it('hides a single entry while leaving the rest of its section alone', async () => {
    installMockFetch({
      roles: ['admin'],
      siteSettings: { 'navigation.hiddenItems': '/media' },
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // The dashboard heading depends on different data than `/api/settings`
    // (schema/shell-status), so it can resolve first — the sidebar briefly
    // shows every item until the settings fetch that carries
    // `navigation.hiddenItems` catches up. `waitFor` here for the same
    // reason `settings.test.tsx`'s own live-toggle test already does.
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Médiathèque' })).toBeNull()
    })
    expect(screen.getByRole('link', { name: 'Contenus' })).toBeDefined()
  })

  it('reorders sections the way an admin chose, site-wide', async () => {
    installMockFetch({
      roles: ['admin'],
      siteSettings: { 'navigation.sectionOrder': 'settings,content' },
    })
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const headings = Array.from(container.querySelectorAll('.app-shell__nav-group-summary')).map(
      (node) => node.textContent,
    )
    expect(headings[0]).toBe('Réglages')
  })

  it('ignores a stale group id the current build no longer declares', async () => {
    installMockFetch({
      roles: ['admin'],
      siteSettings: { 'navigation.hiddenSections': 'commerce,a-retired-group' },
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // Would have thrown or left the sidebar empty if the unknown token were
    // trusted rather than dropped.
    expect(screen.queryByText('Commerce')).toBeNull()
    expect(screen.getByRole('link', { name: 'Contenus' })).toBeDefined()
  })
})

describe('App, footer and topbar (fiche 22 tâche 8, part 4-5)', () => {
  it('shows the real Cogenta version next to the credit, by default', async () => {
    installMockFetch({ shellStatus: { cogentaVersion: '9.9.9' } })
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const footer = await waitFor(() => {
      const found = container.querySelector('.app-shell__footer-version')
      if (found === null) throw new Error('version not rendered yet')
      return found
    })
    expect(footer.textContent).toBe('v9.9.9')
  })

  it('drops the version, along with the rest of the credit, once branding is off', async () => {
    installMockFetch({
      siteSettings: { 'branding.showCogentaBranding': false },
      shellStatus: { cogentaVersion: '9.9.9' },
    })
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await waitFor(() => {
      expect(container.querySelector('.app-shell__brand img')).toBeNull()
    })
    expect(container.querySelector('.app-shell__footer-version')).toBeNull()
    expect(container.querySelector('.app-shell__footer')?.textContent).not.toContain('Cogenta')
  })

  it('offers a "View site" link to the public site root, in a new tab', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const link = screen.getByRole('link', { name: 'Voir le site' })
    expect(link.getAttribute('href')).toBe('/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})

describe('App, signed out', () => {
  it('redirects to the login page instead of showing a protected route', async () => {
    localStorage.clear()
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })

  it('discards a token the server no longer recognises', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'a-token-the-server-forgot')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})
