import { CogentaError } from '@cogenta/core'
import type { FormFieldCondition, FormFieldDefinition } from './types.js'

/**
 * Fiche 47 task 1 — conditional logic, evaluated server-side against the raw
 * submitted values (never the typed/validated ones: visibility must be
 * decidable before a masked field's own value is even looked at). No
 * JavaScript is required for this to be correct — see `validate.ts`'s
 * `isFieldVisible` call inside `validateSubmission`: a field whose condition
 * is unmet is simply never required or validated, whether or not a browser
 * ever toggled anything on screen.
 */

function rawAsList(raw: unknown): readonly string[] {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map((entry) => String(entry))
  return [String(raw)]
}

function isBlank(values: readonly string[]): boolean {
  return values.length === 0 || values.every((value) => value.trim() === '')
}

/** Evaluates one condition against a raw (pre-validation) submission body. */
export function evaluateCondition(
  condition: FormFieldCondition,
  rawValues: Readonly<Record<string, unknown>>,
): boolean {
  const actual = rawAsList(rawValues[condition.field])
  const wanted = condition.value ?? ''

  switch (condition.operator) {
    case 'equals':
      return actual.includes(wanted)
    case 'notEquals':
      return !actual.includes(wanted)
    case 'contains':
      return actual.some((value) => value.includes(wanted))
    case 'isEmpty':
      return isBlank(actual)
    case 'isNotEmpty':
      return !isBlank(actual)
    default: {
      const exhaustive: never = condition.operator
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${String(exhaustive)}" is not a condition operator.`,
        hint: 'Use one of: equals, notEquals, contains, isEmpty, isNotEmpty.',
      })
    }
  }
}

/** `true` when `field` has no `showIf` (always visible) or its condition holds against `rawValues`. */
export function isFieldVisible(
  field: FormFieldDefinition,
  rawValues: Readonly<Record<string, unknown>>,
): boolean {
  if (field.showIf === undefined) return true
  return evaluateCondition(field.showIf, rawValues)
}
