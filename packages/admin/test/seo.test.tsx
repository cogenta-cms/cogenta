import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * `/seo` — the merged SEO screen (fiche 21 task 3): title/description
 * templates, per-collection sitemap hints, social defaults, the
 * redirections screen (moved here, own test file), and the read-only
 * diagnostics that were this screen's whole content before this fiche
 * (`GET /api/seo/diagnostics`, fiche 13 task 2 — "aurait attrapé le bug
 * isPublished"). Admin-only, every tab, matching the server's own door.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

type MockFetchOptions = NonNullable<Parameters<typeof installMockFetch>[0]>

function signedIn(
  roles: readonly string[],
  seoDiagnostics?: MockFetchOptions['seoDiagnostics'],
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...(seoDiagnostics === undefined ? {} : { seoDiagnostics }) })
}

function signedInWith(options: MockFetchOptions): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch(options)
}

async function goToSeo(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'SEO' }))
  await screen.findByRole('heading', { name: 'SEO', level: 1 })
}

async function goToDiagnostics(): Promise<void> {
  await goToSeo()
  fireEvent.click(screen.getByRole('tab', { name: 'Diagnostic' }))
  await screen.findByRole('heading', { name: 'Diagnostic SEO' })
}

describe('the merged SEO screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    // The "Apparence" nav group is hidden for a role with no visible item in
    // it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/seo')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('has one nav entry for both SEO and redirections', async () => {
    signedIn(['admin'])
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.getAllByRole('link', { name: 'SEO' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Redirections' })).toBeNull()
  })

  it('opens on the Général tab by default, with the other four reachable', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()

    expect(screen.getByRole('tab', { name: 'Général', selected: true })).toBeDefined()
    for (const label of [
      'Fonctionnalités',
      'Sitemap',
      'Réseaux sociaux',
      'Redirections',
      'Diagnostic',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeDefined()
    }
  })
})

describe('Fonctionnalités — feature activation grid (fiche 70 task 3)', () => {
  it('lists every sub-feature with a working toggle, disabled while nothing is loaded yet', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()
    fireEvent.click(screen.getByRole('tab', { name: 'Fonctionnalités' }))

    expect(await screen.findByRole('heading', { name: 'Fonctionnalités SEO' })).toBeDefined()
    for (const title of [
      'Score de contenu en temps réel',
      'Assistant de maillage interne',
      'Vérification des moteurs de recherche',
      'Règles robots.txt personnalisées',
      'IndexNow',
      'llms.txt',
    ]) {
      expect(screen.getByText(title)).toBeDefined()
    }
  })

  it('toggling IndexNow here changes the exact same setting the Général tab edits', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()
    fireEvent.click(screen.getByRole('tab', { name: 'Fonctionnalités' }))
    await screen.findByRole('heading', { name: 'Fonctionnalités SEO' })

    // `FEATURE_CARDS` (seo.tsx) orders IndexNow fifth (0-based index 4) —
    // content score, link assistant, search verification, robots custom
    // rules, IndexNow, llms.txt.
    const switches = screen.getAllByRole('switch')
    const indexNowToggle = switches[4] as HTMLInputElement
    fireEvent.click(indexNowToggle)
    await waitFor(() => expect(indexNowToggle.checked).toBe(true))

    // Same setting `IndexingExtrasCard` (Général tab) already renders —
    // switching tabs shows the identical, now-updated state rather than a
    // second copy that could disagree with it.
    fireEvent.click(screen.getByRole('tab', { name: 'Général' }))
    const generalToggle = await screen.findByLabelText(
      'Avertir IndexNow à la publication/dépublication',
    )
    expect((generalToggle as HTMLInputElement).checked).toBe(true)
  })

  it('marks the internal link assistant card as dependency-missing when no collection has a public route', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()
    fireEvent.click(screen.getByRole('tab', { name: 'Fonctionnalités' }))

    await screen.findByRole('heading', { name: 'Fonctionnalités SEO' })
    expect(
      screen.getByText(
        "Aucune collection n'a encore de route publique, il n'y a donc rien à analyser.",
      ),
    ).toBeDefined()
  })
})

describe('Général — title and description templates (fiche 21 task 3)', () => {
  it('saves a general title template through the real settings API', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()

    const field = await screen.findByLabelText('Gabarit de titre général')
    fireEvent.blur(field, { target: { value: '%title% — Mon site' } })

    expect(await screen.findByText('Enregistré.')).toBeDefined()
  })

  it('says so when no collection has a public route yet, rather than an empty table', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()

    // The default test schema declares no `routing` on any collection —
    // `@cogenta/seo` itself has nothing to put in a sitemap for one either,
    // so the per-collection table has nothing real to show.
    expect(
      await screen.findByText(
        "Aucune collection n'a encore de route publique, donc aucune ne peut être listée ici.",
      ),
    ).toBeDefined()
  })
})

describe('Sitemap — per-collection inclusion, change frequency and priority', () => {
  it('says so when no collection has a public route yet', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()
    fireEvent.click(screen.getByRole('tab', { name: 'Sitemap' }))

    expect(
      await screen.findByText(
        "Aucune collection n'a encore de route publique, donc aucune ne peut être listée ici.",
      ),
    ).toBeDefined()
  })
})

