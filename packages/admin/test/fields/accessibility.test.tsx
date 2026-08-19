import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldInput } from '../../src/fields/field-input.js'
import type { SchemaField } from '../../src/schema/types.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'

/**
 * The automated half of fiche 03 task 5's accessibility requirement:
 * axe-core on each new field, and reordering operable by keyboard alone —
 * which `blocks-field.test.tsx` already established means "a real, labelled
 * `<button>`", the same standard applied here.
 */

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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('accessibility — the new fields of fiche 03', () => {
  it('a repeater with several items has no serious axe-core violation', async () => {
    const { container } = render(
      <FieldInput
        id="items"
        field={field('json', {
          options: {
            list: true,
            items: [
              { name: 'value', kind: 'text', required: true, localized: false, options: {} },
              { name: 'label', kind: 'text', required: true, localized: false, options: {} },
            ],
          },
        })}
        value={[
          { _key: 'k1', value: '10k+', label: 'Sites' },
          { _key: 'k2', value: '99.9%', label: 'Disponibilité' },
        ]}
        onChange={vi.fn()}
      />,
    )
    await expectNoSeriousA11yViolations(container)
  })

  it('a many-valued select with chosen tokens and a checkbox list has no serious axe-core violation', async () => {
    const { container } = render(
      <FieldInput
        id="tags"
        field={field('select', {
          options: {
            many: true,
            options: [{ value: 'fiction' }, { value: 'essay' }, { value: 'poetry' }],
          },
        })}
        value={['fiction']}
        onChange={vi.fn()}
      />,
    )
    await expectNoSeriousA11yViolations(container)
  })

  it('a geo field with the map hidden (the default, R1/R2) has no serious axe-core violation', async () => {
    const { container } = render(
      <FieldInput
        id="location"
        field={field('geo')}
        value={{ lat: 48.85, lng: 2.35 }}
        onChange={vi.fn()}
      />,
    )
    await expectNoSeriousA11yViolations(container)
  })

  it('a color field with the swatch, native picker and text input has no serious axe-core violation', async () => {
    const { container } = render(
      <FieldInput id="tint" field={field('color')} value="#112233" onChange={vi.fn()} />,
    )
    await expectNoSeriousA11yViolations(container)
  })

  it('a required text field with a character counter has no serious axe-core violation', async () => {
    const { container } = render(
      <FieldInput
        id="title"
        field={field('text', { required: true, options: { max: 80 }, default: 'x' })}
        value="hello"
        onChange={vi.fn()}
      />,
    )
    await expectNoSeriousA11yViolations(container)
  })
})

describe('accessibility — reordering is keyboard-operable, never drag-only', () => {
  it('a repeater exposes real, labelled move buttons alongside drag-and-drop', () => {
    render(
      <FieldInput
        id="items"
        field={field('json', {
          options: {
            list: true,
            items: [{ name: 'label', kind: 'text', required: true, localized: false, options: {} }],
          },
        })}
        value={[
          { _key: 'k1', label: 'A' },
          { _key: 'k2', label: 'B' },
        ]}
        onChange={vi.fn()}
      />,
    )

    // Every reorder button is a real `<button>` with an accessible name
    // naming the position — reachable by Tab, activatable by Enter/Space,
    // with no drag gesture required.
    expect(screen.getByRole('button', { name: "Descendre l'élément 1" }).tagName).toBe('BUTTON')
    expect(screen.getByRole('button', { name: "Monter l'élément 2" }).tagName).toBe('BUTTON')
  })
})
