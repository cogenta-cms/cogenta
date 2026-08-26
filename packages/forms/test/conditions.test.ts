import { describe, expect, it } from 'vitest'
import { evaluateCondition, isFieldVisible } from '../src/conditions.js'
import type { FormFieldDefinition } from '../src/types.js'

describe('evaluateCondition', () => {
  it('equals matches the exact submitted value', () => {
    expect(
      evaluateCondition({ field: 'plan', operator: 'equals', value: 'pro' }, { plan: 'pro' }),
    ).toBe(true)
    expect(
      evaluateCondition({ field: 'plan', operator: 'equals', value: 'pro' }, { plan: 'free' }),
    ).toBe(false)
  })

  it('notEquals is the exact negation of equals', () => {
    expect(
      evaluateCondition({ field: 'plan', operator: 'notEquals', value: 'pro' }, { plan: 'free' }),
    ).toBe(true)
    expect(
      evaluateCondition({ field: 'plan', operator: 'notEquals', value: 'pro' }, { plan: 'pro' }),
    ).toBe(false)
  })

  it('contains matches a substring of a single value', () => {
    expect(
      evaluateCondition(
        { field: 'message', operator: 'contains', value: 'urgent' },
        { message: 'this is urgent, please help' },
      ),
    ).toBe(true)
  })

  it('contains matches across a choiceMulti array', () => {
    expect(
      evaluateCondition(
        { field: 'topics', operator: 'contains', value: 'billing' },
        { topics: ['support', 'billing'] },
      ),
    ).toBe(true)
  })

  it('isEmpty is true for an absent, blank, or empty-array value', () => {
    const condition = { field: 'other', operator: 'isEmpty' } as const
    expect(evaluateCondition(condition, {})).toBe(true)
    expect(evaluateCondition(condition, { other: '' })).toBe(true)
    expect(evaluateCondition(condition, { other: '   ' })).toBe(true)
    expect(evaluateCondition(condition, { other: [] })).toBe(true)
    expect(evaluateCondition(condition, { other: 'something' })).toBe(false)
  })

  it('isNotEmpty is the exact negation of isEmpty', () => {
    const condition = { field: 'other', operator: 'isNotEmpty' } as const
    expect(evaluateCondition(condition, { other: 'something' })).toBe(true)
    expect(evaluateCondition(condition, {})).toBe(false)
  })
})

describe('isFieldVisible', () => {
  const controlling: FormFieldDefinition = {
    name: 'contactMethod',
    label: 'How should we reach you?',
    kind: 'choiceSingle',
    required: true,
    choices: ['email', 'phone'],
  }

  it('is always visible when the field has no showIf', () => {
    expect(isFieldVisible(controlling, {})).toBe(true)
  })

  it('is visible only when its condition holds against the raw submission', () => {
    const phoneField: FormFieldDefinition = {
      name: 'phone',
      label: 'Phone number',
      kind: 'phone',
      required: true,
      showIf: { field: 'contactMethod', operator: 'equals', value: 'phone' },
    }
    expect(isFieldVisible(phoneField, { contactMethod: 'phone' })).toBe(true)
    expect(isFieldVisible(phoneField, { contactMethod: 'email' })).toBe(false)
    // Not even present in the submission — still evaluated, not "visible by default".
    expect(isFieldVisible(phoneField, {})).toBe(false)
  })
})
