import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The editor's workflow sidebar (`schema@2.1`, ADR-0027, fiche 37 task 4).
 *
 * `wf-article` grants `update` to `contributor` with `own: true`, and
 * `publish` to `editor` alone — so a contributor never sees "Publish", only
 * "Submit for review" (the button that used to simply not exist), and only
 * `editor` sees "Approve"/"Request changes".
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(
  roles: readonly string[],
  wfEntryReviewState?: 'none' | 'pending' | 'changes-requested' | 'approved',
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...(wfEntryReviewState === undefined ? {} : { wfEntryReviewState }) })
}

async function openWfEntry(): Promise<void> {
  window.history.pushState(null, '', '/collections/wf-article/wf-entry-1')
  render(<App />)
  await screen.findByRole('heading', { name: 'Modifier : Workflow article' })
}

describe('the editorial workflow sidebar', () => {
  it('replaces the (absent) Publish button with Submit for review, for a contributor', async () => {
    signedIn(['contributor'])
    await openWfEntry()

    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Soumettre à relecture' })).toBeDefined()
    expect(screen.getByText('Non soumis')).toBeDefined()
    expect(screen.getByText('Non assigné')).toBeDefined()
  })

  it('submits through the real route, and the state updates in place', async () => {
    signedIn(['contributor'])
    await openWfEntry()

    fireEvent.click(await screen.findByRole('button', { name: 'Soumettre à relecture' }))

    expect(await screen.findByText('En attente de relecture')).toBeDefined()
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Soumis à relecture.')
    // Legal only from none/changes-requested — now pending, the button is gone.
    expect(screen.queryByRole('button', { name: 'Soumettre à relecture' })).toBeNull()
  })

  it('shows nothing of the workflow at all to a role with neither update nor publish', async () => {
    signedIn(['viewer'])
    await openWfEntry()

    expect(screen.queryByRole('button', { name: 'Soumettre à relecture' })).toBeNull()
    expect(screen.queryByText('Non soumis')).toBeNull()
    // Not the only `role="alert"` on the page: a viewer also can't load the
    // history panel, which raises its own, unrelated alert — assert on this
    // one's text rather than assuming there is exactly one alert.
    expect(
      await screen.findByText(
        "Lecture seule : vous n'avez pas la permission de modifier ce contenu.",
      ),
    ).toBeDefined()
  })

  it('lets an editor approve a pending entry — and approving never publishes', async () => {
    // Seeded pending directly (`wfEntryReviewState`): the submit half of the
    // cycle is already covered above, and the cross-account permission
    // boundary this skips is proven server-side in
    // `test/rest/workflow-router.test.ts`.
    signedIn(['editor'], 'pending')
    await openWfEntry()

    expect(await screen.findByText('En attente de relecture')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }))

    expect(await screen.findByText('Approuvé')).toBeDefined()
    // The hard requirement: approving is not publishing.
    expect(screen.queryByRole('status')).not.toHaveProperty('textContent', 'Publié')
  })

  it('sends a pending entry back to changes-requested, through the real route', async () => {
    signedIn(['editor'], 'pending')
    await openWfEntry()

    fireEvent.click(await screen.findByRole('button', { name: 'Demander des modifications' }))

    expect(await screen.findByText('Modifications demandées')).toBeDefined()
  })

  it('meets the accessibility bar with the workflow card visible', async () => {
    signedIn(['contributor'])
    await openWfEntry()
    await screen.findByRole('button', { name: 'Soumettre à relecture' })

    const container = document.body
    await expectNoSeriousA11yViolations(container)
  })
})

/**
 * Fiche 35 audit T02 — none of the three workflow transitions here called
 * `useRefreshChromeStatus()`, so the sidebar's "à relire" badge
 * (`reviewPending`) stayed stale until the next full navigation — same bug
 * `review.tsx`'s equivalent transitions have, same fix.
 */
