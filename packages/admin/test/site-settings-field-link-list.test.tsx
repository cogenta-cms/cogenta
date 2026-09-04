import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SiteSetting } from '../src/api/settings-client.js'
import { SiteSettingsField } from '../src/settings/site-settings-field.js'

/**
 * `uiType: 'linkList'` (fiche L25 D2) — the textarea encoding of
 * `general.socialLinks`, a JSON array of `{label, url}` the generic field
 * renderer has to turn into something an admin can actually edit, per the
 * lot's own note: "si un champ liste JSON n'a pas encore d'éditeur, le
 * rendre comme une zone de texte d'une ligne Label | url par entrée".
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
  it('renders the stored array as one "Label | url" line per entry', () => {
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
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('X | https://x.com/cogenta\nGitHub | https://github.com/cogenta')
  })

  it('renders an empty textarea for the empty default', () => {
    render(<SiteSettingsField setting={setting()} canEdit onSave={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
  })

  it('saves the typed lines as a parsed array of {label, url}, on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SiteSettingsField setting={setting()} canEdit onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, {
      target: { value: 'X | https://x.com/cogenta\nGitHub | https://github.com/cogenta' },
    })
    fireEvent.blur(textarea)

    expect(onSave).toHaveBeenCalledWith([
      { label: 'X', url: 'https://x.com/cogenta' },
      { label: 'GitHub', url: 'https://github.com/cogenta' },
    ])
    await screen.findByText('Enregistré.')
  })

  it('drops a blank line and a line with no separator, without failing the rest', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SiteSettingsField setting={setting()} canEdit onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, {
      target: {
        value: 'X | https://x.com/cogenta\n\nnot a valid line\nGitHub | https://github.com/cogenta',
      },
    })
    fireEvent.blur(textarea)

    expect(onSave).toHaveBeenCalledWith([
      { label: 'X', url: 'https://x.com/cogenta' },
      { label: 'GitHub', url: 'https://github.com/cogenta' },
    ])
  })

  it('saves an empty array when every line is cleared', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SiteSettingsField
        setting={setting({ value: [{ label: 'X', url: 'https://x.com/a' }], isDefault: false })}
        canEdit
        onSave={onSave}
      />,
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.blur(textarea)

    expect(onSave).toHaveBeenCalledWith([])
  })

  it('disables the textarea for a non-admin, exactly like every other field', () => {
    render(<SiteSettingsField setting={setting()} canEdit={false} onSave={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)
  })
})
