import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldWrapper } from '../../src/fields/field-wrapper.js'
import type { SchemaField } from '../../src/schema/types.js'

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    name: 'internalCode',
    kind: 'text',
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options: {},
    ...overrides,
  }
}

/**
 * Fiche 01 audit T02 — the fallback label when a field declares no
 * `admin.label`.
 */
describe('FieldWrapper label fallback', () => {
  it('humanises the raw field name when admin.label is absent', () => {
    render(
      <FieldWrapper id="internal-code" field={field()}>
        <input id="internal-code" />
      </FieldWrapper>,
    )

    expect(screen.getByLabelText('Internal Code')).toBeDefined()
    expect(screen.queryByText('internalCode')).toBeNull()
  })

  it('shows admin.label unchanged when the schema declares one — no regression for a configured site', () => {
    render(
      <FieldWrapper id="internal-code" field={field({ admin: { label: 'Mon titre' } })}>
        <input id="internal-code" />
      </FieldWrapper>,
    )

    expect(screen.getByLabelText('Mon titre')).toBeDefined()
  })
})
