import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VersionHistory } from '../../src/versions/version-history.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const HISTORY = [
  {
    version: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    live: false,
  },
  {
    version: 2,
    status: 'published',
    createdAt: '2026-02-01T00:00:00.000Z',
    createdBy: 'user-1',
    live: true,
  },
]

const DIFF = {
  fields: [{ field: 'title', change: 'changed', before: 'Old title', after: 'New title' }],
  blocks: [],
  changed: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VersionHistory', () => {
  it('lists the versions, marking the live one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(HISTORY)),
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

    expect(await screen.findByText(/v2 — published \(version actuelle\)/)).toBeDefined()
    expect(screen.getByText(/v1 — draft/)).toBeDefined()
  })

  it('fetches and renders a structural diff against the live version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/diff')) return jsonResponse(DIFF)
        return jsonResponse(HISTORY)
      }),
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

    fireEvent.click(await screen.findByRole('button', { name: 'Comparer à la version actuelle' }))

    expect(await screen.findByText('title', { selector: 'strong' })).toBeDefined()
    expect(screen.getByText(/Old title/)).toBeDefined()
    expect(screen.getByText(/New title/)).toBeDefined()
  })

  it('restores a version and reports the refreshed entry', async () => {
    const restored = {
      id: 'entry-1',
      status: 'draft',
      version: 3,
      values: { title: 'Restored' },
      blocks: {},
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.includes('/restore') && init?.method === 'POST') return jsonResponse(restored)
        return jsonResponse(HISTORY)
      }),
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

    fireEvent.click(await screen.findByRole('button', { name: 'Restaurer' }))

    await screen.findByRole('button', { name: 'Restaurer' })
    expect(onRestored).toHaveBeenCalledWith(restored)
  })

  it('hides the restore action when the caller has no update permission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(HISTORY)),
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

    await screen.findByText(/v1 — draft/)
    expect(screen.queryByRole('button', { name: 'Restaurer' })).toBeNull()
  })
})
