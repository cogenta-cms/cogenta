import { fireEvent, render, screen } from '@testing-library/react'
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
    for (const label of ['Sitemap', 'Réseaux sociaux', 'Redirections', 'Diagnostic']) {
      expect(screen.getByRole('tab', { name: label })).toBeDefined()
    }
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
