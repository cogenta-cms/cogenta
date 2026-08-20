import { describe, expect, it } from 'vitest'
import type { FormDefinition, FormFieldDefinition } from '../src/types.js'
import { validateDefinitionFields, validateSubmission } from '../src/validate.js'

function definition(fields: readonly FormFieldDefinition[]): FormDefinition {
  return {
    id: 'form-1',
    name: 'contact',
    label: 'Contact',
    fields,
    active: true,
    confirmationMessage: 'Thanks',
    redirectTo: null,
    notifyEmails: [],
    autoresponder: { enabled: false },
    retainDays: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('validateSubmission — server-side, independent of the client', () => {
  it('requires a required field', () => {
    const def = definition([{ name: 'email', label: 'E-mail', kind: 'email', required: true }])
    expect(() => validateSubmission(def, {})).toThrow(/is required/)
  })

  it('accepts an absent optional field', () => {
    const def = definition([{ name: 'phone', label: 'Phone', kind: 'phone', required: false }])
    expect(validateSubmission(def, {}).values).toEqual({})
  })

  it('rejects a malformed e-mail address, whatever the client thought', () => {
    const def = definition([{ name: 'email', label: 'E-mail', kind: 'email', required: true }])
    expect(() => validateSubmission(def, { email: 'not-an-email' })).toThrow()
  })

  it('lower-cases a valid e-mail address', () => {
    const def = definition([{ name: 'email', label: 'E-mail', kind: 'email', required: true }])
    expect(validateSubmission(def, { email: 'Visitor@Example.COM' }).values.email).toBe(
      'visitor@example.com',
    )
  })

  it('rejects a phone number with letters', () => {
    const def = definition([{ name: 'phone', label: 'Phone', kind: 'phone', required: true }])
    expect(() => validateSubmission(def, { phone: 'not-a-phone-abc' })).toThrow()
  })

  it('accepts a real-shaped phone number', () => {
    const def = definition([{ name: 'phone', label: 'Phone', kind: 'phone', required: true }])
    expect(validateSubmission(def, { phone: '+1 (555) 123-4567' }).values.phone).toBe(
      '+1 (555) 123-4567',
    )
  })

  it('rejects a number that is not numeric', () => {
    const def = definition([{ name: 'age', label: 'Age', kind: 'number', required: true }])
    expect(() => validateSubmission(def, { age: 'abc' })).toThrow()
  })

  it('rejects a date that does not parse', () => {
    const def = definition([{ name: 'when', label: 'When', kind: 'date', required: true }])
    expect(() => validateSubmission(def, { when: 'not-a-date' })).toThrow()
  })

  it('rejects a single choice not in the offered list', () => {
    const def = definition([
      {
        name: 'size',
        label: 'Size',
        kind: 'choiceSingle',
        required: true,
        choices: ['s', 'm', 'l'],
      },
    ])
    expect(() => validateSubmission(def, { size: 'xl' })).toThrow()
  })

  it('accepts a valid single choice', () => {
    const def = definition([
      {
        name: 'size',
        label: 'Size',
        kind: 'choiceSingle',
        required: true,
        choices: ['s', 'm', 'l'],
      },
    ])
    expect(validateSubmission(def, { size: 'm' }).values.size).toBe('m')
  })

  it('rejects a multi-choice value not offered', () => {
    const def = definition([
      {
        name: 'topics',
        label: 'Topics',
        kind: 'choiceMulti',
        required: true,
        choices: ['a', 'b'],
      },
    ])
    expect(() => validateSubmission(def, { topics: ['a', 'z'] })).toThrow()
  })

  it('accepts valid multi-choice values', () => {
    const def = definition([
      {
        name: 'topics',
        label: 'Topics',
        kind: 'choiceMulti',
        required: true,
        choices: ['a', 'b'],
      },
    ])
    expect(validateSubmission(def, { topics: ['a', 'b'] }).values.topics).toEqual(['a', 'b'])
  })

  it('requires a required consent to be truthy', () => {
    const def = definition([
      { name: 'agree', label: 'Consent', kind: 'consent', required: true, consentText: 'I agree.' },
    ])
    expect(() => validateSubmission(def, { agree: 'false' })).toThrow(
      expect.objectContaining({ code: 'FORM_CONSENT_REQUIRED' }),
    )
  })

  it('records the consent wording verbatim, with a timestamp', () => {
    const def = definition([
      { name: 'agree', label: 'Consent', kind: 'consent', required: true, consentText: 'I agree.' },
    ])
    const now = () => Date.parse('2026-03-01T00:00:00.000Z')
    const outcome = validateSubmission(def, { agree: 'true' }, now)
    expect(outcome.consents).toEqual([
      { fieldName: 'agree', text: 'I agree.', agreedAt: '2026-03-01T00:00:00.000Z' },
    ])
  })

  it('never stores a key the definition does not declare', () => {
    const def = definition([{ name: 'email', label: 'E-mail', kind: 'email', required: true }])
    expect(() => validateSubmission(def, { email: 'a@b.com', extra: 'sneaky' })).toThrow(
      /is not a field on this form/,
    )
  })

  it('ignores underscore-prefixed anti-abuse fields rather than rejecting them as unknown', () => {
    const def = definition([{ name: 'email', label: 'E-mail', kind: 'email', required: true }])
    const outcome = validateSubmission(def, { email: 'a@b.com', _gotcha: '', _ts: '123' })
    expect(outcome.values).toEqual({ email: 'a@b.com' })
  })

  it('refuses a submission to a disabled form', () => {
    const def = {
      ...definition([{ name: 'email', label: 'E-mail', kind: 'email', required: true }]),
      active: false,
    }
    expect(() => validateSubmission(def, { email: 'a@b.com' })).toThrow(
      expect.objectContaining({ code: 'FORM_DISABLED' }),
    )
  })

  it('rejects an XSS payload as a plain string value, without executing or stripping it — storage is not rendering', () => {
    const def = definition([
      { name: 'message', label: 'Message', kind: 'longText', required: true },
    ])
    const payload = '<script>alert(1)</script>'
    const outcome = validateSubmission(def, { message: payload })
    // Stored verbatim: the admin's own React rendering is what must escape
    // it on display (tested separately in the admin package), not this layer.
    expect(outcome.values.message).toBe(payload)
  })
})

describe('validateDefinitionFields', () => {
  it('refuses an empty field list', () => {
    expect(() => validateDefinitionFields([])).toThrow()
  })

  it('refuses a duplicate field name', () => {
    expect(() =>
      validateDefinitionFields([
        { name: 'email', label: 'A', kind: 'email', required: true },
        { name: 'email', label: 'B', kind: 'text', required: false },
      ]),
    ).toThrow(/used more than once/)
  })

  it('refuses a choice field with no choices', () => {
    expect(() =>
      validateDefinitionFields([
        { name: 'size', label: 'Size', kind: 'choiceSingle', required: true },
      ]),
    ).toThrow(/at least one choice/)
  })

  it('refuses a consent field with no wording', () => {
    expect(() =>
      validateDefinitionFields([
        { name: 'agree', label: 'Consent', kind: 'consent', required: true },
      ]),
    ).toThrow(/consent wording/)
  })
})
