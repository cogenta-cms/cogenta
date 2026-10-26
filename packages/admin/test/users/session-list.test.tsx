import { fireEvent, render, screen, within } from '@testing-library/react'
import { type JSX, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { UserSession } from '../../src/api/users-client.js'
import { SessionList } from '../../src/routes/users.js'

function sessions(count: number): readonly UserSession[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index + 1}`,
    label: `Appareil ${index + 1}`,
    browser: 'Firefox',
    device: 'desktop',
    createdAt: '2026-10-03T09:00:00.000Z',
    expiresAt: '2026-11-03T09:00:00.000Z',
    lastSeenAt: '2026-10-03T09:00:00.000Z',
    isCurrent: index === 0,
  }))
}

function list(): HTMLElement {
  return screen.getByRole('list', { name: 'Sessions actives' })
}

describe('a bounded active session list', () => {
  it('shows ten of 53 sessions, with all remaining sessions reachable through named buttons', () => {
    render(<SessionList sessions={sessions(53)} onRevoke={vi.fn()} />)
    expect(within(list()).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('1–10 sur 53')).toBeDefined()
    expect((screen.getByRole('button', { name: 'Précédent' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText('11–20 sur 53')).toBeDefined()
    expect(within(list()).getAllByRole('listitem')).toHaveLength(10)
    expect(
      screen.getByRole('button', {
        name: /Révoquer la session vue le .* — Appareil 11 \(Firefox sur ordinateur\)/u,
      }),
    ).toBeDefined()
    expect(screen.queryByText(/Appareil 1 —/u)).toBeNull()
  })

  it('revokes the selected session on page two and preserves that page after refreshed data arrives', () => {
    const revoke = vi.fn()
    function Account(): JSX.Element {
      const [current, setCurrent] = useState(sessions(53))
      return (
        <SessionList
          sessions={current}
          onRevoke={(id) => {
            revoke(id)
            setCurrent((previous) => previous.filter((session) => session.id !== id))
          }}
        />
      )
    }
    render(<Account />)
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    const action = screen.getByRole('button', { name: /— Appareil 11 \(/u })
    expect(action.textContent).toBe('Révoquer')
    action.focus()
    expect(document.activeElement).toBe(action)
    fireEvent.click(action)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('session-11')
    expect(screen.getByText('11–20 sur 52')).toBeDefined()
    expect(screen.queryByRole('button', { name: /— Appareil 11 \(/u })).toBeNull()
    expect(screen.getByRole('button', { name: /— Appareil 12 \(/u })).toBeDefined()
  })

  it('gives repeated unnamed devices distinct action names on every page', () => {
    const repeated = sessions(53).map((session) => ({ ...session, label: null }))
    render(<SessionList sessions={repeated} onRevoke={vi.fn()} />)
    const names = within(list())
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(10)
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('button', { name: /— Session 11$/u })).toBeDefined()
    expect(screen.getByRole('button', { name: /— Session 20$/u })).toBeDefined()
  })

  it('returns to the last remaining page when its sole session disappears', () => {
    const current = sessions(51)
    const { rerender } = render(<SessionList sessions={current} onRevoke={vi.fn()} />)
    for (let page = 0; page < 5; page++)
      fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText('51–51 sur 51')).toBeDefined()
    rerender(<SessionList sessions={current.slice(0, 50)} onRevoke={vi.fn()} />)
    expect(screen.getByText('41–50 sur 50')).toBeDefined()
    expect(within(list()).getAllByRole('listitem')).toHaveLength(10)
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('preserves profile recovery messages with an empty list and omits unnecessary pagination', () => {
    render(
      <SessionList sessions={[]} onRevoke={vi.fn()}>
        <p>Sessions déconnectées.</p>
      </SessionList>,
    )
    expect(screen.getByText('Sessions déconnectées.')).toBeDefined()
    expect(screen.getByText('Aucune session active.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull()
  })
})
