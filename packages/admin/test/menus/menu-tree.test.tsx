import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MenuItem } from '../../src/api/menu-client.js'
import { MenuTree } from '../../src/menus/menu-tree.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'

function item(
  id: string,
  label: string,
  parent: string | null,
  depth: number,
  position: number,
): MenuItem {
  return {
    id,
    label,
    parent,
    depth,
    position,
    menuId: 'main',
    kind: 'url',
    targetCollection: null,
    targetEntryId: null,
    targetTaxonomy: null,
    targetTermId: null,
    url: '/example',
    title: null,
    openInNewTab: false,
  }
}

describe('menu actions with per-item accessible names', () => {
  it('identifies every action by its item and preserves hierarchy and keyboard-focusable controls', async () => {
    const entries = [
      item('a', 'Accueil', null, 0, 0),
      item('b', 'À propos', null, 0, 1),
      item('c', 'Équipe', 'b', 1, 0),
    ]
    const edit = vi.fn()
    const remove = vi.fn()
    const reorder = vi.fn()
    render(<MenuTree items={entries} onEdit={edit} onDelete={remove} onReorder={reorder} />)
    const root = screen.getByRole('list', { name: 'Éléments du menu' })
    const teamRow = within(root).getByText('Équipe').closest('li') as HTMLLIElement
    expect(teamRow.parentElement?.parentElement?.tagName).toBe('LI')
    const action = screen.getByRole('button', { name: "Modifier l'élément : Équipe" })
    action.focus()
    expect(document.activeElement).toBe(action)
    fireEvent.click(action)
    expect(edit).toHaveBeenCalledExactlyOnceWith(entries[2])
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer : Équipe' }))
    expect(remove).toHaveBeenCalledExactlyOnceWith(entries[2])
    fireEvent.click(screen.getByRole('button', { name: 'Monter : À propos' }))
    expect(reorder).toHaveBeenCalledOnce()
    expect(reorder.mock.calls[0]?.[0][0].id).toBe('b')
    await expectNoSeriousA11yViolations(root)
  })

  it('withdraws actions for readers without hiding items or their targets', () => {
    render(
      <MenuTree
        items={[item('a', 'Accueil', null, 0, 0)]}
        disabled
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    )
    expect(screen.getByText('Accueil')).toBeDefined()
    expect(screen.getByText('/example')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
