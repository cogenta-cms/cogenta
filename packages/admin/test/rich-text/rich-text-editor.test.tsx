import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RichTextDocument } from '../../src/rich-text/portable-text.js'
import { RichTextEditor } from '../../src/rich-text/rich-text-editor.js'

const SIMPLE_DOC: RichTextDocument = [
  {
    _key: 'b1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 's1', _type: 'span', text: 'hello world', marks: [] }],
    markDefs: [],
  },
]

describe('RichTextEditor', () => {
  it('renders the toolbar and the existing document text', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    expect(screen.getByRole('toolbar', { name: 'Mise en forme' })).toBeDefined()
    expect(screen.getByText('hello world')).toBeDefined()
    for (const label of ['Gras', 'Italique', 'Code', 'Titre 2', 'Liste à puces', 'Lien']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }
  })

  it('disables every toolbar button when the field is disabled', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} disabled onChange={vi.fn()} />)

    for (const label of ['Gras', 'Italique', 'Code', 'Titre 2', 'Liste à puces', 'Lien']) {
      expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', true)
    }
  })

  it('starts an empty document as a single empty paragraph, ready to type into', () => {
    render(<RichTextEditor id="body" value={[]} onChange={vi.fn()} />)
    expect(document.querySelectorAll('[data-slate-node="element"]')).toHaveLength(1)
  })

  it('opens a URL input when the link button is pressed', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Lien' }))
    expect(screen.getByLabelText('URL du lien')).toBeDefined()
  })

  it('marks every formatting button aria-pressed=false at rest, none regressed by the icon rewrite', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    for (const label of ['Gras', 'Italique', 'Code', 'Titre 2', 'Liste à puces']) {
      expect(screen.getByRole('button', { name: label })).toHaveProperty('ariaPressed', 'false')
    }
  })

  it('starts with undo and redo disabled — nothing to undo yet', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Rétablir' })).toHaveProperty('disabled', true)
  })

  it('hides the image insert path — disabled — without a session (no token to upload with)', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Insérer une image' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('toggles a full-screen class on the editor when the full-screen button is pressed', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    const toggle = screen.getByRole('button', { name: 'Plein écran' })
    fireEvent.click(toggle)
    expect(document.querySelector('.rich-text-editor--fullscreen')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitter le plein écran' }))
    expect(document.querySelector('.rich-text-editor--fullscreen')).toBeNull()
  })

  it('shows a word and character count under the editor', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    expect(screen.getByText(/2 mots/)).toBeDefined()
    expect(screen.getByText(/11 caractères/)).toBeDefined()
  })
})
