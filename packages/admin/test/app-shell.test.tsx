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
  it('renders the dashboard by default, with the skip link and every Content entry reachable', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Aller au contenu principal' }).getAttribute('href'),
    ).toBe('#main-content')

    // The sidebar redesign (WordPress-style flyout, fiche 72 revision) keeps
    // every group's items in the DOM unconditionally — a flyout is a CSS
    // hover/focus state, never a conditional render — so every entry an
    // `editor` (the default role this whole file signs in as) is allowed to
    // see is queryable regardless of which group's flyout is "open". Two of
    // these (Dashboard, Media) are visible the instant auth resolves, but
    // "Contenus" also depends on the schema fetch — a second, independently
    // timed request `waitFor` already exists in this file to cover ("hides
    // a single entry", below).
    for (const label of ['Tableau de bord', 'Contenus', 'Médiathèque']) {
      await waitFor(() => {
        expect(screen.getByRole('link', { name: label })).toBeDefined()
      })
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

      // Waits for the *right* image, not merely *an* image: branding and
      // the default Cogenta logo can each independently resolve first, and
      // stopping at whichever `<img>` exists yet — a bug this test itself
      // used to have — flakes the instant that race lands on the wrong one.
      const brand = await waitFor(() => {
        const found = container.querySelector('.app-shell__brand img')
        if (found === null || found.getAttribute('src') !== 'blob:mock-white-label-logo') {
          throw new Error('white-label logo not resolved yet')
        }
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

describe('App, sidebar collapsed (icons-only) mode (fiche 72)', () => {
  it('marks the sidebar collapsed and gives every link a hover title, without removing any link', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(nav.getAttribute('data-collapsed')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))

    expect(nav.getAttribute('data-collapsed')).toBe('true')

    // Every link stays in the accessibility tree and clickable — collapsing
    // must never hide the nav list itself (fiche 72's found bug: the whole
    // `<ul>` used to get `display: none`, taking every icon down with it).
    // `title` is the fiche's replacement for the now visually-hidden label,
    // read on mouse hover.
    const dashboardLink = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(dashboardLink.getAttribute('title')).toBe('Tableau de bord')
    const mediaLink = screen.getByRole('link', { name: 'Médiathèque' })
    expect(mediaLink.getAttribute('title')).toBe('Médiathèque')
  })

  it("wraps each top-level group's label in its own element the collapsed-mode CSS can target", async () => {
    // Regression test for the original fiche 72 bug (a group heading written
    // as bare text, so no CSS selector could hide it in collapsed mode)
    // carried forward to the WordPress-style flyout redesign: every
    // top-level trigger's own label must live in `.app-shell__nav-group-label`
    // for `shell.css`'s collapsed-mode rule to have anything to clip.
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const trigger = container.querySelector('.app-shell__nav-group-trigger')
    expect(trigger?.querySelector('.app-shell__nav-group-label')).not.toBeNull()
  })

  it('remembers the collapsed state across a remount', async () => {
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))
    expect(localStorage.getItem('cogenta.admin.sidebarCollapsed')).toBe('1')
    unmount()

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(nav.getAttribute('data-collapsed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Déplier la barre latérale' }))
    expect(localStorage.getItem('cogenta.admin.sidebarCollapsed')).toBe('0')
  })
})

