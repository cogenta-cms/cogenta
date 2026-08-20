import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VersionHistory } from '../../src/versions/version-history.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(status === 200 ? { data: body } : { error: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const HISTORY = [
  {
    version: 3,
    status: 'published',
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: 'user-1',
    live: true,
  },
  {
    version: 2,
    status: 'draft',
    createdAt: '2026-02-01T00:00:00.000Z',
    createdBy: 'user-2',
    live: false,
  },
  {
    version: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    live: false,
  },
]

const DIFF = {
  fields: [{ field: 'title', change: 'changed', before: 'Old title', after: 'New title' }],
  blocks: [],
  changed: true,
}

const USERS = [
  { id: 'user-1', email: 'alice@example.com' },
  { id: 'user-2', email: 'bob@example.com' },
]

function stubFetch(extra: (url: string, init: RequestInit | undefined) => Response | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const custom = extra(url, init)
      if (custom !== null) return custom
      if (url.includes('/api/users')) return jsonResponse(USERS)
      if (url.includes('/history')) return jsonResponse(HISTORY)
      return jsonResponse(null, 404)
    }),
  )
}

/** The version list, scoped away from the compare panel's `<select>` options — both render "v3 — publiée", for instance. */
function list(): HTMLElement {
  return screen.getByRole('list')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VersionHistory', () => {
  it('lists the versions, marking the live one, with a readable date and author', async () => {
    stubFetch(() => null)
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore={false}
        onRestored={vi.fn()}
      />,
    )

    const row3 = within(await screen.findByRole('list'))
      .getByText(/v3 — publiée \(version actuelle\)/)
      .closest('li')
    if (row3 === null) throw new Error('row not found')
    expect(within(row3).getByText(/v3 — publiée \(version actuelle\)/)).toBeDefined()
    expect(within(list()).getByText(/v2 — brouillon/)).toBeDefined()
    // The author id resolves to an email once `/api/users` answers.
    expect(await within(row3).findByText(/par alice@example.com/)).toBeDefined()
  })

  it('falls back to the raw author id when the users list is not available', async () => {
    stubFetch((url) =>
      url.includes('/api/users') ? jsonResponse({ code: 'FORBIDDEN' }, 403) : null,
    )
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore={false}
        onRestored={vi.fn()}
      />,
    )

    const row3 = within(await screen.findByRole('list'))
      .getByText(/v3 — publiée \(version actuelle\)/)
      .closest('li')
    if (row3 === null) throw new Error('row not found')
    expect(await within(row3).findByText(/par user-1/)).toBeDefined()
  })

  it('compares two arbitrary versions, not only a version against the live one', async () => {
    stubFetch((url) => (url.includes('/diff') ? jsonResponse(DIFF) : null))
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore={false}
        onRestored={vi.fn()}
      />,
    )

    await screen.findByRole('list')

    // Defaults to the oldest version against the live one — task 1 keeps the
    // previous "against live" behaviour as the default, adds arbitrary choice
    // on top.
    const fromSelect = screen.getByLabelText('Depuis') as HTMLSelectElement
    const toSelect = screen.getByLabelText("Jusqu'à") as HTMLSelectElement
    expect(fromSelect.value).toBe('1')
    expect(toSelect.value).toBe('3')

    // Now compare v1 to v2 — neither is the live version.
    fireEvent.change(fromSelect, { target: { value: '1' } })
    fireEvent.change(toSelect, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comparer' }))

    expect(await screen.findByText('title', { selector: 'strong' })).toBeDefined()

    const call = ((fetch as ReturnType<typeof vi.fn>).mock.calls as unknown[][]).find((call) =>
      (call[0] as RequestInfo).toString().includes('/diff'),
    )
    expect((call?.[0] as RequestInfo | undefined)?.toString()).toContain('from=1')
    expect((call?.[0] as RequestInfo | undefined)?.toString()).toContain('to=2')
  })

  it('renders a word-level diff when the server provides one', async () => {
    const wordDiff = {
      fields: [
        {
          field: 'title',
          change: 'changed',
          before: 'Old title',
          after: 'New title',
          words: [
            { op: 'removed', text: 'Old' },
            { op: 'added', text: 'New' },
            { op: 'equal', text: ' title' },
          ],
        },
      ],
      blocks: [],
      changed: true,
    }
    stubFetch((url) => (url.includes('/diff') ? jsonResponse(wordDiff) : null))
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore={false}
        onRestored={vi.fn()}
      />,
    )

    await screen.findByRole('list')
    fireEvent.click(screen.getByRole('button', { name: 'Comparer' }))

    expect(await screen.findByText('Old', { selector: 'del' })).toBeDefined()
    expect(screen.getByText('New', { selector: 'ins' })).toBeDefined()
  })

  it('confirms before restoring, naming the version, its date and its author', async () => {
    const restored = {
      id: 'entry-1',
      status: 'draft',
      version: 4,
      values: { title: 'Restored' },
      blocks: {},
    }
    stubFetch((url, init) =>
      url.includes('/restore') && init?.method === 'POST' ? jsonResponse(restored) : null,
    )
    const onRestored = vi.fn()
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore
        onRestored={onRestored}
      />,
    )

    await screen.findByRole('list')
    const row = within(list())
      .getByText(/v1 — brouillon/)
      .closest('li')
    if (row === null) throw new Error('row not found')
    fireEvent.click(within(row).getByRole('button', { name: 'Restaurer' }))

    // The modal is open and nothing has been restored yet.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Restaurer v1/)).toBeDefined()
    expect(onRestored).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer cette version' }))

    expect(await screen.findByText('Cette version a été restaurée.')).toBeDefined()
    expect(onRestored).toHaveBeenCalledWith(restored)
  })

  it('cancelling the confirmation restores nothing', async () => {
    stubFetch(() => null)
    const onRestored = vi.fn()
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore
        onRestored={onRestored}
      />,
    )

    await screen.findByRole('list')
    const row = within(list())
      .getByText(/v1 — brouillon/)
      .closest('li')
    if (row === null) throw new Error('row not found')
    fireEvent.click(within(row).getByRole('button', { name: 'Restaurer' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('offers to undo a restore, restoring the version that was live before it', async () => {
    const restored = { id: 'entry-1', status: 'draft', version: 4, values: {}, blocks: {} }
    const undone = { id: 'entry-1', status: 'published', version: 5, values: {}, blocks: {} }
    let restoreCalls = 0
    stubFetch((url, init) => {
      if (url.includes('/restore') && init?.method === 'POST') {
        restoreCalls += 1
        const body = JSON.parse(String(init.body)) as { version: number }
        if (restoreCalls === 1) {
          expect(body.version).toBe(1)
          return jsonResponse(restored)
        }
        // The undo restores the version that was live before the first restore (v3).
        expect(body.version).toBe(3)
        return jsonResponse(undone)
      }
      return null
    })
    const onRestored = vi.fn()
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore
        onRestored={onRestored}
      />,
    )

    await screen.findByRole('list')
    const row = within(list())
      .getByText(/v1 — brouillon/)
      .closest('li')
    if (row === null) throw new Error('row not found')
    fireEvent.click(within(row).getByRole('button', { name: 'Restaurer' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer cette version' }))

    await screen.findByText('Cette version a été restaurée.')
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    // The undo itself is a restore of the version that was live before the
    // first restore — asserted inside `stubFetch` above — and its result
    // reaches the caller the same way the first restore's did.
    await waitFor(() => expect(restoreCalls).toBe(2))
    expect(onRestored).toHaveBeenLastCalledWith(undone)
    // The notice is gone once its own action has been taken.
    expect(screen.queryByText('Cette version a été restaurée.')).toBeNull()
  })

  it('hides the restore action when the caller has no update permission', async () => {
    stubFetch(() => null)
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore={false}
        onRestored={vi.fn()}
      />,
    )

    await screen.findByRole('list')
    expect(within(list()).queryByRole('button', { name: 'Restaurer' })).toBeNull()
  })

  it('windows a long history instead of rendering every version at once', async () => {
    const many = Array.from({ length: 45 }, (_, index) => ({
      version: 45 - index,
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: null,
      live: index === 0,
    }))
    stubFetch((url) => (url.includes('/history') ? jsonResponse(many) : null))
    render(
      <VersionHistory
        token="t"
        collection="article"
        entryId="entry-1"
        canRestore={false}
        onRestored={vi.fn()}
      />,
    )

    await screen.findByRole('list')
    expect(within(list()).getByText(/^v45 —/)).toBeDefined()
    expect(within(list()).queryByText(/^v25 —/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Afficher 25 de plus' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Afficher 25 de plus' }))
    expect(within(list()).getByText(/^v25 —/)).toBeDefined()

    // No per-row diff request happened just from listing and paging.
    const diffCalls = ((fetch as ReturnType<typeof vi.fn>).mock.calls as unknown[][]).filter(
      (call) => (call[0] as RequestInfo).toString().includes('/diff'),
    )
    expect(diffCalls).toHaveLength(0)
  })
})
