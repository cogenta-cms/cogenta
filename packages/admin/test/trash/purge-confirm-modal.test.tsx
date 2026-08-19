import { fireEvent, render, screen } from '@testing-library/react'
import { type JSX, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PurgeConfirmModal } from '../../src/trash/purge-confirm-modal.js'

/**
 * The one modal fiche 07 adds (task 2) — `globalThis.confirm()` is gone from
 * the trash screen, replaced by this, which always states the exact count
 * about to be destroyed and, above ten entries, demands a typed word before
 * the destructive button can even be clicked.
 */

function Harness({ count, onConfirm }: { readonly count: number; onConfirm(): void }): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <PurgeConfirmModal
      open={open}
      onOpenChange={setOpen}
      count={count}
      scope="selection"
      busy={false}
      onConfirm={onConfirm}
    />
  )
}

describe('PurgeConfirmModal', () => {
  it('names the exact count for a small selection, with no typed word required', () => {
    const onConfirm = vi.fn()
    render(<Harness count={3} onConfirm={onConfirm} />)

    expect(screen.getByText('Supprimer 3 entrées définitivement ?')).toBeDefined()
    expect(screen.queryByLabelText(/Tapez/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 3 entrées définitivement' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('singularises the count correctly at one entry', () => {
    render(<Harness count={1} onConfirm={vi.fn()} />)
    expect(screen.getByText('Supprimer 1 entrée définitivement ?')).toBeDefined()
  })

  it('shows the exact count for "empty this collection" too', () => {
    render(
      <PurgeConfirmModal
        open
        onOpenChange={() => undefined}
        count={42}
        scope="collection"
        collectionLabel="Articles"
        busy={false}
        onConfirm={() => undefined}
      />,
    )
    expect(screen.getByText('Vider la corbeille de « Articles » ?')).toBeDefined()
    expect(
      screen.getByText("Ceci supprime 42 entrées définitivement. C'est irréversible."),
    ).toBeDefined()
  })

  it('blocks confirmation above ten entries until the exact word is typed', () => {
    const onConfirm = vi.fn()
    render(<Harness count={11} onConfirm={onConfirm} />)

    const confirmButton = screen.getByRole('button', {
      name: 'Supprimer 11 entrées définitivement',
    })
    expect(confirmButton).toHaveProperty('disabled', true)

    const typed = screen.getByLabelText('Tapez SUPPRIMER pour confirmer')
    fireEvent.change(typed, { target: { value: 'not the word' } })
    expect(confirmButton).toHaveProperty('disabled', true)

    fireEvent.change(typed, { target: { value: 'supprimer' } })
    expect(confirmButton).toHaveProperty('disabled', false)

    fireEvent.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('clears the typed word when the modal is dismissed and reopened', () => {
    function ReopenHarness(): JSX.Element {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            reopen
          </button>
          <PurgeConfirmModal
            open={open}
            onOpenChange={setOpen}
            count={11}
            scope="selection"
            busy={false}
            onConfirm={() => undefined}
          />
        </>
      )
    }

    render(<ReopenHarness />)
    const typed = screen.getByLabelText('Tapez SUPPRIMER pour confirmer')
    fireEvent.change(typed, { target: { value: 'SUPPRIMER' } })
    expect(
      screen.getByRole('button', { name: 'Supprimer 11 entrées définitivement' }),
    ).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }))

    // A fresh confirmation, not the one already typed a moment ago — typing
    // the word once must not leave this dialog armed for a later, unrelated
    // batch of entries.
    expect(
      screen.getByRole('button', { name: 'Supprimer 11 entrées définitivement' }),
    ).toHaveProperty('disabled', true)
  })
})