describe('App, sidebar flyout submenus (WordPress-style redesign)', () => {
  it('exposes a multi-item group as a disclosure button, collapsed by default', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('pins the flyout open on click, for a keyboard or touch user a hover cannot reach', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    fireEvent.click(contentTrigger)
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(contentTrigger)
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes a pinned-open flyout on Escape', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    fireEvent.click(contentTrigger)
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes a pinned-open flyout after navigating to one of its own items', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    fireEvent.click(contentTrigger)
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))
    await screen.findByRole('heading', { name: 'Médiathèque' })
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('blurs a still-focused flyout link after navigating, so a real click cannot leave the flyout open forever', async () => {
    // Regression test for a real, reported bug that the test above did not
    // catch: `fireEvent.click` does not reproduce a real mouse click's
    // default browser behaviour of focusing the clicked link, so the
    // sidebar's own `:focus-within` fallback (removed since — see
    // shell.css) never got exercised by that test. Focusing the link here
    // by hand is what makes this test take the same path a real click
    // does.
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    fireEvent.click(contentTrigger)

    const mediaLink = screen.getByRole('link', { name: 'Médiathèque' })
    mediaLink.focus()
    fireEvent.click(mediaLink)
    await screen.findByRole('heading', { name: 'Médiathèque' })

    expect(document.activeElement).not.toBe(mediaLink)
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('renders a group left with exactly one item as a direct link, no disclosure button', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // "Aide" (help) has a single entry (Documentation) — a one-item flyout
    // is pure friction, so it skips the button/flyout machinery entirely.
    expect(screen.queryByRole('button', { name: 'Aide' })).toBeNull()
    const helpLink = screen.getByRole('link', { name: 'Aide' })
    expect(helpLink.getAttribute('href')).toBe('/documentation')
  })

  it("totals a group's own items' badges onto its top-level row, the way WordPress totals onto a parent", async () => {
    // Every other item in "Exploitation" (ops) carries no badge, so this is
    // an unambiguous total, not a sum that happens to also work.
    installMockFetch({ roles: ['admin'], shellStatus: { marketplaceUpdates: 4 } })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // A name match by substring, not exact equality: the badge's own
    // `role="status"`/`aria-label` (fiche 35 task 3's existing pattern,
    // reused here) folds its text into the button's own accessible name —
    // "Exploitation, 4 élément(s)" is the point, not a string to work
    // around, but this assertion should not depend on its exact wording.
    await waitFor(() => {
      const opsTrigger = screen.getByRole('button', { name: /Exploitation/u })
      expect(opsTrigger.querySelector('.app-shell__badge')?.textContent).toBe('4')
    })
  })

  it('marks the group a route belongs to as the current one, even though the group itself has no link of its own', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))
    await screen.findByRole('heading', { name: 'Médiathèque' })

    const contentGroup = screen.getByRole('button', { name: 'Contenu' }).closest('li')
    expect(contentGroup?.getAttribute('data-current')).toBe('true')
  })

  it('renders the dashboard as its own row above every group, not filed inside "Contenu"', async () => {
    // Direct user feedback: nesting the site's own landing page inside a
    // "Content" submenu read as arbitrary — WordPress pins "Dashboard"
    // above its own menu categories rather than filing it under one.
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const dashboardLink = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(dashboardLink.closest('.app-shell__flyout')).toBeNull()
    expect(dashboardLink.closest('.app-shell__nav-dashboard')).not.toBeNull()
    // And "Contenu" no longer counts it as one of its own — being on "/"
    // should never mark the Content group current.
    const contentGroup = screen.getByRole('button', { name: 'Contenu' }).closest('li')
    expect(contentGroup?.getAttribute('data-current')).toBeNull()
  })

  it('names the site appearance entry distinctly from its own group — a real, user-reported name collision', async () => {
    installMockFetch({ roles: ['admin'] })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // The group's own trigger — "Apparence" — and its "Apparence du site"
    // item used to share the exact same text ("Apparence" twice), which is
    // what made the flyout read as if the group linked to itself.
    expect(screen.getByRole('button', { name: 'Apparence' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Apparence du site' })).toBeDefined()
    expect(screen.getByRole('link', { name: "Apparence de l'admin" })).toBeDefined()
  })

  it('keeps the flyout open for a beat after the mouse leaves, so moving toward the flyout does not close it first', async () => {
    // Regression test for a real, reported bug: the flyout sits a real gap
    // away from its trigger and is taller than the trigger row, so a mouse
    // moving diagonally toward an item further down legitimately leaves
    // both boxes for a moment mid-transit. A close with no delay (this
    // design's first version, driven by a bare CSS `:hover`) closes the
    // flyout at exactly that moment.
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    const group = contentTrigger.closest('li') as HTMLElement
    fireEvent.mouseEnter(group)
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.mouseLeave(group)
    // Still open the instant the mouse leaves — the whole point of the delay.
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('true')

    await waitFor(
      () => {
        expect(contentTrigger.getAttribute('aria-expanded')).toBe('false')
      },
      { timeout: 1000 },
    )
  })

  it('cancels the pending close if the mouse re-enters before the delay elapses', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const contentTrigger = screen.getByRole('button', { name: 'Contenu' })
    const group = contentTrigger.closest('li') as HTMLElement
    fireEvent.mouseEnter(group)
    fireEvent.mouseLeave(group)
    fireEvent.mouseEnter(group)

    // Past the close delay: still open proves the re-entry cancelled it
    // rather than merely reopening after a flicker.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(contentTrigger.getAttribute('aria-expanded')).toBe('true')
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

    // "Boutique" — the commerce group's own rendered label — not the
    // literal group id "commerce", which is never shown as text anywhere.
    // `waitFor` for the same `/api/settings` race the next test's own
    // comment already documents.
    await waitFor(() => {
      expect(screen.queryByText('Boutique')).toBeNull()
    })
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

    // Scoped to a top-level group's own label — excludes the sidebar
    // toggle's identically-classed label and every flyout item's own
    // (unclassed) label span. The order itself depends on `/api/settings`
    // (`navigation.sectionOrder`), a fetch independent of the one the
    // dashboard heading above already waited on.
    await waitFor(() => {
      const headings = Array.from(
        container.querySelectorAll('.app-shell__nav-group .app-shell__nav-group-label'),
      ).map((node) => node.textContent)
      expect(headings[0]).toBe('Réglages')
    })
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
    await waitFor(() => {
      expect(screen.queryByText('Boutique')).toBeNull()
    })
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
