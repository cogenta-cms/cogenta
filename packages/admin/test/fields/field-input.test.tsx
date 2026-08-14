import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FieldInput } from '../../src/fields/field-input.js'
import type { SchemaField } from '../../src/schema/types.js'

function field(kind: SchemaField['kind'], overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    name: 'field-name',
    kind,
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options: {},
    ...overrides,
  }
}

describe('FieldInput — text', () => {
  it('renders a labelled text input and reports changes', () => {
    const onChange = vi.fn()
    render(
      <FieldInput
        id="title"
        field={field('text', { admin: { label: 'Titre' } })}
        value="hello"
        onChange={onChange}
      />,
    )

    const input = screen.getByLabelText('Titre') as HTMLInputElement
    expect(input.value).toBe('hello')
    fireEvent.change(input, { target: { value: 'world' } })
    expect(onChange).toHaveBeenCalledWith('world')
  })

  it('renders a textarea when the field is marked multiline', () => {
    render(
      <FieldInput
        id="body"
        field={field('text', { options: { multiline: true } })}
        value=""
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('field-name').tagName).toBe('TEXTAREA')
  })

  it('shows the required marker for a required field', () => {
    render(
      <FieldInput
        id="title"
        field={field('text', { required: true })}
        value=""
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('field-name', { exact: false })).toHaveProperty('required', true)
  })
})

describe('FieldInput — number', () => {
  it('reports a numeric change and clears to null on an empty input', () => {
    const onChange = vi.fn()
    render(<FieldInput id="rating" field={field('number')} value={3} onChange={onChange} />)

    const input = screen.getByLabelText('field-name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith(5)

    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('FieldInput — boolean', () => {
  it('renders a checkbox whose label follows the control', () => {
    const onChange = vi.fn()
    render(<FieldInput id="featured" field={field('boolean')} value={false} onChange={onChange} />)

    const checkbox = screen.getByLabelText('field-name') as HTMLInputElement
    expect(checkbox.type).toBe('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('FieldInput — select', () => {
  it('lists the declared choices and reports the chosen value', () => {
    const onChange = vi.fn()
    render(
      <FieldInput
        id="status"
        field={field('select', {
          options: {
            options: [
              { value: 'draft', label: 'Brouillon' },
              { value: 'live', label: 'En ligne' },
            ],
          },
        })}
        value=""
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('field-name'), { target: { value: 'live' } })
    expect(onChange).toHaveBeenCalledWith('live')
    expect(screen.getByRole('option', { name: 'Brouillon' })).toBeDefined()
  })

  it('refuses to render an editor for a many-valued select, rather than editing it wrong', () => {
    render(
      <FieldInput
        id="tags"
        field={field('select', { options: { options: [], many: true } })}
        value={[]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeDefined()
  })
})

describe('FieldInput — datetime', () => {
  it('round-trips an ISO instant through the local datetime input', () => {
    const onChange = vi.fn()
    render(
      <FieldInput
        id="published-at"
        field={field('datetime')}
        value="2026-03-05T10:00:00.000Z"
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('field-name') as HTMLInputElement
    expect(input.value.length).toBeGreaterThan(0)

    fireEvent.change(input, { target: { value: '2026-03-06T09:30' } })
    expect(onChange).toHaveBeenCalledWith(new Date('2026-03-06T09:30').toISOString())
  })

  it('leaves an empty value empty, not "Invalid Date"', () => {
    render(<FieldInput id="published-at" field={field('datetime')} value="" onChange={vi.fn()} />)
    expect((screen.getByLabelText('field-name') as HTMLInputElement).value).toBe('')
  })
})

describe('FieldInput — json', () => {
  it('commits a value once it parses as JSON', () => {
    const onChange = vi.fn()
    render(<FieldInput id="meta" field={field('json')} value={{ a: 1 }} onChange={onChange} />)

    const textarea = screen.getByLabelText('field-name')
    fireEvent.change(textarea, { target: { value: '{"a":2}' } })
    expect(onChange).toHaveBeenCalledWith({ a: 2 })
  })

  it('reports invalid JSON without calling onChange', () => {
    const onChange = vi.fn()
    render(<FieldInput id="meta" field={field('json')} value={{}} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('field-name'), { target: { value: '{not json' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeDefined()
  })
})

describe('FieldInput — deferred kinds', () => {
  it('shows an honest placeholder for media, relation and blocks', () => {
    render(<FieldInput id="cover" field={field('media')} value={null} onChange={vi.fn()} />)
    expect(screen.getByText(/Médiathèque à venir/)).toBeDefined()
  })

  it("names the target collection in the relation field's placeholder", () => {
    render(
      <FieldInput
        id="author"
        field={field('relation', { options: { to: 'author' } })}
        value={null}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/« author »/)).toBeDefined()
  })
})
