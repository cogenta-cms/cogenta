import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * `GET /api/seo/diagnostics` — fiche 13, Task 2: the screen that "aurait
 * attrapé le bug isPublished" (the fiche's own framing). Admin-only, and
 * read-only, like `OpsSettingsRoute` — see `seo.tsx`'s own doc comment for
 * why sitemap/robots settings are configuration rather than admin-editable
 * rows.
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
  await screen.findByRole('heading', { name: 'Diagnostic SEO' })
}

describe('the SEO diagnostics screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToSeo()

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('shows a healthy, empty site with no anomaly banner', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSeo()

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
    await goToSeo()

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
    await goToSeo()

    expect(await screen.findByText('page')).toBeDefined()
    expect(screen.getByText('memo')).toBeDefined()
    expect(screen.getByText('This collection is not readable by the "public" role.')).toBeDefined()
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
    await goToSeo()

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
    await goToSeo()

    const link = await screen.findByRole('link', { name: /page — Ouvrir/ })
    expect(link.getAttribute('href')).toBe('/collections/page/entry-1')
  })
})