describe('workflow transitions in the editor refresh the sidebar status', () => {
  function shellStatusCallCount(): number {
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
    return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/shell-status'))
      .length
  }

  it('refreshes after submitting for review', async () => {
    signedIn(['contributor'])
    await openWfEntry()
    await screen.findByRole('button', { name: 'Soumettre à relecture' })

    const before = shellStatusCallCount()
    expect(before).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Soumettre à relecture' }))
    await screen.findByText('En attente de relecture')

    expect(shellStatusCallCount()).toBeGreaterThan(before)
  })

  it('refreshes after approving', async () => {
    signedIn(['editor'], 'pending')
    await openWfEntry()
    await screen.findByText('En attente de relecture')

    const before = shellStatusCallCount()
    expect(before).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }))
    await screen.findByText('Approuvé')

    expect(shellStatusCallCount()).toBeGreaterThan(before)
  })

  it('refreshes after requesting changes', async () => {
    signedIn(['editor'], 'pending')
    await openWfEntry()
    await screen.findByRole('button', { name: 'Demander des modifications' })

    const before = shellStatusCallCount()
    expect(before).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Demander des modifications' }))
    await screen.findByText('Modifications demandées')

    expect(shellStatusCallCount()).toBeGreaterThan(before)
  })
})

/**
 * Fiche 35 audit T01 — `assignReviewer` (`content-client.ts:614`) and its
 * route existed since ADR-0027 but no screen ever called it. `GET
 * /api/users` behind the candidate list is `admin`-only server-side, same
 * as `dashboard.tsx`/`trash.tsx`/`version-history.tsx`'s own `listUsers`
 * calls — the signed-in actor here holds `contributor` (owns `wf-entry-1`,
 * `createdBy: 'user-1'` matches the default test user) so it may call
 * `assign-reviewer` itself, `editor` so it is itself a real candidate the
 * `publish` rule includes, and `admin` so the candidate list actually
 * populates.
 */
/**
 * Fiche 35 audit T01 — `assignReviewer` (`content-client.ts:614`) and its
 * route existed since ADR-0027 but no screen ever called it. `GET
 * /api/users` behind the candidate list is `admin`-only server-side, same
 * as `dashboard.tsx`/`trash.tsx`/`version-history.tsx`'s own `listUsers`
 * calls — the signed-in actor here holds `contributor` (owns `wf-entry-1`,
 * `createdBy: 'user-1'` matches the default test user) so it may call
 * `assign-reviewer` itself, `editor` so it is itself a real candidate the
 * `publish` rule includes, and `admin` so the candidate list actually
 * populates. A heavier role set renders more of the shell (more nav/badge
 * fetches), so this describe uses its own longer-timeout open rather than
 * the shared `openWfEntry()` default.
 */
describe('assigning a reviewer', () => {
  async function openWfEntrySlow(): Promise<void> {
    window.history.pushState(null, '', '/collections/wf-article/wf-entry-1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Modifier : Workflow article' }, { timeout: 8000 })
  }

  it('lists real candidates and assigns through the real route', async () => {
    signedIn(['contributor', 'editor', 'admin'])
    await openWfEntrySlow()

    const select = await screen.findByRole(
      'combobox',
      { name: 'Relecteur assigné' },
      { timeout: 8000 },
    )
    expect(
      await within(select).findByRole('option', { name: 'alice@example.com' }, { timeout: 8000 }),
    ).toBeDefined()

    fireEvent.change(select, { target: { value: 'user-1' } })

    await waitFor(
      () => {
        expect((select as HTMLSelectElement).value).toBe('user-1')
      },
      { timeout: 8000 },
    )
  })

  it('offers only "unassigned" to a non-admin, who cannot browse the account list', async () => {
    signedIn(['contributor'])
    await openWfEntrySlow()

    const select = await screen.findByRole(
      'combobox',
      { name: 'Relecteur assigné' },
      { timeout: 8000 },
    )
    expect(within(select).getAllByRole('option')).toHaveLength(1)
  })
})
