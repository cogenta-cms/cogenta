import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContentBlock } from '../../src/api/content-client.js'
import { BlocksField } from '../../src/fields/blocks-field.js'
import type { SchemaField } from '../../src/schema/types.js'

const FIELD: SchemaField = {
  name: 'body',
  kind: 'blocks',
  required: false,
  localized: false,
  unique: false,
  hasCustomValidation: false,
  options: {},
}

describe('BlocksField', () => {
  it('adds a block from the vocabulary picker', () => {
    const onChange = vi.fn()
    render(<BlocksField id="body" field={FIELD} value={[]} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Ajouter un bloc'), { target: { value: 'quote' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    const call = onChange.mock.calls[0]
    if (call === undefined) throw new Error('expected onChange to have been called')
    const [added] = call[0] as readonly ContentBlock[]
    expect(added?.type).toBe('quote')
    expect(added?.data).toEqual({})
    expect(typeof added?.key).toBe('string')
  })

  it("renders a placed block's own typed fields and reports edits", () => {
    const onChange = vi.fn()
    const blocks: ContentBlock[] = [{ key: 'k1', type: 'quote', data: { text: 'hello' } }]
    render(<BlocksField id="body" field={FIELD} value={blocks} onChange={onChange} />)

    expect(screen.getByText('Citation', { selector: 'span' })).toBeDefined()
    const textInput = screen.getByLabelText('text', { exact: false }) as HTMLInputElement
    expect(textInput.value).toBe('hello')

    fireEvent.change(textInput, { target: { value: 'updated' } })
    expect(onChange).toHaveBeenCalledWith([{ key: 'k1', type: 'quote', data: { text: 'updated' } }])
  })

  it('reorders a block up and down, disabling the button at each end', () => {
    const onChange = vi.fn()
    const blocks: ContentBlock[] = [
      { key: 'a', type: 'quote', data: {} },
      { key: 'b', type: 'prose', data: {} },
    ]
    render(<BlocksField id="body" field={FIELD} value={blocks} onChange={onChange} />)

    expect(screen.getByLabelText('Monter le bloc 1')).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Descendre le bloc 2')).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByLabelText('Descendre le bloc 1'))
    expect(onChange).toHaveBeenCalledWith([
      { key: 'b', type: 'prose', data: {} },
      { key: 'a', type: 'quote', data: {} },
    ])
  })

  it('removes a block', () => {
    const onChange = vi.fn()
    const blocks: ContentBlock[] = [
      { key: 'a', type: 'quote', data: {} },
      { key: 'b', type: 'prose', data: {} },
    ]
    render(<BlocksField id="body" field={FIELD} value={blocks} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Retirer le bloc 1'))
    expect(onChange).toHaveBeenCalledWith([{ key: 'b', type: 'prose', data: {} }])
  })

  it('flags a block whose type is outside the vocabulary, without discarding its data', () => {
    const onChange = vi.fn()
    const blocks: ContentBlock[] = [{ key: 'a', type: 'themeCustomHero', data: { foo: 'bar' } }]
    render(<BlocksField id="body" field={FIELD} value={blocks} onChange={onChange} />)

    expect(screen.getByRole('alert').textContent).toMatch(/themeCustomHero/)
    fireEvent.click(screen.getByLabelText('Retirer le bloc 1'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('hides the add picker and disables every control when disabled', () => {
    const blocks: ContentBlock[] = [{ key: 'a', type: 'quote', data: {} }]
    render(<BlocksField id="body" field={FIELD} value={blocks} onChange={vi.fn()} disabled />)

    expect(screen.queryByLabelText('Ajouter un bloc')).toBeNull()
    expect(screen.getByLabelText('Retirer le bloc 1')).toHaveProperty('disabled', true)
  })
})
