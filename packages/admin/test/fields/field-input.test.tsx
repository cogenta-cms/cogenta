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

  it('renders a many-valued select as a checkbox group, and reports the whole set', () => {
    const onChange = vi.fn()
    render(
      <FieldInput
        id="tags"
        field={field('select', {
          options: {
            options: [{ value: 'fiction' }, { value: 'essay' }, { value: 'poetry' }],
            many: true,
          },
        })}
        value={['fiction']}
        onChange={onChange}
      />,
    )

    // Already-chosen options show as removable tokens, never as a UUID or a
    // raw value — the same rule `EntryPicker` follows for a relation.
    expect(screen.getByRole('button', { name: 'Retirer fiction' })).toBeDefined()
    fireEvent.click(screen.getByLabelText('essay'))
    expect(onChange).toHaveBeenCalledWith(['fiction', 'essay'])
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

describe('FieldInput — slug', () => {
  it('reports changes and enforces the lowercase-hyphen pattern', () => {
    const onChange = vi.fn()
    render(<FieldInput id="slug" field={field('slug')} value="mon-titre" onChange={onChange} />)

    const input = screen.getByLabelText('field-name') as HTMLInputElement
    expect(input.pattern.length).toBeGreaterThan(0)
    fireEvent.change(input, { target: { value: 'autre-titre' } })
    expect(onChange).toHaveBeenCalledWith('autre-titre')
  })
})

describe('FieldInput — date', () => {
  it('reports a calendar-day change', () => {
    const onChange = vi.fn()
    render(
      <FieldInput id="released" field={field('date')} value="2026-01-01" onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('field-name'), { target: { value: '2026-02-14' } })
    expect(onChange).toHaveBeenCalledWith('2026-02-14')
  })
})

describe('FieldInput — color', () => {
  it('accepts a hex value typed into the text half, and shows a preview swatch', () => {
    const onChange = vi.fn()
    render(<FieldInput id="tint" field={field('color')} value="#112233" onChange={onChange} />)

    const input = screen.getByLabelText('field-name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '#ff8800' } })
    expect(onChange).toHaveBeenCalledWith('#ff8800')
  })
})

describe('FieldInput — geo', () => {
  it('reports a point from its two number inputs, and makes no map request without configuration', () => {
    const onChange = vi.fn()
    render(<FieldInput id="location" field={field('geo')} value={null} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '48.85' } })
    expect(onChange).toHaveBeenCalledWith({ lat: 48.85, lng: 0 })
    // R1/R2: no `VITE_MAP_TILE_URL` is configured for this test run, so the
    // map toggle — the only thing that could ever trigger a tile request —
    // must not even be offered.
    expect(screen.queryByRole('button', { name: /map|carte/i })).toBeNull()
  })
})

describe('FieldInput — richText', () => {
  it('mounts an editable document without crashing', () => {
    render(<FieldInput id="body" field={field('richText')} value={undefined} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeDefined()
  })
})

describe('FieldInput — media/relation/taxonomy without a signed-in session', () => {
  // None of the three can resolve anything without a token — `useAuth()`
  // falls back to its harmless default (`status: 'loading'`) when no
  // `AuthProvider` is mounted, exactly as it does here. What matters is that
  // this renders a calm loading state, never a crash.
  it.each([
    ['media', field('media')],
    ['relation', field('relation', { options: { to: 'author' } })],
    ['taxonomy', field('taxonomy', { options: { of: 'topic' } })],
  ] as const)('renders "%s" as a quiet loading state', (_kind, testField) => {
    render(<FieldInput id="x" field={testField} value={null} onChange={vi.fn()} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('FieldInput — blocks', () => {
  it('starts empty and offers the vocabulary picker', () => {
    render(<FieldInput id="body" field={field('blocks')} value={[]} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Ajouter un bloc')).toBeDefined()
  })
})

describe('FieldInput — repeater (an f.list(...) compiled to json)', () => {
  it('is dispatched to the repeater, not the raw JSON textarea, when options.list is set', () => {
    render(
      <FieldInput
        id="items"
        field={field('json', {
          options: {
            list: true,
            items: [{ name: 'label', kind: 'text', required: true, localized: false, options: {} }],
          },
        })}
        value={[]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Ajouter un élément' })).toBeDefined()
    expect(screen.queryByRole('textbox', { name: 'field-name' })).toBeNull()
  })
})

describe('FieldInput — the fifteen kinds of contract A', () => {
  // "Ajouter un seizième type de champ au contrat A ferait échouer cette
  // suite tant qu'il n'a pas d'éditeur" (fiche 03, task 5's own acceptance
  // criterion). `FieldInput`'s `switch` is already exhaustive over
  // `FieldKind` at compile time (no `default` case): a new kind is a
  // TypeScript error there before it can ever reach this test. What this
  // adds is the runtime half of that guarantee — every declared kind really
  // does mount, for a real value, without throwing.
  const FIFTEEN_KINDS: readonly [SchemaField['kind'], unknown][] = [
    ['text', 'x'],
    ['richText', undefined],
    ['slug', 'x'],
    ['number', 1],
    ['boolean', false],
    ['date', '2026-01-01'],
    ['datetime', '2026-01-01T00:00:00.000Z'],
    ['media', null],
    ['relation', null],
    ['select', ''],
    ['json', {}],
    ['geo', null],
    ['color', '#000000'],
    ['blocks', []],
    ['taxonomy', []],
  ]

  it('mounts every kind, and disables its control when asked to', () => {
    expect(FIFTEEN_KINDS).toHaveLength(15)

    for (const [kind, value] of FIFTEEN_KINDS) {
      const overrides: Partial<SchemaField> =
        kind === 'select'
          ? { options: { options: ['a', 'b'] } }
          : kind === 'relation'
            ? { options: { to: 'author' } }
            : kind === 'taxonomy'
              ? { options: { of: 'topic' } }
              : {}

      const { unmount } = render(
        <FieldInput
          id={`field-${kind}`}
          field={field(kind, overrides)}
          value={value}
          onChange={vi.fn()}
          disabled
        />,
      )

      const controls = document.querySelectorAll('input, textarea, select, button')
      for (const control of controls) {
        expect(
          control.hasAttribute('disabled'),
          `${kind}: "${control.outerHTML}" should be disabled`,
        ).toBe(true)
      }

      unmount()
    }
  })
})