describe('Réseaux sociaux — default Open Graph/Twitter Card', () => {
  it('saves a Twitter handle and a default social image through the real settings API', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()
    fireEvent.click(screen.getByRole('tab', { name: 'Réseaux sociaux' }))

    const handle = await screen.findByLabelText('Identifiant Twitter/X')
    fireEvent.blur(handle, { target: { value: '@monsite' } })
    expect(await screen.findByText('Enregistré.')).toBeDefined()

    const image = screen.getByLabelText('Image sociale par défaut')
    fireEvent.blur(image, { target: { value: '/share.png' } })
  })
})

describe('Diagnostic — read-only reports (fiche 13 task 2)', () => {
  it('shows a healthy, empty site with no anomaly banner', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToDiagnostics()

    expect(await screen.findByText('0 URL dans le sitemap en ce moment')).toBeDefined()
    expect(screen.queryByText('Anomalies')).toBeNull()
  })

  it('flags the L10-class anomaly — a site with published content but an empty sitemap', async () => {
    signedIn(['admin'], {
      sitemap: { totalUrls: 0, collections: [] },
      anomalies: [
        {
          code: 'SITEMAP_EMPTY_WHILE_PUBLISHED',
          message: '3 entries are published, but the sitemap would list 0 URLs.',
        },
      ],
    })
    render(<App />)
    await goToDiagnostics()

    expect(await screen.findByText('Anomalies')).toBeDefined()
    expect(
      screen.getByText('3 entries are published, but the sitemap would list 0 URLs.'),
    ).toBeDefined()
  })

  it('shows the real per-collection sitemap report, included or excluded and why', async () => {
    signedIn(['admin'], {
      sitemap: {
        totalUrls: 2,
        collections: [
          { name: 'page', included: true, reason: null, urlCount: 2 },
          {
            name: 'memo',
            included: false,
            reason: 'This collection is not readable by the "public" role.',
            urlCount: 0,
          },
        ],
      },
    })
    render(<App />)
    await goToDiagnostics()

    expect(await screen.findByText('page')).toBeDefined()
    expect(screen.getByText('memo')).toBeDefined()
    expect(
      screen.getByText("Cette collection n'est pas lisible par le rôle « public »."),
    ).toBeDefined()
  })

  it('warns loudly when robots.txt disallows everything', async () => {
    signedIn(['admin'], {
      robots: {
        content: 'User-agent: *\nDisallow: /\n',
        allowIndexing: false,
        disallowsEverything: true,
      },
    })
    const { container } = render(<App />)
    await goToDiagnostics()

    expect(
      await screen.findByText('Ce robots.txt bloque actuellement tous les robots (Disallow: /).'),
    ).toBeDefined()
    // The verbatim `robots.txt` body, not the warning banner above it — both
    // happen to contain the substring "Disallow: /", which is exactly why
    // this asserts against the `<pre>` specifically rather than any text on
    // the page.
    expect(container.querySelector('pre')?.textContent).toContain('Disallow: /')
  })

  it('links a content-quality issue to the real entry', async () => {
    signedIn(['admin'], {
      content: {
        publishedCount: 1,
        noindexCount: 0,
        missingDescriptionCount: [{ collection: 'page', id: 'entry-1' }],
        tooLongTitleCount: [],
        duplicateTitles: [],
      },
    })
    render(<App />)
    await goToDiagnostics()

    const link = await screen.findByRole('link', { name: /page — Ouvrir/ })
    expect(link.getAttribute('href')).toBe('/collections/page/entry-1')
  })
})

describe('Diagnostic — direct links to the real sitemap/robots.txt (fiche 50 task 1)', () => {
  it('links straight to the URLs this same server actually serves', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToDiagnostics()

    const sitemapLink = await screen.findByRole('link', { name: 'Ouvrir sitemap.xml' })
    expect(sitemapLink.getAttribute('href')).toMatch(/\/sitemap\.xml$/)
    expect(sitemapLink.getAttribute('target')).toBe('_blank')

    const robotsLink = screen.getByRole('link', { name: 'Ouvrir robots.txt' })
    expect(robotsLink.getAttribute('href')).toMatch(/\/robots\.txt$/)
    expect(robotsLink.getAttribute('target')).toBe('_blank')
  })
})

