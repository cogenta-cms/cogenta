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
    for (const label of ['Gras', 'Italique', 'Code', 'Barré', 'Titre 2', 'Liste à puces', 'Lien']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }
  })

  it('disables every toolbar button when the field is disabled', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} disabled onChange={vi.fn()} />)

    for (const label of ['Gras', 'Italique', 'Code', 'Barré', 'Titre 2', 'Liste à puces', 'Lien']) {
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

    for (const label of ['Gras', 'Italique', 'Code', 'Barré', 'Titre 2', 'Liste à puces']) {
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

  it('offers a code-block button alongside the other block buttons (L21 task 5)', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Bloc de code' })).toBeDefined()
  })

  it('offers a horizontal-rule insert button, disabled together with the rest of the toolbar (fiche 42 task 2)', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Insérer un trait horizontal' })).toHaveProperty(
      'disabled',
      false,
    )

    render(<RichTextEditor id="body-2" value={SIMPLE_DOC} disabled onChange={vi.fn()} />)
    expect(
      screen.getAllByRole('button', { name: 'Insérer un trait horizontal' }).at(-1),
    ).toHaveProperty('disabled', true)
  })
})

describe('RichTextEditor — fiche 42 task 2 (strikethrough, thematic break)', () => {
  it('renders a stored strikethrough span as a real `<s>` in the editing surface', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'old price', marks: ['strikethrough'] }],
        markDefs: [],
      },
    ]
    render(<RichTextEditor id="body" value={doc} onChange={vi.fn()} />)

    const struck = document.querySelector('.rich-text-editor__surface s')
    expect(struck?.textContent).toBe('old price')
  })

  it('renders a stored thematic break as a real, non-editable `<hr>`', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'before', marks: [] }],
        markDefs: [],
      },
      { _key: 'h1', _type: 'hr' },
    ]
    render(<RichTextEditor id="body" value={doc} onChange={vi.fn()} />)

    const hr = document.querySelector('.rich-text-editor__surface hr')
    expect(hr).not.toBeNull()
    expect(hr?.closest('[contenteditable="false"]')).not.toBeNull()
  })
})

/**
 * The Markdown/HTML source-view toggle (L21 task 5): a labelled group of
 * three toggle buttons, `rich-text-editor.tsx` reconciling the Slate
 * document and the raw text on every switch and on blur — never live on
 * every keystroke.
 */
describe('RichTextEditor — source view', () => {
  it('starts on the rich-text view, with the other two reachable from a labelled group', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    const group = screen.getByRole('group', { name: 'Vue' })
    expect(group).toBeDefined()
    expect(screen.getByRole('button', { name: 'Texte enrichi' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveProperty('ariaPressed', 'false')
    expect(screen.getByRole('button', { name: 'HTML' })).toHaveProperty('ariaPressed', 'false')
  })

  it('switches to Markdown, showing the serialised document in a textarea', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Markdown' }))

    const textbox = screen.getByRole('textbox', { name: 'Markdown' }) as HTMLTextAreaElement
    expect(textbox.value).toBe('hello world')
    // The Slate `<Editable>` is gone while the textarea stands in for it.
    expect(document.querySelectorAll('[data-slate-editor]')).toHaveLength(0)
  })

  it('switches to HTML, showing semantic markup rather than the stored JSON', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'HTML' }))

    const textbox = screen.getByRole('textbox', { name: 'HTML' }) as HTMLTextAreaElement
    expect(textbox.value).toBe('<p>hello world</p>')
  })

  it('disables the formatting toolbar while a source view is showing', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Markdown' }))

    expect(screen.getByRole('button', { name: 'Gras' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Bloc de code' })).toHaveProperty('disabled', true)
    // The view toggle itself stays reachable — otherwise there would be no way back.
    expect(screen.getByRole('button', { name: 'Texte enrichi' })).toHaveProperty('disabled', false)
  })

  it('reconciles an edit made in Markdown back into the document on blur, calling onChange', () => {
    const onChange = vi.fn()
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={onChange} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Markdown' }))
    const textbox = screen.getByRole('textbox', { name: 'Markdown' })
    fireEvent.change(textbox, { target: { value: '## A new heading' } })
    fireEvent.blur(textbox)

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        _type: 'block',
        style: 'h2',
        children: [expect.objectContaining({ text: 'A new heading' })],
      }),
    ])
  })

  it('shows the reconciled document after switching back to the rich-text view', () => {
    const onChange = vi.fn()
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={onChange} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Markdown' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), {
      target: { value: 'a whole new paragraph' },
    })

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Texte enrichi' }))

    expect(screen.getByText('a whole new paragraph')).toBeDefined()
    expect(screen.queryByText('hello world')).toBeNull()
  })

  it('round-trips through HTML and back to Markdown without going through the rich view, staying in sync with the same model', () => {
    render(<RichTextEditor id="body" value={SIMPLE_DOC} onChange={vi.fn()} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Markdown' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), {
      target: { value: '**bold word**' },
    })

    fireEvent.mouseDown(screen.getByRole('button', { name: 'HTML' }))
    expect((screen.getByRole('textbox', { name: 'HTML' }) as HTMLTextAreaElement).value).toBe(
      '<p><strong>bold word</strong></p>',
    )
  })
})
