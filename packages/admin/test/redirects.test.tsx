import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * `/api/redirects` — admin-only, over the real API shape (audit follow-up to
 * L10 task 2). Unlike taxonomies or menus, there is no reader role here: the
 * screen itself refuses to render for anyone but an admin, matching the
 * server's own door.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

async function goToRedirects(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Redirections' }))
  await screen.findByRole('heading', { name: 'Redirections' })
}

describe('the redirects screen', () => {
  it('tells a non-admin the screen is admin-only, without offering a form', async () => {
    signedIn(['editor'])
    // The "Apparence" nav group is hidden for a role with no visible item in
    // it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/redirects')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByLabelText('Depuis')).toBeNull()
  })

  it('lets an admin create a redirect through the real API and see it listed', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/old-page' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/new-page' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))

    expect(await screen.findByText('/old-page')).toBeDefined()
    expect(screen.getByText('/new-page')).toBeDefined()
  })

  it('reports the server refusing a self-redirect', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/loop' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/loop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('redirect')
  })

  it('removes a redirect through the real API', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/gone' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))
    await screen.findByText('/gone')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText("Aucune redirection pour l'instant.")).toBeDefined()
  })
})

describe('editing a redirect in place (fiche 12 task 2)', () => {
  it('changes the target and status without a delete/recreate round trip', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/old' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/first-target' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))
    await screen.findByText('/old')

    const row = screen.getByText('/old').closest('tr')
    expect(row).not.toBeNull()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Modifier' }))

    const editTo = within(row as HTMLElement).getByLabelText('Vers')
    fireEvent.change(editTo, { target: { value: '/second-target' } })
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('/second-target')).toBeDefined()
    expect(screen.queryByText('/first-target')).toBeNull()
  })

  it('creates a 410 with no target field required', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/discontinued' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: '410' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))

    expect(await screen.findByText('/discontinued')).toBeDefined()
  })
})

describe('searching redirects (fiche 12 task 2)', () => {
  it('filters the table by a substring of "from" or "to"', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/blog-post-one' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/actualites/one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))
    await screen.findByText('/blog-post-one')

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/unrelated-page' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/somewhere-else' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))
    await screen.findByText('/unrelated-page')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'blog-post' } })

    await screen.findByText('/blog-post-one')
    expect(screen.queryByText('/unrelated-page')).toBeNull()
  })
})

describe('prefix redirects (fiche 12 task 4)', () => {
  it('creates, lists and removes a prefix rule, never treating it as a regular expression', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Préfixe depuis'), { target: { value: '/blog/*' } })
    fireEvent.change(screen.getByLabelText('Préfixe vers'), { target: { value: '/actualites/*' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le motif' }))

    expect(await screen.findByText('/blog/*')).toBeDefined()
    expect(screen.getByText('/actualites/*')).toBeDefined()

    const row = screen.getByText('/blog/*').closest('tr')
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText("Aucun motif de redirection pour l'instant.")).toBeDefined()
  })
})

describe('the not-found log (fiche 12 task 1)', () => {
  it('shows the busiest missing paths and never a personal-data column', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      notFound: [
        {
          path: '/old-campaign-link',
          hits: 5,
          firstSeen: Date.parse('2026-03-01T00:00:00.000Z'),
          lastSeen: Date.parse('2026-03-02T00:00:00.000Z'),
          lastReferrer: 'https://example.com/newsletter',
        },
      ],
    })
    render(<App />)
    await goToRedirects()

    expect(await screen.findByText('/old-campaign-link')).toBeDefined()
    expect(screen.getByText('5')).toBeDefined()
    // The table has exactly the five bounded columns — never an IP, never a
    // user agent.
    const region = screen.getByRole('region', { name: 'Introuvables' })
    expect(within(region).getAllByRole('columnheader')).toHaveLength(5)
  })

  it('pre-fills the "from" field when creating a redirect from a logged 404', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      notFound: [
        {
          path: '/old-campaign-link',
          hits: 5,
          firstSeen: Date.parse('2026-03-01T00:00:00.000Z'),
          lastSeen: Date.parse('2026-03-02T00:00:00.000Z'),
          lastReferrer: null,
        },
      ],
    })
    render(<App />)
    await goToRedirects()
    await screen.findByText('/old-campaign-link')

    fireEvent.click(screen.getByRole('button', { name: 'Créer une redirection' }))

    expect((screen.getByLabelText('Depuis') as HTMLInputElement).value).toBe('/old-campaign-link')
  })

  it('lets an admin dismiss a tracked path', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      notFound: [
        {
          path: '/noise',
          hits: 1,
          firstSeen: Date.parse('2026-03-01T00:00:00.000Z'),
          lastSeen: Date.parse('2026-03-01T00:00:00.000Z'),
          lastReferrer: null,
        },
      ],
    })
    render(<App />)
    await goToRedirects()
    await screen.findByText('/noise')

    fireEvent.click(screen.getByRole('button', { name: 'Écarter' }))
    expect(await screen.findByText('Aucun 404 enregistré.')).toBeDefined()
  })
})

describe('CSV import/export (fiche 12 task 4)', () => {
  it('previews an import — creates and conflicts — without writing until Apply', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    const textarea = screen.getByLabelText('Coller le CSV, ou choisir un fichier')
    fireEvent.change(textarea, {
      target: { value: 'from,to,status\n/imported-a,/target-a,301\n/imported-b,/target-b,302\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }))

    expect(await screen.findByText('2 à créer')).toBeDefined()

    // Not written yet — proven against the real backend state, not the DOM:
    // searching the actual redirect table (which round-trips through
    // `GET /api/redirects?q=`) finds nothing for the imported path.
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'imported-a' } })
    await screen.findByText("Aucune redirection pour l'instant.")
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))
    expect(await screen.findByText('2 créées, 0 modifiées, 0 échouées')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'imported-a' } })
    await screen.findByText('/imported-a')
  })

  it('exports the redirect table as a downloadable CSV', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/old' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))
    await screen.findByText('/old')

    const clicked = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = originalCreateElement(tag)
      if (tag === 'a') element.addEventListener('click', clicked)
      return element
    })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Exporter en CSV' }))

    await vi.waitFor(() => expect(clicked).toHaveBeenCalledTimes(1))
  })
})
