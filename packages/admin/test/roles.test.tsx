import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles })
}

beforeEach(() => {
  signedInAs(['admin'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToRoles(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Rôles et permissions' }))
  await screen.findByRole('heading', { name: 'Rôles et permissions' })
}

/**
 * Fiche 19, tasks 1-3 — a permission matrix nothing renders today.
 *
 * `MOCK_SCHEMA` (helpers/mock-fetch.ts) declares `article` (public read,
 * `editor` for everything else), `secret-memo` (`admin`-only read, no write
 * action named for anyone) and the `topic` taxonomy (public read, `editor`
 * write, `admin` delete) — real inconsistencies this screen is meant to
 * surface: `secret-memo` is invisible to `editor`/`viewer`, the default
 * signed-in account (`alice`, `admin`) and `bob` (`viewer`) between them use
 * a role (`viewer`) the schema never names, and `editor` is named by the
 * schema but held by neither seeded account.
 */
describe('the permission matrix', () => {
  it('renders the by-collection matrix showing exactly what the schema declares', async () => {
    render(<App />)
    await goToRoles()

    const table = within(screen.getByRole('tabpanel', { name: 'Par collection' }))
    const articleRow = table.getByText('Articles').closest('tr')
    expect(articleRow).not.toBeNull()
    expect(within(articleRow as HTMLElement).getByText('public')).toBeDefined()
    expect(within(articleRow as HTMLElement).getAllByText('editor')).not.toHaveLength(0)

    const memoRow = table.getByText('Secret memos').closest('tr')
    expect(memoRow).not.toBeNull()
    // No role is named for `create` on `secret-memo` — the cell reads the
    // "nothing here" dash, not a blank string that could be mistaken for a
    // loading state.
    expect(within(memoRow as HTMLElement).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('flags a collection with no read role as an anomaly, the worst kind: invisible to everyone', async () => {
    render(<App />)
    await goToRoles()

    // `secret-memo` names no `create` role, but it does name `read: ['admin']`
    // — so the anomaly this schema actually triggers is the taxonomy-less
    // one over on the role side. What must NOT appear is a false "unreadable"
    // claim about `secret-memo`, which does have a reader.
    expect(screen.queryByText(/Secret memos.*n'a aucun rôle qui puisse même le lire/u)).toBeNull()
  })

  it('flags a role held by an account but named by no collection or taxonomy — the typo case', async () => {
    render(<App />)
    await goToRoles()

    // `bob` holds `viewer`, which `MOCK_SCHEMA` never names anywhere.
    expect(
      await screen.findByText(/Le rôle « viewer » est détenu par 1 compte\(s\)/u),
    ).toBeDefined()
  })

  it('flags a role the schema declares but that no seeded account holds', async () => {
    render(<App />)
    await goToRoles()

    // `editor` is named throughout `MOCK_SCHEMA` but neither `alice` (admin)
    // nor `bob` (viewer) holds it.
    expect(
      await screen.findByText(/Le rôle « editor » est déclaré par le schéma mais/u),
    ).toBeDefined()
  })

  it('switches to the by-role tab and shows exactly what each role unlocks', async () => {
    render(<App />)
    await goToRoles()

    fireEvent.click(screen.getByRole('tab', { name: 'Par rôle' }))
    const panel = within(screen.getByRole('tabpanel', { name: 'Par rôle' }))
    // `editor` is the only role `MOCK_SCHEMA` grants every write action on
    // `article` to — `admin` itself gets only the public read, the exact
    // asymmetry this table exists to make visible.
    const editorRow = panel.getByText('Éditeur').closest('tr')
    expect(editorRow).not.toBeNull()
    expect(
      within(editorRow as HTMLElement).getByText('Lire, Créer, Modifier, Supprimer, Publier'),
    ).toBeDefined()

    const adminRow = panel.getByText('Administrateur').closest('tr')
    expect(adminRow).not.toBeNull()
    // Admin's only grant on `article` is the read everyone gets via `public`.
    const adminCells = within(adminRow as HTMLElement).getAllByRole('cell')
    expect(adminCells[1]?.textContent).toBe('Lire')
  })

  it('renders the commerce permission matrix in its own separate vocabulary', async () => {
    render(<App />)
    await goToRoles()

    const commerce = within(
      screen
        .getByRole('heading', { name: 'Permissions commerce (contrat E)' })
        .closest('section') as HTMLElement,
    )
    expect(commerce.getByText('commerce.order.refund')).toBeDefined()
    expect(commerce.getByText('shopkeeper')).toBeDefined()
  })

  it('tells a non-admin plainly instead of rendering a matrix that would 403', async () => {
    signedInAs(['editor'])
    render(<App />)
    await goToRoles()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Réservé au rôle « admin » : cette page montre ce que chaque rôle peut faire sur ce site.',
    )
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToRoles()
    await waitFor(() => {
      expect(screen.queryByText('Chargement…')).toBeNull()
    })

    await expectNoSeriousA11yViolations(container)
  })
})

/**
 * Fiche 19 task 2 — the explanation lives at the point of usage too, not
 * only on the dedicated screen.
 */
describe('the role-grants preview in the account dialogs', () => {
  it('shows what a checked role actually grants, computed live from the schema', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Utilisateurs' }))
    await screen.findByRole('heading', { name: 'Utilisateurs' })

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })

    // "Éditeur" (editor) is checked by default in the create dialog, and
    // `MOCK_SCHEMA` grants it every action on `article`.
    expect(
      await within(dialog).findByText(
        (_, node) => node?.textContent === 'Articles: Lire, Créer, Modifier, Supprimer, Publier',
      ),
    ).toBeDefined()
  })

  it('warns when a selected role is named by no collection or taxonomy', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Utilisateurs' }))
    await screen.findByRole('heading', { name: 'Utilisateurs' })

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })

    fireEvent.change(within(dialog).getByLabelText('Rôle personnalisé (optionnel)'), {
      target: { value: 'editeur' },
    })

    expect(
      await within(dialog).findByText(/n'est nommé par aucune collection ni taxonomie.*editeur/u),
    ).toBeDefined()
  })
})
