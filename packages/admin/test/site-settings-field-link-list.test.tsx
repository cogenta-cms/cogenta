import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SiteSetting } from '../src/api/settings-client.js'
import { SiteSettingsField } from '../src/settings/site-settings-field.js'

/**
 * `uiType: 'linkList'` (fiche L25 D2) — the textarea encoding of
 * `general.socialLinks`, a JSON array of `{label, url}` the generic field
 * renderer has to turn into something an admin can actually edit. It was a
 * `Label | url` textarea; it is now one row per link (a label input and an
 * address input), with add and remove buttons.
 */

function setting(overrides: Partial<SiteSetting> = {}): SiteSetting {
  return {
    key: 'general.socialLinks',
    group: 'general',
    order: 7,
    uiType: 'linkList',
    options: undefined,
    scope: 'site',
    locale: null,
    value: [],
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  }
}

describe('SiteSettingsField, uiType: linkList', () => {
  it('renders the stored array as one row per entry, with a label and an address', () => {
    render(
      <SiteSettingsField
        setting={setting({
          value: [
            { label: 'X', url: 'https://x.com/cogenta' },
            { label: 'GitHub', url: 'https://github.com/cogenta' },
          ],
          isDefault: false,
        })}
        canEdit
        onSave={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('Libellé du lien 1') as HTMLInputElement).value).toBe('X')
    expect((screen.getByLabelText('Adresse du lien 1') as HTMLInputElement).value).toBe(
      'https://x.com/cogenta',
    )
    expect((screen.getByLabelText('Libellé du lien 2') as HTMLInputElement).value).toBe('GitHub')
    expect((screen.getByLabelText('Adresse du lien 2') as HTMLInputElement).value).toBe(
      'https://github.com/cogenta',
    )
    expect(screen.queryByLabelText('Libellé du lien 3')).toBeNull()
  })

  it('renders no row for the empty default, only the button to add one', () => {
    render(<SiteSettingsField setting={setting()} canEdit onSave={vi.fn()} />)
    expect(screen.queryByLabelText('Libellé du lien 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ajouter un lien' })).toBeDefined()
  })

  it('saves the typed rows as a parsed array of {label, url}, on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SiteSettingsField setting={setting()} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    fireEvent.change(screen.getByLabelText('Libellé du lien 1'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Adresse du lien 1'), {
      target: { value: 'https://x.com/cogenta' },
    })
    fireEvent.change(screen.getByLabelText('Libellé du lien 2'), { target: { value: 'GitHub' } })
    const address = screen.getByLabelText('Adresse du lien 2')
    fireEvent.change(address, { target: { value: 'https://github.com/cogenta' } })
    fireEvent.blur(address)

    expect(onSave).toHaveBeenCalledWith([
      { label: 'X', url: 'https://x.com/cogenta' },
      { label: 'GitHub', url: 'https://github.com/cogenta' },
    ])
    await screen.findByText('Enregistré.')
  })

  it('leaves out a row with no address, without failing the rest', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SiteSettingsField setting={setting()} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    fireEvent.change(screen.getByLabelText('Libellé du lien 1'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Adresse du lien 1'), {
      target: { value: 'https://x.com/cogenta' },
    })
    // Row 2 is still being typed: a label and no address.
    fireEvent.change(screen.getByLabelText('Libellé du lien 2'), { target: { value: 'half' } })
    fireEvent.change(screen.getByLabelText('Libellé du lien 3'), { target: { value: 'GitHub' } })
    const address = screen.getByLabelText('Adresse du lien 3')
    fireEvent.change(address, { target: { value: 'https://github.com/cogenta' } })
    fireEvent.blur(address)

    expect(onSave).toHaveBeenCalledWith([
      { label: 'X', url: 'https://x.com/cogenta' },
      { label: 'GitHub', url: 'https://github.com/cogenta' },
    ])
  })

  it('saves an empty array when every row is removed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SiteSettingsField
        setting={setting({ value: [{ label: 'X', url: 'https://x.com/a' }], isDefault: false })}
        canEdit
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le lien 1' }))

    expect(onSave).toHaveBeenCalledWith([])
    expect(screen.queryByLabelText('Libellé du lien 1')).toBeNull()
  })

  it('disables every control for a non-admin, exactly like every other field', () => {
    render(
      <SiteSettingsField
        setting={setting({ value: [{ label: 'X', url: 'https://x.com/a' }], isDefault: false })}
        canEdit={false}
        onSave={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('Libellé du lien 1') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Adresse du lien 1') as HTMLInputElement).disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Supprimer le lien 1' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Ajouter un lien' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