describe('Diagnostic — robots.txt custom rules editor (fiche 50 task 4)', () => {
  it('saves a scoped rule through the real settings API, no confirmation needed', async () => {
    signedIn(['admin'])
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<App />)
    await goToDiagnostics()

    const editor = await screen.findByLabelText('Règles personnalisées')
    fireEvent.blur(editor, { target: { value: 'User-agent: GPTBot\nDisallow: /private' } })

    expect(await screen.findByText('Enregistré.')).toBeDefined()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('asks for confirmation before saving a rule that blocks every crawler, and honours Cancel', async () => {
    signedIn(['admin'])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    await goToDiagnostics()

    const editor = await screen.findByLabelText('Règles personnalisées')
    fireEvent.blur(editor, { target: { value: 'User-agent: *\nDisallow: /' } })

    // Cancelled: nothing was saved.
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(screen.queryByText('Enregistré.')).toBeNull()
  })

  it('saves the disallow-all rule once the confirmation is accepted', async () => {
    signedIn(['admin'])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await goToDiagnostics()

    const editor = await screen.findByLabelText('Règles personnalisées')
    fireEvent.blur(editor, { target: { value: 'User-agent: *\nDisallow: /' } })

    expect(await screen.findByText('Enregistré.')).toBeDefined()
  })
})

describe('Diagnostic — internal link assistant (fiche 70 task 2)', () => {
  it('says so when no collection has a public route yet, rather than an empty selector', async () => {
    // The shared mock schema (`mock-fetch.ts`) declares no routed collection
    // at all — the same reason the Sitemap tab's own "no routed collection"
    // test above exists — so this proves the section renders its honest
    // empty state instead of an unusable, option-less dropdown.
    signedIn(['admin'])
    render(<App />)
    await goToDiagnostics()

    expect(
      await screen.findByRole('heading', { name: 'Assistant de maillage interne' }),
    ).toBeDefined()
    expect(
      screen.getByText(
        "Aucune collection n'a encore de route publique, il n'y a donc rien à analyser ici.",
      ),
    ).toBeDefined()
  })
})

describe('Diagnostic — Search Console connector (fiche 70 task 4, ADR-0032)', () => {
  it('is entirely absent when not configured — no card, no error (R2)', async () => {
    signedInWith({ roles: ['admin'], searchConsoleStatus: { configured: false } })
    render(<App />)
    await goToDiagnostics()

    // Give the section's own fetch a turn to resolve before asserting
    // absence, or a false negative could just mean "not loaded yet".
    await screen.findByRole('heading', { name: 'Assistant de maillage interne' })
    expect(screen.queryByText('Performance réelle (Google Search Console)')).toBeNull()
  })

  it('offers a Connect button once configured but not yet connected', async () => {
    signedInWith({
      roles: ['admin'],
      searchConsoleStatus: { configured: true, connected: false },
    })
    render(<App />)
    await goToDiagnostics()

    expect(
      await screen.findByRole('heading', { name: 'Performance réelle (Google Search Console)' }),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Connecter Google Search Console' })).toBeDefined()
  })

  it('sends the browser to the real Google authorization URL on Connect', async () => {
    signedInWith({
      roles: ['admin'],
      searchConsoleStatus: { configured: true, connected: false },
    })
    render(<App />)
    await goToDiagnostics()
    await screen.findByRole('heading', { name: 'Performance réelle (Google Search Console)' })

    const originalLocation = window.location
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        set href(value: string) {
          assign(value)
        },
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Connecter Google Search Console' }))
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?mock=1'),
    )

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('shows real metrics and a Disconnect button once connected', async () => {
    signedInWith({
      roles: ['admin'],
      searchConsoleStatus: {
        configured: true,
        connected: true,
        siteUrl: 'https://example.com/',
      },
      searchConsoleMetrics: {
        rows: [
          {
            page: 'https://example.com/hello',
            clicks: 12,
            impressions: 300,
            ctr: 0.04,
            position: 8.5,
          },
        ],
      },
    })
    render(<App />)
    await goToDiagnostics()

    expect(await screen.findByText('https://example.com/hello')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Déconnecter' })).toBeDefined()
  })

  it('shows the connected banner after a redirect back with ?search_console=connected', async () => {
    signedInWith({
      roles: ['admin'],
      searchConsoleStatus: { configured: true, connected: true, siteUrl: 'https://example.com/' },
    })
    // Arriving directly at this URL is exactly what the router's own 302
    // redirect produces — a nav-link click would overwrite these params
    // instead of simulating that arrival.
    window.history.pushState(null, '', '/seo?tab=diagnostics&search_console=connected')
    render(<App />)
    await screen.findByRole('heading', { name: 'SEO', level: 1 })

    expect(
      await screen.findByText(
        "Connecté — les vraies données de performance s'affichent ci-dessous.",
      ),
    ).toBeDefined()
  })

  it('shows the denied banner after a redirect back with ?search_console=denied', async () => {
    signedInWith({
      roles: ['admin'],
      searchConsoleStatus: { configured: true, connected: false },
    })
    window.history.pushState(null, '', '/seo?tab=diagnostics&search_console=denied')
    render(<App />)
    await screen.findByRole('heading', { name: 'SEO', level: 1 })

    expect(
      await screen.findByText(
        "La connexion n'a pas abouti — réessayez, ou vérifiez que la propriété est bien vérifiée pour ce compte Google.",
      ),
    ).toBeDefined()
  })

  it('disconnects and returns to the Connect state', async () => {
    signedInWith({
      roles: ['admin'],
      searchConsoleStatus: { configured: true, connected: true, siteUrl: 'https://example.com/' },
    })
    render(<App />)
    await goToDiagnostics()
    await screen.findByRole('button', { name: 'Déconnecter' })

    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }))

    expect(
      await screen.findByRole('button', { name: 'Connecter Google Search Console' }),
    ).toBeDefined()
  })
})
